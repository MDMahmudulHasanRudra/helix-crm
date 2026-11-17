using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Email;

public record NewEmail(
    string ToAddress,
    string? ToName,
    string Subject,
    string TextBody,
    string? HtmlBody = null,
    string? RelatedType = null,
    Guid? RelatedId = null,
    Guid? ContactId = null,
    Guid? EmailAccountId = null,
    string? Cc = null,
    string? Bcc = null);

/// <summary>
/// Writes messages into the durable outbox. Nothing is sent on the request thread;
/// <see cref="EmailDispatchService"/> delivers later and records the outcome.
/// </summary>
public class EmailOutbox(HelixDbContext db)
{
    public async Task<EmailMessage> EnqueueAsync(NewEmail email, CancellationToken ct = default)
    {
        var organization = await db.GetCurrentOrganizationAsync(ct);
        var to = EmailAddresses.Normalize(email.ToAddress)
            ?? throw new ApiException(400, "A valid recipient email address is required.");

        await EnsureNotSuppressedAsync([to, .. EmailAddresses.Split(email.Cc), .. EmailAddresses.Split(email.Bcc)], ct);

        var account = await ResolveAccountAsync(email.EmailAccountId, ct)
            ?? throw new ApiException(409, "No active email account is configured. Add one under Settings → Email.");

        var from = EmailAddresses.Normalize(account.FromAddress)
            ?? throw new ApiException(409, "The email account has no valid from address.");

        var message = new EmailMessage
        {
            OrganizationId = organization.Id,
            EmailAccountId = account.Id,
            Direction = EmailDirection.Outbound,
            Status = EmailStatus.Queued,
            FromAddress = from,
            FromName = Clean(account.FromName, 120),
            ToAddress = to,
            ToName = Clean(email.ToName, 120),
            Cc = JoinAddresses(email.Cc),
            Bcc = JoinAddresses(email.Bcc),
            Subject = EmailThreading.Subject(email.Subject).Clean(400),
            TextBody = email.TextBody.Clean(100_000),
            HtmlBody = email.HtmlBody?.Clean(100_000),
            MessageId = EmailThreading.NewMessageId(from),
            RelatedType = email.RelatedType.Clean(30) is { Length: > 0 } relatedType ? relatedType : null,
            RelatedId = email.RelatedId,
            ContactId = email.ContactId,
            NextAttemptAt = DateTime.UtcNow
        };

        await ApplyThreadAsync(message, ct);
        await ApplyTicketTokenAsync(message, ct);

        db.EmailMessages.Add(message);
        await db.SaveChangesAsync(ct);
        return message;
    }

    public async Task<bool> IsSuppressedAsync(string address, CancellationToken ct = default)
    {
        var normalized = EmailAddresses.Normalize(address);
        return normalized is not null
            && await db.EmailSuppressions.AsNoTracking().AnyAsync(s => s.Email == normalized, ct);
    }

    private async Task EnsureNotSuppressedAsync(IReadOnlyCollection<string> addresses, CancellationToken ct)
    {
        if (addresses.Count == 0) return;
        var blocked = await db.EmailSuppressions.AsNoTracking()
            .Where(s => addresses.Contains(s.Email))
            .Select(s => s.Email)
            .FirstOrDefaultAsync(ct);
        if (blocked is not null)
            throw new ApiException(409, $"{blocked} is on the suppression list and cannot be emailed.");
    }

    private async Task<EmailAccount?> ResolveAccountAsync(Guid? accountId, CancellationToken ct)
    {
        if (accountId is not null)
            return await db.EmailAccounts.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == accountId && a.IsActive, ct);

        return await db.EmailAccounts.AsNoTracking()
            .Where(a => a.IsActive)
            .OrderByDescending(a => a.IsDefault)
            .ThenBy(a => a.CreatedAt)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>Sets In-Reply-To/References from the earlier messages on the same record.</summary>
    private async Task ApplyThreadAsync(EmailMessage message, CancellationToken ct)
    {
        if (message.RelatedType is null || message.RelatedId is null) return;

        var ids = await db.EmailMessages.AsNoTracking()
            .Where(m => m.RelatedType == message.RelatedType
                && m.RelatedId == message.RelatedId
                && m.MessageId != null)
            .OrderBy(m => m.CreatedAt)
            .Select(m => m.MessageId!)
            .ToListAsync(ct);

        var recent = ids.TakeLast(10).ToList();
        if (recent.Count == 0) return;

        message.InReplyTo = recent[^1];
        message.References = string.Join(' ', recent) is { Length: <= 4000 } refs ? refs : null;
    }

    private async Task ApplyTicketTokenAsync(EmailMessage message, CancellationToken ct)
    {
        if (message.RelatedType != EntityTypes.Ticket || message.RelatedId is not Guid ticketId) return;

        var number = await db.Tickets.AsNoTracking()
            .Where(t => t.Id == ticketId)
            .Select(t => t.Number)
            .FirstOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(number)) return;

        message.Subject = EmailThreading.WithTicketToken(message.Subject, number);
    }

    private static string? JoinAddresses(string? raw)
    {
        var addresses = EmailAddresses.Split(raw).ToList();
        return addresses.Count == 0 ? null : string.Join(", ", addresses).Clean(1000);
    }

    private static string Clean(string? value, int max)
    {
        var clean = (value ?? "").Trim();
        return clean.Length > max ? clean[..max] : clean;
    }
}
