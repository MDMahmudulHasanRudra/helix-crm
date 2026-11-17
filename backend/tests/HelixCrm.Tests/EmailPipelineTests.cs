using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using HelixCrm.Api.Features.Email;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace HelixCrm.Tests;

public class EmailPipelineTests
{
    private sealed class FakeTenant(Guid organizationId, Guid? userId = null) : ITenantProvider
    {
        public Guid OrganizationId { get; } = organizationId;
        public Guid? UserId { get; } = userId;
        public string? UserName => "Test User";
        public string? Role => Roles.Admin;
    }

    private sealed class FakeTransport : IEmailTransport
    {
        public Func<EmailAccount, OutboundMail, Task>? OnSend { get; set; }
        public List<OutboundMail> Sent { get; } = [];

        public Task SendAsync(EmailAccount account, string? smtpPassword, OutboundMail mail, CancellationToken ct = default)
        {
            Sent.Add(mail);
            return OnSend?.Invoke(account, mail) ?? Task.CompletedTask;
        }

        public Task<EmailAccountCheck> CheckAsync(
            EmailAccount account, string? smtpPassword, string? imapPassword, CancellationToken ct = default) =>
            Task.FromResult(new EmailAccountCheck(true, null, true, null));

        public Task<InboundFetch> FetchAsync(
            EmailAccount account, string? imapPassword, uint? lastUid, int limit, CancellationToken ct = default) =>
            Task.FromResult(new InboundFetch([], lastUid));
    }

    private static HelixDbContext CreateContext(string database, Guid organizationId) =>
        new(new DbContextOptionsBuilder<HelixDbContext>()
            .UseInMemoryDatabase(database)
            .Options, new FakeTenant(organizationId));

    private static SecretProtector Protector() =>
        new(new EphemeralDataProtectionProvider());

    private static async Task<(Organization Organization, EmailAccount Account, Contact Contact, Ticket Ticket)>
        SeedAsync(HelixDbContext db, Guid organizationId)
    {
        var organization = new Organization { Id = organizationId, Name = "Acme", Slug = $"acme-{Guid.NewGuid():N}" };
        var account = new EmailAccount
        {
            OrganizationId = organization.Id,
            Name = "Support",
            FromName = "Acme Support",
            FromAddress = "support@acme.test",
            SmtpHost = "smtp.acme.test",
            IsActive = true,
            IsDefault = true
        };
        var contact = new Contact
        {
            OrganizationId = organization.Id,
            FirstName = "Dana",
            LastName = "Lee",
            Email = "dana@example.com"
        };
        var ticket = new Ticket
        {
            OrganizationId = organization.Id,
            Number = "T-1001",
            Subject = "Printer down",
            ContactId = contact.Id,
            Status = TicketStatus.Open
        };

        db.Organizations.Add(organization);
        db.EmailAccounts.Add(account);
        db.Contacts.Add(contact);
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();
        return (organization, account, contact, ticket);
    }

    [Fact]
    public async Task Enqueue_AddsTicketTokenAndThreadsTheNextMessage()
    {
        var database = Guid.NewGuid().ToString();
        var organizationId = Guid.NewGuid();
        string messageId;

        await using (var db = CreateContext(database, organizationId))
        {
            var (_, _, contact, ticket) = await SeedAsync(db, organizationId);

            var outbox = new EmailOutbox(db);
            var first = await outbox.EnqueueAsync(new NewEmail(
                contact.Email!, contact.FullName, ticket.Subject, "We are looking into it.",
                RelatedType: EntityTypes.Ticket, RelatedId: ticket.Id, ContactId: contact.Id));

            Assert.StartsWith("Re: ", first.Subject);
            Assert.Contains("[#TCK-1001]", first.Subject);
            Assert.Equal(EmailStatus.Queued, first.Status);
            Assert.StartsWith("<", first.MessageId);
            Assert.EndsWith("@acme.test>", first.MessageId);
            Assert.Null(first.InReplyTo);

            var second = await outbox.EnqueueAsync(new NewEmail(
                contact.Email!, contact.FullName, "Printer down", "Any update?",
                RelatedType: EntityTypes.Ticket, RelatedId: ticket.Id, ContactId: contact.Id));

            Assert.Equal(first.MessageId, second.InReplyTo);
            Assert.Contains(first.MessageId!, second.References);
            messageId = first.MessageId!;
        }

        Assert.False(string.IsNullOrWhiteSpace(messageId));
    }

    [Fact]
    public async Task Enqueue_RejectsSuppressedRecipientsAndMissingAccounts()
    {
        var database = Guid.NewGuid().ToString();
        var organizationId = Guid.NewGuid();
        await using var db = CreateContext(database, organizationId);
        var (organization, account, contact, ticket) = await SeedAsync(db, organizationId);
        var outbox = new EmailOutbox(db);

        db.EmailSuppressions.Add(new EmailSuppression
        {
            OrganizationId = organization.Id,
            Email = "dana@example.com",
            Reason = EmailSuppressionReason.Unsubscribed
        });
        await db.SaveChangesAsync();

        var blocked = await Assert.ThrowsAsync<ApiException>(() => outbox.EnqueueAsync(new NewEmail(
            contact.Email!, contact.FullName, "Hello", "Body",
            RelatedType: EntityTypes.Ticket, RelatedId: ticket.Id)));
        Assert.Equal(409, blocked.StatusCode);
        Assert.Contains("suppression", blocked.Message);

        db.EmailSuppressions.RemoveRange(db.EmailSuppressions);
        account.IsActive = false;
        await db.SaveChangesAsync();

        var missing = await Assert.ThrowsAsync<ApiException>(() => outbox.EnqueueAsync(new NewEmail(
            contact.Email!, contact.FullName, "Hello", "Body",
            RelatedType: EntityTypes.Ticket, RelatedId: ticket.Id)));
        Assert.Equal(409, missing.StatusCode);
        Assert.Contains("email account", missing.Message);
    }

    [Fact]
    public async Task Dispatch_SendsQueuedMailAndHonoursTheDailyCap()
    {
        var database = Guid.NewGuid().ToString();
        var organizationId = Guid.NewGuid();
        await using var db = CreateContext(database, organizationId);
        var (organization, _, contact, ticket) = await SeedAsync(db, organizationId);
        var outbox = new EmailOutbox(db);
        var transport = new FakeTransport();
        var dispatch = new EmailDispatchService(db, Protector(), transport, NullLogger<EmailDispatchService>.Instance);

        var message = await outbox.EnqueueAsync(new NewEmail(
            contact.Email!, contact.FullName, ticket.Subject, "Body",
            RelatedType: EntityTypes.Ticket, RelatedId: ticket.Id));

        var sent = await dispatch.DispatchAsync();

        Assert.Equal(1, sent);
        Assert.Single(transport.Sent);
        Assert.Equal(EmailStatus.Sent, message.Status);
        Assert.NotNull(message.SentAt);
        Assert.Contains("[#TCK-1001]", transport.Sent[0].Subject);

        // The cap counts sends across the whole workspace for the current UTC day.
        organization.EmailDailyLimit = 1;
        await db.SaveChangesAsync();
        var blocked = await outbox.EnqueueAsync(new NewEmail(
            contact.Email!, contact.FullName, "Second", "Body"));
        Assert.Equal(0, await dispatch.DispatchAsync());
        Assert.Equal(EmailStatus.Queued, blocked.Status);
    }

    [Fact]
    public async Task Dispatch_SkipsSuppressedMailAndRetriesTransientFailures()
    {
        var database = Guid.NewGuid().ToString();
        var organizationId = Guid.NewGuid();
        await using var db = CreateContext(database, organizationId);
        var (organization, _, contact, ticket) = await SeedAsync(db, organizationId);
        var outbox = new EmailOutbox(db);
        var transport = new FakeTransport();
        var dispatch = new EmailDispatchService(db, Protector(), transport, NullLogger<EmailDispatchService>.Instance);

        var suppressed = await outbox.EnqueueAsync(new NewEmail(
            contact.Email!, contact.FullName, "Suppressed", "Body",
            RelatedType: EntityTypes.Ticket, RelatedId: ticket.Id));
        db.EmailSuppressions.Add(new EmailSuppression
        {
            OrganizationId = organization.Id,
            Email = "dana@example.com",
            Reason = EmailSuppressionReason.Unsubscribed
        });
        await db.SaveChangesAsync();

        await dispatch.DispatchAsync();

        Assert.Equal(EmailStatus.Suppressed, suppressed.Status);
        Assert.Empty(transport.Sent);

        db.EmailSuppressions.RemoveRange(db.EmailSuppressions);
        await db.SaveChangesAsync();
        transport.OnSend = (_, _) => throw new IOException("SMTP is down");

        var retried = await outbox.EnqueueAsync(new NewEmail(
            contact.Email!, contact.FullName, "Retry me", "Body"));
        await dispatch.DispatchAsync();

        Assert.Equal(EmailStatus.Queued, retried.Status);
        Assert.Equal(1, retried.Attempts);
        Assert.NotNull(retried.NextAttemptAt);
        Assert.Contains("SMTP is down", retried.FailureReason);
    }

    [Fact]
    public async Task Inbound_HeaderMatchCreatesTicketActivity_AndDeduplicates()
    {
        var database = Guid.NewGuid().ToString();
        var organizationId = Guid.NewGuid();
        await using var db = CreateContext(database, organizationId);
        var (_, account, contact, ticket) = await SeedAsync(db, organizationId);
        var outbound = new EmailMessage
        {
            OrganizationId = account.OrganizationId,
            EmailAccountId = account.Id,
            Direction = EmailDirection.Outbound,
            Status = EmailStatus.Sent,
            FromAddress = account.FromAddress,
            ToAddress = contact.Email!,
            Subject = "Re: Printer down [#TCK-1001]",
            MessageId = "<out-1@acme.test>",
            RelatedType = EntityTypes.Ticket,
            RelatedId = ticket.Id,
            SentAt = DateTime.UtcNow
        };
        db.EmailMessages.Add(outbound);
        await db.SaveChangesAsync();

        var service = new InboundEmailService(db, Protector(), new FakeTransport(),
            NullLogger<InboundEmailService>.Instance);
        var mail = new InboundMail(
            "<in-1@example.com>", "<out-1@acme.test>", "<out-1@acme.test>",
            "dana@example.com", "Dana Lee", "support@acme.test",
            "Re: Printer down", "It is fixed now.", null, DateTime.UtcNow, "INBOX", "42");

        var result = await service.IngestAsync(account, mail);

        Assert.Equal(ticket.Id, result.TicketId);
        Assert.Equal(EmailStatus.Received, result.Message.Status);
        Assert.False(result.Message.NeedsReview);
        Assert.NotNull(result.Message.ActivityId);

        var activity = await db.Activities.SingleAsync(a => a.EmailMessageId == result.Message.Id);
        Assert.Equal(EntityTypes.Ticket, activity.RelatedType);
        Assert.Equal(ticket.Id, activity.RelatedId);

        var again = await service.IngestAsync(account, mail);
        Assert.Equal(result.Message.Id, again.Message.Id);
        Assert.Equal(1, await db.EmailMessages.CountAsync(m => m.Direction == EmailDirection.Inbound));
        Assert.Equal(1, await db.Activities.CountAsync(a => a.EmailMessageId == result.Message.Id));
    }

    [Fact]
    public async Task Inbound_UsesSubjectTokenThenFallsBackToReview()
    {
        var database = Guid.NewGuid().ToString();
        var organizationId = Guid.NewGuid();
        await using var db = CreateContext(database, organizationId);
        var (_, account, _, ticket) = await SeedAsync(db, organizationId);
        var service = new InboundEmailService(db, Protector(), new FakeTransport(),
            NullLogger<InboundEmailService>.Instance);

        var token = await service.IngestAsync(account, new InboundMail(
            "<token@example.com>", null, null, "dana@example.com", "Dana", "support@acme.test",
            "Re: Printer down [#TCK-1001]", "Token matched.", null, DateTime.UtcNow, "INBOX", "43"));
        Assert.Equal(ticket.Id, token.TicketId);

        var orphan = await service.IngestAsync(account, new InboundMail(
            "<orphan@example.com>", null, null, "stranger@example.com", "Stranger", "support@acme.test",
            "Unrelated question", "Who are you?", null, DateTime.UtcNow, "INBOX", "44"));
        Assert.Null(orphan.TicketId);
        Assert.True(orphan.Message.NeedsReview);
        Assert.Equal(EmailStatus.Review, orphan.Message.Status);
        Assert.Null(orphan.Message.ActivityId);
    }
}
