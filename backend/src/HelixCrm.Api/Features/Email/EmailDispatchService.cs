using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using MailKit.Net.Smtp;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Email;

/// <summary>
/// Delivers queued mail for the current organisation. A failure is recorded on the
/// message and retried with backoff, never thrown back into the caller's request.
/// </summary>
public class EmailDispatchService(
    HelixDbContext db,
    SecretProtector secrets,
    IEmailTransport transport,
    ILogger<EmailDispatchService> logger)
{
    private static readonly TimeSpan[] Backoff =
    [
        TimeSpan.FromMinutes(1),
        TimeSpan.FromMinutes(5),
        TimeSpan.FromMinutes(30),
        TimeSpan.FromHours(2),
        TimeSpan.FromHours(6)
    ];

    public async Task<int> DispatchAsync(CancellationToken ct = default)
    {
        var organization = await db.GetCurrentOrganizationAsync(ct);
        var limit = organization.EmailDailyLimit <= 0 ? 300 : organization.EmailDailyLimit;
        var dayStart = DateTime.UtcNow.Date;
        var sentToday = await db.EmailMessages.CountAsync(
            m => m.Direction == EmailDirection.Outbound && m.SentAt != null && m.SentAt >= dayStart, ct);
        if (sentToday >= limit) return 0;

        var now = DateTime.UtcNow;
        var stale = now.AddMinutes(-10);
        var batch = await db.EmailMessages
            .Include(m => m.EmailAccount)
            .Where(m => m.Direction == EmailDirection.Outbound
                && (m.Status == EmailStatus.Queued
                    || (m.Status == EmailStatus.Sending && m.UpdatedAt < stale))
                && (m.NextAttemptAt == null || m.NextAttemptAt <= now))
            .OrderBy(m => m.CreatedAt)
            .Take(10)
            .ToListAsync(ct);

        var sent = 0;
        foreach (var message in batch)
        {
            ct.ThrowIfCancellationRequested();
            if (sentToday + sent >= limit) break;

            if (await IsSuppressedAsync(message.ToAddress, ct))
            {
                message.Status = EmailStatus.Suppressed;
                message.FailureReason = "Recipient is on the suppression list.";
                message.NextAttemptAt = null;
                await db.SaveChangesAsync(ct);
                continue;
            }

            var account = message.EmailAccount;
            if (account is null || !account.IsActive)
            {
                await FailAsync(message, "The sending email account is missing or inactive.", ct);
                continue;
            }

            var password = secrets.TryUnprotect(account.SmtpPasswordCipher);
            if (!string.IsNullOrWhiteSpace(account.SmtpUsername) && string.IsNullOrWhiteSpace(password))
            {
                await FailAsync(message, "The SMTP password could not be decrypted. Re-enter it in Settings → Email.", ct);
                continue;
            }

            message.Status = EmailStatus.Sending;
            message.Attempts += 1;
            message.NextAttemptAt = null;
            await db.SaveChangesAsync(ct);

            try
            {
                await transport.SendAsync(account, password, new OutboundMail(
                    message.FromAddress, message.FromName, message.ToAddress, message.ToName,
                    message.Cc, message.Bcc, message.Subject, message.TextBody, message.HtmlBody,
                    message.MessageId ?? EmailThreading.NewMessageId(message.FromAddress),
                    message.InReplyTo, message.References), ct);

                message.Status = EmailStatus.Sent;
                message.SentAt = DateTime.UtcNow;
                message.FailureReason = null;
                message.MessageId ??= EmailThreading.NewMessageId(message.FromAddress);
                sent++;
            }
            catch (SmtpCommandException ex) when ((int)ex.StatusCode is 550 or 551 or 553)
            {
                message.Status = EmailStatus.Failed;
                message.FailureReason = Trim($"{ex.StatusCode}: {ex.ResponseText}");
                await SuppressBounceAsync(message.ToAddress, message.OrganizationId, ct);
                logger.LogWarning("Mailbox rejected {Recipient} for message {MessageId}: {Reason}",
                    message.ToAddress, message.Id, message.FailureReason);
            }
            catch (SmtpCommandException ex) when ((int)ex.StatusCode is >= 500 and < 600)
            {
                message.Status = EmailStatus.Failed;
                message.FailureReason = Trim($"{ex.StatusCode}: {ex.ResponseText}");
                logger.LogWarning("Permanent SMTP failure for message {MessageId}: {Reason}", message.Id, message.FailureReason);
            }
            catch (Exception ex)
            {
                ScheduleRetry(message, ex);
            }

            await db.SaveChangesAsync(ct);
        }

        return sent;
    }

    private void ScheduleRetry(EmailMessage message, Exception ex)
    {
        message.FailureReason = Trim(ex.Message);
        if (message.Attempts >= Math.Max(1, message.MaxAttempts))
        {
            message.Status = EmailStatus.Failed;
            message.NextAttemptAt = null;
            logger.LogError(ex, "Message {MessageId} failed after {Attempts} attempts.", message.Id, message.Attempts);
            return;
        }

        var delay = Backoff[Math.Min(message.Attempts - 1, Backoff.Length - 1)];
        message.Status = EmailStatus.Queued;
        message.NextAttemptAt = DateTime.UtcNow.Add(delay);
        logger.LogWarning(ex, "Message {MessageId} attempt {Attempts} failed; retrying at {NextAttemptAt}.",
            message.Id, message.Attempts, message.NextAttemptAt);
    }

    private async Task FailAsync(EmailMessage message, string reason, CancellationToken ct)
    {
        message.Status = EmailStatus.Failed;
        message.FailureReason = reason;
        message.NextAttemptAt = null;
        await db.SaveChangesAsync(ct);
    }

    private async Task<bool> IsSuppressedAsync(string address, CancellationToken ct)
    {
        var normalized = EmailAddresses.Normalize(address);
        return normalized is not null
            && await db.EmailSuppressions.AsNoTracking().AnyAsync(s => s.Email == normalized, ct);
    }

    private async Task SuppressBounceAsync(string address, Guid organizationId, CancellationToken ct)
    {
        var normalized = EmailAddresses.Normalize(address);
        if (normalized is null) return;
        if (await db.EmailSuppressions.AnyAsync(s => s.Email == normalized, ct)) return;

        db.EmailSuppressions.Add(new EmailSuppression
        {
            OrganizationId = organizationId,
            Email = normalized,
            Reason = EmailSuppressionReason.Bounced,
            Note = "Added automatically after the mail server rejected this address."
        });
        await db.SaveChangesAsync(ct);
    }

    private static string? Trim(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Length > 1000 ? value[..1000] : value;
}
