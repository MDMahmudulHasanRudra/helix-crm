using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Email;

public record InboundResult(EmailMessage Message, Guid? TicketId);

/// <summary>
/// Imports mail from each active mailbox. Replies match by headers first and by the
/// [#TCK-…] subject token second; anything else lands in the review queue.
/// </summary>
public class InboundEmailService(
    HelixDbContext db,
    SecretProtector secrets,
    IEmailTransport transport,
    ILogger<InboundEmailService> logger)
{
    public async Task<int> PollAsync(CancellationToken ct = default)
    {
        var accounts = await db.EmailAccounts
            .Where(a => a.IsActive && a.ImapEnabled)
            .OrderByDescending(a => a.IsDefault)
            .ToListAsync(ct);

        var processed = 0;
        foreach (var account in accounts)
        {
            ct.ThrowIfCancellationRequested();
            var password = secrets.TryUnprotect(account.ImapPasswordCipher);
            if (!string.IsNullOrWhiteSpace(account.ImapUsername) && string.IsNullOrWhiteSpace(password))
            {
                logger.LogWarning("Skipping mailbox {AccountId}: IMAP password could not be decrypted.", account.Id);
                continue;
            }

            try
            {
                var fetch = await transport.FetchAsync(account, password, account.LastImapUid, 50, ct);
                uint? advanced = account.LastImapUid;
                foreach (var mail in fetch.Messages)
                {
                    await IngestAsync(account, mail, ct);
                    processed++;
                    if (uint.TryParse(mail.Uid, out var uid))
                        advanced = Math.Max(advanced ?? 0, uid);
                }

                if (fetch.Messages.Count == 0 && fetch.MaxUid is not null)
                    advanced = Math.Max(advanced ?? 0, fetch.MaxUid.Value);

                account.LastImapUid = advanced;
                account.LastImapSyncAt = DateTime.UtcNow;
                account.LastError = null;
                await db.SaveChangesAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                account.LastError = Trim(ex.Message);
                logger.LogError(ex, "IMAP polling failed for mailbox {AccountId}.", account.Id);
                await db.SaveChangesAsync(ct);
            }
        }

        return processed;
    }

    public async Task<InboundResult> IngestAsync(EmailAccount account, InboundMail mail, CancellationToken ct = default)
    {
        var messageId = string.IsNullOrWhiteSpace(mail.MessageId) ? null : mail.MessageId;
        var existing = await FindExistingAsync(account, mail, messageId, ct);
        if (existing is not null)
            return new InboundResult(existing, existing.RelatedType == EntityTypes.Ticket ? existing.RelatedId : null);

        var fromAddress = EmailAddresses.Normalize(mail.FromAddress) ?? mail.FromAddress.Trim().ToLowerInvariant();
        var contact = fromAddress.Length == 0
            ? null
            : await db.Contacts.AsNoTracking()
                .FirstOrDefaultAsync(c => c.Email != null && c.Email.ToLower() == fromAddress, ct);

        var ticket = await ResolveTicketAsync(mail, ct);
        var received = mail.ReceivedAt == default ? DateTime.UtcNow : mail.ReceivedAt;

        var message = new EmailMessage
        {
            OrganizationId = account.OrganizationId,
            EmailAccountId = account.Id,
            Direction = EmailDirection.Inbound,
            Status = ticket is null ? EmailStatus.Review : EmailStatus.Received,
            FromAddress = fromAddress.Clean(254),
            FromName = mail.FromName.Clean(120),
            ToAddress = EmailAddresses.Normalize(mail.ToAddress) ?? mail.ToAddress.Clean(254),
            Subject = EmailThreading.Subject(mail.Subject).Clean(400),
            TextBody = mail.TextBody?.Clean(100_000),
            HtmlBody = mail.HtmlBody?.Clean(100_000),
            MessageId = messageId,
            InReplyTo = mail.InReplyTo,
            References = mail.References,
            ContactId = contact?.Id,
            RelatedType = ticket is null ? null : EntityTypes.Ticket,
            RelatedId = ticket?.Id,
            NeedsReview = ticket is null,
            ImapFolder = mail.Folder.Clean(200),
            ImapUid = mail.Uid.Clean(40),
            ReceivedAt = received,
            CreatedAt = received
        };

        if (ticket is not null)
        {
            var activity = BuildActivity(message, ticket, received);
            db.Activities.Add(activity);
            message.ActivityId = activity.Id;
            if (ticket.ContactId is null && contact is not null) ticket.ContactId = contact.Id;
        }

        db.EmailMessages.Add(message);
        await db.SaveChangesAsync(ct);
        return new InboundResult(message, ticket?.Id);
    }

    public async Task<InboundResult> LinkAsync(Guid messageId, Guid ticketId, CancellationToken ct = default)
    {
        var message = await db.EmailMessages
            .FirstOrDefaultAsync(m => m.Id == messageId && m.Direction == EmailDirection.Inbound, ct)
            ?? throw new ApiException(404, "Inbound email not found.");

        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId, ct)
            ?? throw new ApiException(404, "Ticket not found.");

        if (message.ActivityId is null)
        {
            var activity = BuildActivity(message, ticket, message.ReceivedAt ?? message.CreatedAt);
            db.Activities.Add(activity);
            message.ActivityId = activity.Id;
        }

        message.RelatedType = EntityTypes.Ticket;
        message.RelatedId = ticket.Id;
        message.NeedsReview = false;
        message.Status = EmailStatus.Received;
        if (ticket.ContactId is null && message.ContactId is not null) ticket.ContactId = message.ContactId;

        await db.SaveChangesAsync(ct);
        return new InboundResult(message, ticket.Id);
    }

    public async Task DismissAsync(Guid messageId, CancellationToken ct = default)
    {
        var message = await db.EmailMessages
            .FirstOrDefaultAsync(m => m.Id == messageId && m.Direction == EmailDirection.Inbound, ct)
            ?? throw new ApiException(404, "Inbound email not found.");

        message.NeedsReview = false;
        message.Status = EmailStatus.Dismissed;
        await db.SaveChangesAsync(ct);
    }

    private async Task<EmailMessage?> FindExistingAsync(
        EmailAccount account, InboundMail mail, string? messageId, CancellationToken ct)
    {
        if (messageId is not null)
        {
            var byHeader = await db.EmailMessages.AsNoTracking()
                .FirstOrDefaultAsync(m => m.Direction == EmailDirection.Inbound && m.MessageId == messageId, ct);
            if (byHeader is not null) return byHeader;
        }

        return await db.EmailMessages.AsNoTracking()
            .FirstOrDefaultAsync(m => m.Direction == EmailDirection.Inbound
                && m.EmailAccountId == account.Id
                && m.ImapFolder == mail.Folder
                && m.ImapUid == mail.Uid, ct);
    }

    private async Task<Ticket?> ResolveTicketAsync(InboundMail mail, CancellationToken ct)
    {
        var headerIds = new List<string>();
        if (!string.IsNullOrWhiteSpace(mail.InReplyTo)) headerIds.Add(mail.InReplyTo);
        headerIds.AddRange((mail.References ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries));

        if (headerIds.Count > 0)
        {
            var parent = await db.EmailMessages.AsNoTracking()
                .Where(m => m.Direction == EmailDirection.Outbound
                    && m.RelatedType == EntityTypes.Ticket
                    && m.RelatedId != null
                    && m.MessageId != null
                    && headerIds.Contains(m.MessageId))
                .OrderByDescending(m => m.CreatedAt)
                .FirstOrDefaultAsync(ct);

            if (parent?.RelatedId is Guid ticketId)
            {
                var byHeader = await db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId, ct);
                if (byHeader is not null) return byHeader;
            }
        }

        var number = EmailThreading.TryTicketNumber(mail.Subject);
        if (number is not null)
        {
            var byToken = await db.Tickets.FirstOrDefaultAsync(t => t.Number == number, ct);
            if (byToken is not null) return byToken;
        }

        // No guessing from the sender: an unmatched message must be reviewed by a human.
        return null;
    }

    private static Activity BuildActivity(EmailMessage message, Ticket ticket, DateTime received) => new()
    {
        OrganizationId = message.OrganizationId,
        Type = ActivityType.Email,
        Subject = message.Subject.Clean(240),
        Body = message.TextBody ?? message.HtmlBody,
        RelatedType = EntityTypes.Ticket,
        RelatedId = ticket.Id,
        Status = ActivityStatus.Completed,
        CompletedAt = received,
        CreatedAt = received,
        Priority = "Normal",
        OwnerId = ticket.AssigneeId,
        EmailMessageId = message.Id
    };

    private static string? Trim(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Length > 1000 ? value[..1000] : value;
}
