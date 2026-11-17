using HelixCrm.Api.Domain;

namespace HelixCrm.Api.Features.Email;

public record EmailAccountDto(
    Guid Id, string Name, string FromName, string FromAddress, string? ReplyToAddress,
    string SmtpHost, int SmtpPort, string SmtpSecurity, string SmtpUsername, bool HasSmtpPassword,
    string ImapHost, int ImapPort, string ImapSecurity, string ImapUsername, bool HasImapPassword,
    string ImapFolder, bool ImapEnabled, bool IsActive, bool IsDefault,
    DateTime? LastVerifiedAt, string? LastError, DateTime? LastImapSyncAt, uint? LastImapUid);

public record EmailMessageDto(
    Guid Id, string Direction, string Status, string FromAddress, string FromName,
    string ToAddress, string ToName, string Subject, string? Preview, string? MessageId,
    string? InReplyTo, string? RelatedType, Guid? RelatedId, string? RelatedName, Guid? ContactId,
    int Attempts, DateTime? NextAttemptAt, DateTime? SentAt, DateTime? ReceivedAt,
    string? FailureReason, bool NeedsReview, bool HasActivity, DateTime CreatedAt);

public static class EmailMapper
{
    public static EmailAccountDto Account(EmailAccount account) => new(
        account.Id, account.Name, account.FromName, account.FromAddress, account.ReplyToAddress,
        account.SmtpHost, account.SmtpPort, account.SmtpSecurity, account.SmtpUsername,
        !string.IsNullOrWhiteSpace(account.SmtpPasswordCipher),
        account.ImapHost, account.ImapPort, account.ImapSecurity, account.ImapUsername,
        !string.IsNullOrWhiteSpace(account.ImapPasswordCipher),
        account.ImapFolder, account.ImapEnabled, account.IsActive, account.IsDefault,
        account.LastVerifiedAt, account.LastError, account.LastImapSyncAt, account.LastImapUid);

    public static EmailMessageDto Message(EmailMessage message, string? relatedName = null) => new(
        message.Id, message.Direction, message.Status, message.FromAddress, message.FromName,
        message.ToAddress, message.ToName, message.Subject, Preview(message), message.MessageId,
        message.InReplyTo, message.RelatedType, message.RelatedId, relatedName, message.ContactId,
        message.Attempts, message.NextAttemptAt, message.SentAt, message.ReceivedAt,
        message.FailureReason, message.NeedsReview, message.ActivityId is not null, message.CreatedAt);

    private static string? Preview(EmailMessage message)
    {
        var body = message.TextBody ?? message.HtmlBody;
        if (string.IsNullOrWhiteSpace(body)) return null;
        var flat = string.Join(' ', body.Split(['\r', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries));
        return flat.Length > 180 ? $"{flat[..180]}…" : flat;
    }
}
