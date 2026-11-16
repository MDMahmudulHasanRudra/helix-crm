using HelixCrm.Api.Common;
using HelixCrm.Api.Domain;

namespace HelixCrm.Api.Features.Autonomous;

public record LeadSignals(
    string? FirstName,
    string? LastName,
    string? Company,
    string? Email,
    string? Phone,
    string? Title,
    string? Website,
    string? Source,
    decimal? EstimatedValue);

public record LeadScoreFactor(string Key, string Label, int Points, int Max);

public record LeadScoreBreakdown(int Total, IReadOnlyList<LeadScoreFactor> Factors)
{
    public static readonly LeadScoreBreakdown Empty = new(0, []);
}

/// <summary>
/// Deterministic, explainable lead scoring. The weights mirror the published
/// autonomous-CRM matrix: firmographics (40), seniority (30) and completeness
/// (30). Every point is traceable so reps can see *why* a lead scored highly.
/// </summary>
public static class LeadScoring
{
    private static readonly string[] CLevel =
    [
        "chief", "ceo", "cto", "coo", "cfo", "cmo", "cro", "ciso", "founder",
        "co-founder", "owner", "president", "partner", "managing director", "general manager"
    ];

    private static readonly string[] VpLevel = ["vp", "vice president", "svp", "evp", "head of", "head"];
    private static readonly string[] DirectorLevel = ["director", "senior director"];
    private static readonly string[] ManagerLevel = ["manager", "lead", "team lead", "supervisor"];

    private static readonly string[] HighIntentSources =
        ["referral", "partner", "event", "existing customer", "upsell", "expansion"];

    public static LeadScoreBreakdown Score(LeadSignals signals)
    {
        var factors = new List<LeadScoreFactor>();

        // ---- Firmographics (0-40) ----
        var corporateEmail = !string.IsNullOrWhiteSpace(signals.Email) && !Similarity.IsFreeMailDomain(signals.Email);
        if (corporateEmail) factors.Add(new("corporate_email", "Corporate email domain", 15, 15));
        if (!string.IsNullOrWhiteSpace(signals.Website)) factors.Add(new("website", "Company website on file", 10, 10));
        if (signals.EstimatedValue is >= 50_000m) factors.Add(new("deal_size", "Estimated value above 50k", 10, 10));
        if (HighIntentSources.Contains((signals.Source ?? "").Trim().ToLowerInvariant()))
            factors.Add(new("intent", "High-intent source", 5, 5));

        // ---- Seniority (0-30) ----
        var title = (signals.Title ?? "").Trim().ToLowerInvariant();
        var seniority = MatchSeniority(title);
        if (seniority > 0)
            factors.Add(new("seniority", $"Seniority: {TitleOf(title)}", seniority, 30));

        // ---- Completeness (0-30) ----
        if (Similarity.NormalizePhoneDigits(signals.Phone).Length == 10)
            factors.Add(new("phone", "Valid phone number", 10, 10));
        if (string.IsNullOrWhiteSpace(signals.Company) is false)
            factors.Add(new("company", "Company identified", 10, 10));
        if (string.IsNullOrWhiteSpace(signals.Title) is false)
            factors.Add(new("title", "Job title captured", 10, 10));

        // Category caps keep the documented 40/30/30 split intact.
        var firmographic = Cap(factors.Where(f => f.Key is "corporate_email" or "website" or "deal_size" or "intent"), 40);
        var seniorityPoints = Cap(factors.Where(f => f.Key is "seniority"), 30);
        var completeness = Cap(factors.Where(f => f.Key is "phone" or "company" or "title"), 30);

        var capped = new List<LeadScoreFactor>();
        capped.AddRange(firmographic);
        capped.AddRange(seniorityPoints);
        capped.AddRange(completeness);

        var total = Math.Clamp(capped.Sum(f => f.Points), 0, 100);
        return new LeadScoreBreakdown(total, capped);
    }

    public static LeadSignals Signals(Lead lead) => new(
        lead.FirstName, lead.LastName, lead.Company, lead.Email, lead.Phone,
        lead.Title, lead.Website, lead.Source, lead.EstimatedValue);

    private static IReadOnlyList<LeadScoreFactor> Cap(IEnumerable<LeadScoreFactor> factors, int max)
    {
        var list = factors.ToList();
        var total = list.Sum(f => f.Points);
        if (total <= max) return list;

        // Trim the last factor so the category never exceeds its budget.
        var remaining = max;
        var result = new List<LeadScoreFactor>();
        foreach (var factor in list)
        {
            if (remaining <= 0) break;
            var points = Math.Min(factor.Points, remaining);
            result.Add(factor with { Points = points });
            remaining -= points;
        }
        return result;
    }

    private static int MatchSeniority(string title)
    {
        if (title.Length == 0) return 0;
        if (CLevel.Any(token => ContainsWord(title, token))) return 30;
        if (VpLevel.Any(token => ContainsWord(title, token))) return 25;
        if (DirectorLevel.Any(token => ContainsWord(title, token))) return 20;
        if (ManagerLevel.Any(token => ContainsWord(title, token))) return 12;
        return 0;
    }

    private static string TitleOf(string title) => MatchSeniority(title) switch
    {
        30 => "Executive",
        25 => "VP / Head",
        20 => "Director",
        12 => "Manager",
        _ => "Other"
    };

    private static bool ContainsWord(string haystack, string needle)
    {
        if (needle.Contains(' ')) return haystack.Contains(needle, StringComparison.Ordinal);
        var index = haystack.IndexOf(needle, StringComparison.Ordinal);
        while (index >= 0)
        {
            var before = index == 0 || !char.IsLetterOrDigit(haystack[index - 1]);
            var afterIndex = index + needle.Length;
            var after = afterIndex >= haystack.Length || !char.IsLetterOrDigit(haystack[afterIndex]);
            if (before && after) return true;
            index = haystack.IndexOf(needle, index + 1, StringComparison.Ordinal);
        }
        return false;
    }
}
