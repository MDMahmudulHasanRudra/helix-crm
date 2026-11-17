using HelixCrm.Api.Domain;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Net.Smtp;
using MailKit.Search;
using MailKit.Security;
using MimeKit;

namespace HelixCrm.Api.Features.Email;

public record OutboundMail(
    string FromAddress, string FromName, string ToAddress, string ToName,
    string? Cc, string? Bcc, string Subject, string? TextBody, string? HtmlBody,
    string MessageId, string? InReplyTo, string? References);

public record EmailAccountCheck(bool SmtpOk, string? SmtpError, bool ImapOk, string? ImapError);

public record InboundMail(
    string MessageId, string? InReplyTo, string? References,
    string FromAddress, string FromName, string ToAddress,
    string Subject, string? TextBody, string? HtmlBody,
    DateTime ReceivedAt, string Folder, string Uid);

public record InboundFetch(IReadOnlyList<InboundMail> Messages, uint? MaxUid);

public interface IEmailTransport
{
    Task SendAsync(EmailAccount account, string? smtpPassword, OutboundMail mail, CancellationToken ct = default);
    Task<EmailAccountCheck> CheckAsync(EmailAccount account, string? smtpPassword, string? imapPassword, CancellationToken ct = default);
    Task<InboundFetch> FetchAsync(EmailAccount account, string? imapPassword, uint? lastUid, int limit, CancellationToken ct = default);
}

/// <summary>Plain SMTP/IMAP transport. Provider adapters can replace this later.</summary>
public class MailKitEmailTransport : IEmailTransport
{
    public async Task SendAsync(EmailAccount account, string? smtpPassword, OutboundMail mail, CancellationToken ct = default)
    {
        var message = BuildMessage(mail);

        using var client = new SmtpClient();
        await client.ConnectAsync(account.SmtpHost, account.SmtpPort, Security(account.SmtpSecurity), ct);
        if (!string.IsNullOrWhiteSpace(account.SmtpUsername))
        {
            if (string.IsNullOrWhiteSpace(smtpPassword))
                throw new InvalidOperationException("SMTP password is missing or could not be decrypted.");
            await client.AuthenticateAsync(account.SmtpUsername, smtpPassword, ct);
        }
        await client.SendAsync(message, ct);
        await client.DisconnectAsync(true, ct);
    }

    public async Task<EmailAccountCheck> CheckAsync(
        EmailAccount account, string? smtpPassword, string? imapPassword, CancellationToken ct = default)
    {
        string? smtpError = null;
        string? imapError = null;
        var smtpOk = false;
        var imapOk = false;

        try
        {
            if (string.IsNullOrWhiteSpace(account.SmtpHost))
            {
                smtpError = "SMTP host is not set.";
            }
            else
            {
                using var client = new SmtpClient();
                await client.ConnectAsync(account.SmtpHost, account.SmtpPort, Security(account.SmtpSecurity), ct);
                if (!string.IsNullOrWhiteSpace(account.SmtpUsername))
                {
                    if (string.IsNullOrWhiteSpace(smtpPassword))
                        throw new InvalidOperationException("SMTP password is missing or could not be decrypted.");
                    await client.AuthenticateAsync(account.SmtpUsername, smtpPassword, ct);
                }
                await client.DisconnectAsync(true, ct);
                smtpOk = true;
            }
        }
        catch (Exception ex)
        {
            smtpError = Trim(ex.Message, 500);
        }

        try
        {
            if (!account.ImapEnabled || string.IsNullOrWhiteSpace(account.ImapHost))
            {
                imapError = account.ImapEnabled ? "IMAP host is not set." : null;
            }
            else
            {
                using var client = new ImapClient();
                await client.ConnectAsync(account.ImapHost, account.ImapPort, Security(account.ImapSecurity), ct);
                if (!string.IsNullOrWhiteSpace(account.ImapUsername))
                {
                    if (string.IsNullOrWhiteSpace(imapPassword))
                        throw new InvalidOperationException("IMAP password is missing or could not be decrypted.");
                    await client.AuthenticateAsync(account.ImapUsername, imapPassword, ct);
                }
                var folder = string.IsNullOrWhiteSpace(account.ImapFolder)
                    ? client.Inbox
                    : await client.GetFolderAsync(account.ImapFolder, ct);
                await folder.OpenAsync(FolderAccess.ReadOnly, ct);
                await folder.CloseAsync(false, ct);
                await client.DisconnectAsync(true, ct);
                imapOk = true;
            }
        }
        catch (Exception ex)
        {
            imapError = Trim(ex.Message, 500);
        }

        return new EmailAccountCheck(smtpOk, smtpError, imapOk, imapError);
    }

    public async Task<InboundFetch> FetchAsync(
        EmailAccount account, string? imapPassword, uint? lastUid, int limit, CancellationToken ct = default)
    {
        if (!account.ImapEnabled || string.IsNullOrWhiteSpace(account.ImapHost))
            return new InboundFetch([], lastUid);

        using var client = new ImapClient();
        await client.ConnectAsync(account.ImapHost, account.ImapPort, Security(account.ImapSecurity), ct);
        if (!string.IsNullOrWhiteSpace(account.ImapUsername))
        {
            if (string.IsNullOrWhiteSpace(imapPassword))
                throw new InvalidOperationException("IMAP password is missing or could not be decrypted.");
            await client.AuthenticateAsync(account.ImapUsername, imapPassword, ct);
        }

        var folderName = string.IsNullOrWhiteSpace(account.ImapFolder) ? "INBOX" : account.ImapFolder;
        var folder = folderName == "INBOX" ? client.Inbox : await client.GetFolderAsync(folderName, ct);
        await folder.OpenAsync(FolderAccess.ReadOnly, ct);

        // DeliveredAfter narrows the search; the UID filter below is what actually
        // prevents re-import. A first run only records the high-water mark.
        var since = lastUid is null ? DateTime.UtcNow.AddDays(-1) : DateTime.UtcNow.AddDays(-30);
        var uids = (await folder.SearchAsync(SearchQuery.DeliveredAfter(since), ct))
            .OrderBy(u => u.Id)
            .ToList();

        var maxUid = uids.Count > 0 ? uids.Max(u => u.Id) : lastUid;
        if (lastUid is null)
        {
            await folder.CloseAsync(false, ct);
            await client.DisconnectAsync(true, ct);
            return new InboundFetch([], maxUid);
        }

        var messages = new List<InboundMail>();
        foreach (var uid in uids.Where(u => u.Id > lastUid).Take(Math.Clamp(limit, 1, 200)))
        {
            var message = await folder.GetMessageAsync(uid, ct);
            messages.Add(Parse(message, folderName, uid.Id.ToString()));
        }

        await folder.CloseAsync(false, ct);
        await client.DisconnectAsync(true, ct);
        return new InboundFetch(messages, maxUid);
    }

    internal static MimeMessage BuildMessage(OutboundMail mail)
    {
        var message = new MimeMessage
        {
            Date = DateTimeOffset.UtcNow,
            Subject = mail.Subject,
            MessageId = TrimBrackets(mail.MessageId)
        };

        message.From.Add(new MailboxAddress(mail.FromName, mail.FromAddress));
        message.To.Add(new MailboxAddress(mail.ToName ?? "", mail.ToAddress));
        AddAddresses(message.Cc, mail.Cc);
        AddAddresses(message.Bcc, mail.Bcc);

        if (!string.IsNullOrWhiteSpace(mail.InReplyTo))
            message.InReplyTo = TrimBrackets(mail.InReplyTo);
        foreach (var reference in (mail.References ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (message.References.Count >= 20) break;
            message.References.Add(TrimBrackets(reference));
        }

        var body = new BodyBuilder { TextBody = mail.TextBody ?? "" };
        if (!string.IsNullOrWhiteSpace(mail.HtmlBody)) body.HtmlBody = mail.HtmlBody;
        message.Body = body.ToMessageBody();
        return message;
    }

    private static void AddAddresses(InternetAddressList target, string? raw)
    {
        foreach (var value in (raw ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (MailboxAddress.TryParse(value, out var mailbox)) target.Add(mailbox);
        }
    }

    private static InboundMail Parse(MimeMessage message, string folder, string uid)
    {
        var from = message.From.Mailboxes.FirstOrDefault();
        var to = message.To.Mailboxes.FirstOrDefault();
        var references = string.Join(' ', message.References.Select(r => NormalizeId(r)).Where(r => r is not null));
        var received = message.Date == default ? DateTime.UtcNow : message.Date.UtcDateTime;

        return new InboundMail(
            NormalizeId(message.MessageId) ?? "",
            NormalizeId(message.InReplyTo),
            references.Length == 0 ? null : references,
            from?.Address ?? "",
            from?.Name ?? "",
            to?.Address ?? "",
            message.Subject ?? "",
            message.TextBody,
            message.HtmlBody,
            received,
            folder,
            uid);
    }

    internal static string? NormalizeId(string? id)
    {
        var value = TrimBrackets(id);
        return value.Length == 0 ? null : $"<{value}>";
    }

    internal static string TrimBrackets(string? id) => (id ?? "").Trim().Trim('<', '>').Trim();

    private static SecureSocketOptions Security(string? value) => value switch
    {
        EmailSecurity.SslOnConnect => SecureSocketOptions.SslOnConnect,
        EmailSecurity.None => SecureSocketOptions.None,
        _ => SecureSocketOptions.StartTls
    };

    private static string? Trim(string? value, int max) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Length > max ? value[..max] : value;
}
