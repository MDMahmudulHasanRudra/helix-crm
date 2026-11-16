using System.Globalization;
using System.Text;

namespace HelixCrm.Api.Common;

/// <summary>
/// String normalisation and fuzzy-matching helpers used by the self-healing
/// data hygiene worker (deduplication) and the lead scoring engine.
/// </summary>
public static class Similarity
{
    private static readonly HashSet<string> LegalSuffixes = new(StringComparer.OrdinalIgnoreCase)
    {
        "inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation", "company", "co",
        "gmbh", "ag", "sa", "sas", "sarl", "bv", "nv", "plc", "llp", "lp", "pte", "pty",
        "oy", "ab", "as", "aps", "spa", "srl", "kg", "ug", "holding", "holdings", "group"
    };

    private static readonly HashSet<string> FreeMailDomains = new(StringComparer.OrdinalIgnoreCase)
    {
        "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com",
        "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de",
        "mail.com", "yandex.com", "yandex.ru", "zoho.com"
    };

    private static readonly Dictionary<string, string> DomainTypos = new(StringComparer.OrdinalIgnoreCase)
    {
        ["gmial.com"] = "gmail.com",
        ["gmal.com"] = "gmail.com",
        ["gmai.com"] = "gmail.com",
        ["gmail.co"] = "gmail.com",
        ["gnail.com"] = "gmail.com",
        ["gmail.con"] = "gmail.com",
        ["yaho.com"] = "yahoo.com",
        ["yahoo.co"] = "yahoo.com",
        ["hotmial.com"] = "hotmail.com",
        ["hotmai.com"] = "hotmail.com",
        ["outlok.com"] = "outlook.com",
        ["outlook.co"] = "outlook.com",
        ["icloud.co"] = "icloud.com"
    };

    /// <summary>Lower-case, strip accents and punctuation (keeping digits and spaces).</summary>
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var ch in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            var lower = char.ToLowerInvariant(ch);
            builder.Append(char.IsLetterOrDigit(lower) ? lower : ' ');
        }
        return CollapseSpaces(builder.ToString());
    }

    /// <summary>
    /// Normalises a company name and removes legal suffixes so "Acme Corporation,
    /// Inc." and "Acme Corp" collapse to the same tokens.
    /// </summary>
    public static string NormalizeCompany(string? value)
    {
        var normalized = Normalize(value);
        if (normalized.Length == 0) return "";
        var tokens = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(token => !LegalSuffixes.Contains(token))
            .ToArray();
        return tokens.Length > 0 ? string.Join(' ', tokens) : normalized;
    }

    public static string NormalizePerson(string? first, string? last) =>
        CollapseSpaces($"{Normalize(first)} {Normalize(last)}");

    public static string NormalizePhoneDigits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var digits = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (char.IsDigit(ch)) digits.Append(ch);
        }
        // Compare the meaningful tail, so "+1 (415) 555-0100" matches "4155550100".
        var result = digits.ToString();
        return result.Length > 10 ? result[^10..] : result;
    }

    public static string NormalizeEmail(string? value) => (value ?? "").Trim().ToLowerInvariant();

    public static string EmailDomain(string? email)
    {
        var normalized = NormalizeEmail(email);
        var at = normalized.LastIndexOf('@');
        return at >= 0 && at < normalized.Length - 1 ? normalized[(at + 1)..] : "";
    }

    public static bool IsFreeMailDomain(string? email) =>
        FreeMailDomains.Contains(EmailDomain(email));

    public static string FixEmailDomainTypo(string? email)
    {
        var normalized = NormalizeEmail(email);
        var at = normalized.LastIndexOf('@');
        if (at <= 0) return normalized;
        var domain = normalized[(at + 1)..];
        return DomainTypos.TryGetValue(domain, out var fixedDomain)
            ? $"{normalized[..at]}@{fixedDomain}"
            : normalized;
    }

    /// <summary>Jaro-Winkler similarity in the range 0..1.</summary>
    public static double JaroWinkler(string? a, string? b)
    {
        var s1 = (a ?? "").Trim();
        var s2 = (b ?? "").Trim();
        if (s1.Length == 0 && s2.Length == 0) return 1;
        if (s1.Length == 0 || s2.Length == 0) return 0;
        if (string.Equals(s1, s2, StringComparison.Ordinal)) return 1;

        var jaro = Jaro(s1, s2);
        var prefix = 0;
        var maxPrefix = Math.Min(4, Math.Min(s1.Length, s2.Length));
        while (prefix < maxPrefix && s1[prefix] == s2[prefix]) prefix++;
        return Math.Min(1, jaro + prefix * 0.1 * (1 - jaro));
    }

    /// <summary>
    /// Name similarity that tolerates word reordering and legal suffixes, e.g.
    /// "Acme Global Ltd" vs "Global Acme" → 1.0.
    /// </summary>
    public static double CompanySimilarity(string? a, string? b)
    {
        var na = NormalizeCompany(a);
        var nb = NormalizeCompany(b);
        if (na.Length == 0 || nb.Length == 0) return 0;
        if (string.Equals(na, nb, StringComparison.Ordinal)) return 1;

        var direct = JaroWinkler(na, nb);
        var tokensA = na.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var tokensB = nb.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var tokenScore = TokenSetSimilarity(tokensA, tokensB);
        return Math.Max(direct, tokenScore);
    }

    public static double TokenSetSimilarity(IReadOnlyCollection<string> a, IReadOnlyCollection<string> b)
    {
        if (a.Count == 0 || b.Count == 0) return 0;
        var setB = new HashSet<string>(b, StringComparer.Ordinal);
        var intersection = a.Count(token => setB.Contains(token));
        var union = a.Count + b.Count - intersection;
        return union == 0 ? 0 : (double)intersection / union;
    }

    private static double Jaro(string s1, string s2)
    {
        var matchDistance = Math.Max(s1.Length, s2.Length) / 2 - 1;
        if (matchDistance < 0) matchDistance = 0;

        var s1Matches = new bool[s1.Length];
        var s2Matches = new bool[s2.Length];

        var matches = 0;
        for (var i = 0; i < s1.Length; i++)
        {
            var start = Math.Max(0, i - matchDistance);
            var end = Math.Min(i + matchDistance + 1, s2.Length);
            for (var j = start; j < end; j++)
            {
                if (s2Matches[j] || s1[i] != s2[j]) continue;
                s1Matches[i] = true;
                s2Matches[j] = true;
                matches++;
                break;
            }
        }

        if (matches == 0) return 0;

        var transpositions = 0;
        var k = 0;
        for (var i = 0; i < s1.Length; i++)
        {
            if (!s1Matches[i]) continue;
            while (k < s2.Length && !s2Matches[k]) k++;
            if (k < s2.Length && s1[i] != s2[k]) transpositions++;
            k++;
        }

        var m = (double)matches;
        return (m / s1.Length + m / s2.Length + (m - transpositions / 2.0) / m) / 3.0;
    }

    private static string CollapseSpaces(string value)
    {
        var builder = new StringBuilder(value.Length);
        var lastWasSpace = true;
        foreach (var ch in value)
        {
            if (ch == ' ')
            {
                if (!lastWasSpace) builder.Append(' ');
                lastWasSpace = true;
            }
            else
            {
                builder.Append(ch);
                lastWasSpace = false;
            }
        }
        return builder.ToString().Trim();
    }
}
