using System.Text.RegularExpressions;
using MimeKit;

namespace HelixCrm.Api.Features.Email;

/// <summary>Subject tokens and RFC 5322 message identifiers used for threading.</summary>
public static partial class EmailThreading
{
    [GeneratedRegex(@"\[#TCK-(\d+)\]", RegexOptions.IgnoreCase)]
    private static partial Regex TicketToken();

    [GeneratedRegex(@"\[(T-\d+)\]", RegexOptions.IgnoreCase)]
    private static partial Regex NumberToken();

    /// <summary>Maps a subject token back to the stored ticket number, e.g. [#TCK-1001] → T-1001.</summary>
    public static string? TryTicketNumber(string? subject)
    {
        if (string.IsNullOrWhiteSpace(subject)) return null;

        var ticket = TicketToken().Match(subject);
        if (ticket.Success) return $"T-{ticket.Groups[1].Value}";

        var number = NumberToken().Match(subject);
        return number.Success ? number.Groups[1].Value.ToUpperInvariant() : null;
    }

    /// <summary>Adds the reply token so a reply that loses its headers can still be matched.</summary>
    public static string WithTicketToken(string subject, string ticketNumber)
    {
        var clean = subject.Trim();
        if (!clean.StartsWith("re:", StringComparison.OrdinalIgnoreCase)) clean = $"Re: {clean}";

        var digits = ticketNumber.StartsWith("T-", StringComparison.OrdinalIgnoreCase)
            ? ticketNumber[2..]
            : ticketNumber;
        var token = $"[#TCK-{digits}]";
        if (!clean.Contains(token, StringComparison.OrdinalIgnoreCase))
            clean = $"{clean} {token}";

        return clean.Length > 400 ? clean[..400] : clean;
    }

    public static string NewMessageId(string fromAddress)
    {
        var at = fromAddress.LastIndexOf('@');
        var domain = at >= 0 && at < fromAddress.Length - 1 ? fromAddress[(at + 1)..] : "helix.local";
        return $"<{Guid.NewGuid():N}@{domain}>";
    }

    public static string Subject(string? subject) =>
        string.IsNullOrWhiteSpace(subject) ? "(no subject)" : subject.Trim();
}

public static class EmailAddresses
{
    /// <summary>Returns a validated, lower-cased address suitable for storage and suppression checks.</summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!MailboxAddress.TryParse(value.Trim(), out var mailbox)) return null;
        var address = mailbox.Address?.Trim().ToLowerInvariant();
        return address is { Length: > 2 } && address.Contains('@') ? address : null;
    }

    public static IEnumerable<string> Split(string? raw) =>
        (raw ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(Normalize)
            .Where(x => x is not null)
            .Cast<string>();
}
