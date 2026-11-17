using System.Net;
using System.Net.Http.Json;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.IntegrationTests;

[Collection("postgres")]
public class EmailIntegrationTests(HelixApiFixture fixture)
{
    [PostgresFact]
    public async Task AccountApi_EncryptsPasswordsAndNeverEchoesThem()
    {
        var client = await fixture.LoginAsAdminAsync();
        var address = $"support-{Guid.NewGuid():N}@acme.test";

        var response = await client.PostAsJsonAsync("/api/v1/email/accounts", new
        {
            name = "Integration mailbox",
            fromName = "Acme Support",
            fromAddress = address,
            smtpHost = "smtp.invalid",
            smtpPort = 587,
            smtpSecurity = "StartTls",
            smtpUsername = "support@acme.test",
            smtpPassword = "smtp-secret-value",
            imapHost = "imap.invalid",
            imapPort = 993,
            imapSecurity = "SslOnConnect",
            imapUsername = "support@acme.test",
            imapPassword = "imap-secret-value",
            imapFolder = "INBOX",
            imapEnabled = true,
            isDefault = true
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("smtp-secret-value", body);
        Assert.DoesNotContain("imap-secret-value", body);
        Assert.Contains("\"hasSmtpPassword\":true", body);

        var organization = await fixture.GetSeededOrganizationAsync();
        await using var db = fixture.CreateDbContext(organization.Id);
        var account = await db.EmailAccounts.SingleAsync(a => a.FromAddress == address);
        Assert.False(string.IsNullOrWhiteSpace(account.SmtpPasswordCipher));
        Assert.NotEqual("smtp-secret-value", account.SmtpPasswordCipher);
        Assert.False(string.IsNullOrWhiteSpace(account.ImapPasswordCipher));
    }

    [PostgresFact]
    public async Task TicketReply_EnqueuesThreadedEmailAndConversationEntry()
    {
        var client = await fixture.LoginAsAdminAsync();
        await EnsureAccountAsync();
        var ticketId = await CreateTicketAsync($"inbox-{Guid.NewGuid():N}@example.com");

        var response = await client.PostAsJsonAsync($"/api/v1/tickets/{ticketId}/replies", new
        {
            body = "Thanks for reporting this. We are replacing the printer.",
            @internal = false
        });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("[#TCK-", body);
        Assert.Contains("\"emailStatus\":\"Queued\"", body);

        var organization = await fixture.GetSeededOrganizationAsync();
        await using var db = fixture.CreateDbContext(organization.Id);
        var message = await db.EmailMessages
            .SingleAsync(m => m.RelatedType == EntityTypes.Ticket && m.RelatedId == ticketId);
        Assert.Equal(EmailDirection.Outbound, message.Direction);
        Assert.Equal(EmailStatus.Queued, message.Status);
        Assert.StartsWith("<", message.MessageId);
        Assert.Contains("[#TCK-", message.Subject);
        Assert.NotEqual(Guid.Empty, message.ActivityId ?? Guid.Empty);

        var activity = await db.Activities.SingleAsync(a => a.EmailMessageId == message.Id);
        Assert.Equal(EntityTypes.Ticket, activity.RelatedType);
    }

    [PostgresFact]
    public async Task Suppression_BlocksSendUntilRemoved()
    {
        var client = await fixture.LoginAsAdminAsync();
        await EnsureAccountAsync();
        var address = $"blocked-{Guid.NewGuid():N}@example.com";

        var created = await client.PostAsJsonAsync("/api/v1/email/suppressions", new
        {
            email = address,
            reason = "Unsubscribed",
            note = "Integration test"
        });
        created.EnsureSuccessStatusCode();
        var suppression = await created.Content.ReadFromJsonAsync<IdResponse>();
        Assert.NotNull(suppression);

        var blocked = await client.PostAsJsonAsync("/api/v1/email/send", new
        {
            to = address,
            subject = "Should not send",
            body = "Blocked body"
        });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Contains("suppression", await blocked.Content.ReadAsStringAsync());

        var removed = await client.DeleteAsync($"/api/v1/email/suppressions/{suppression!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);

        var subject = $"Allowed {Guid.NewGuid():N}";
        var sent = await client.PostAsJsonAsync("/api/v1/email/send", new
        {
            to = address,
            subject,
            body = "This one is queued."
        });
        Assert.Equal(HttpStatusCode.Accepted, sent.StatusCode);

        var outbox = await client.GetAsync($"/api/v1/email/outbox?search={Uri.EscapeDataString(address)}");
        outbox.EnsureSuccessStatusCode();
        Assert.Contains(subject, await outbox.Content.ReadAsStringAsync());
    }

    [PostgresFact]
    public async Task InboundReview_CanBeLinkedToATicket()
    {
        var client = await fixture.LoginAsAdminAsync();
        await EnsureAccountAsync();
        var ticketId = await CreateTicketAsync($"review-{Guid.NewGuid():N}@example.com");
        var organization = await fixture.GetSeededOrganizationAsync();

        Guid messageId;
        await using (var db = fixture.CreateDbContext(organization.Id))
        {
            var account = await db.EmailAccounts.FirstAsync(a => a.IsActive);
            var message = new EmailMessage
            {
                OrganizationId = organization.Id,
                EmailAccountId = account.Id,
                Direction = EmailDirection.Inbound,
                Status = EmailStatus.Review,
                FromAddress = "unknown@example.com",
                FromName = "Unknown Sender",
                ToAddress = account.FromAddress,
                Subject = $"Unmatched question {Guid.NewGuid():N}",
                TextBody = "Please route this to the right person.",
                MessageId = $"<in-{Guid.NewGuid():N}@example.com>",
                NeedsReview = true,
                ImapFolder = "INBOX",
                ImapUid = Guid.NewGuid().ToString("N"),
                ReceivedAt = DateTime.UtcNow
            };
            db.EmailMessages.Add(message);
            await db.SaveChangesAsync();
            messageId = message.Id;
        }

        var queue = await client.GetAsync("/api/v1/email/inbound?review=true&pageSize=200");
        queue.EnsureSuccessStatusCode();
        Assert.Contains(messageId.ToString(), await queue.Content.ReadAsStringAsync());

        var linked = await client.PostAsJsonAsync($"/api/v1/email/inbound/{messageId}/link", new { ticketId });
        linked.EnsureSuccessStatusCode();
        Assert.Contains("\"relatedType\":\"Ticket\"", await linked.Content.ReadAsStringAsync());

        await using (var db = fixture.CreateDbContext(organization.Id))
        {
            var message = await db.EmailMessages.SingleAsync(m => m.Id == messageId);
            Assert.False(message.NeedsReview);
            Assert.Equal(ticketId, message.RelatedId);
            Assert.NotNull(message.ActivityId);
            Assert.True(await db.Activities.AnyAsync(a => a.EmailMessageId == messageId));
        }
    }

    private sealed record IdResponse(Guid Id);

    private async Task EnsureAccountAsync()
    {
        var organization = await fixture.GetSeededOrganizationAsync();
        await using var db = fixture.CreateDbContext(organization.Id);
        if (await db.EmailAccounts.AnyAsync(a => a.IsActive)) return;

        db.EmailAccounts.Add(new EmailAccount
        {
            OrganizationId = organization.Id,
            Name = "Integration mailbox",
            FromName = "Acme Support",
            FromAddress = $"it-{Guid.NewGuid():N}@acme.test",
            SmtpHost = "smtp.invalid",
            IsActive = true,
            IsDefault = true
        });
        await db.SaveChangesAsync();
    }

    private async Task<Guid> CreateTicketAsync(string contactEmail)
    {
        var organization = await fixture.GetSeededOrganizationAsync();
        await using var db = fixture.CreateDbContext(organization.Id);

        var contact = new Contact
        {
            OrganizationId = organization.Id,
            FirstName = "Integration",
            LastName = "Tester",
            Email = contactEmail
        };
        var ticket = new Ticket
        {
            OrganizationId = organization.Id,
            Number = $"T-{Random.Shared.Next(100000, 999999)}",
            Subject = $"Integration printer issue {Guid.NewGuid():N}",
            ContactId = contact.Id,
            Status = TicketStatus.Open
        };

        db.Contacts.Add(contact);
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();
        return ticket.Id;
    }
}
