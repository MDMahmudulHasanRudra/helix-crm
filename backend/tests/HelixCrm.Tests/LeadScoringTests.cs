using HelixCrm.Api.Features.Autonomous;

namespace HelixCrm.Tests;

public class LeadScoringTests
{
    [Fact]
    public void Score_EmptyLead_IsZero()
    {
        var breakdown = LeadScoring.Score(new LeadSignals(null, null, null, null, null, null, null, null, null));

        Assert.Equal(0, breakdown.Total);
        Assert.Empty(breakdown.Factors);
    }

    [Fact]
    public void Score_FullyQualifiedExecutiveLead_ReachesHundred()
    {
        var breakdown = LeadScoring.Score(new LeadSignals(
            "Ada", "Lovelace", "Acme Analytics", "ada@acme.com", "+1 415 555 0100",
            "Chief Technology Officer", "https://acme.com", "Referral", 120_000m));

        Assert.Equal(100, breakdown.Total);
        Assert.Contains(breakdown.Factors, f => f.Key == "corporate_email");
        Assert.Contains(breakdown.Factors, f => f.Key == "seniority" && f.Points == 30);
    }

    [Fact]
    public void Score_FreeMailDomain_DoesNotEarnCorporateEmailPoints()
    {
        var breakdown = LeadScoring.Score(new LeadSignals(
            "Ada", "Lovelace", "Acme", "ada@gmail.com", null, null, null, null, null));

        Assert.DoesNotContain(breakdown.Factors, f => f.Key == "corporate_email");
    }

    [Fact]
    public void Score_CategoriesNeverExceedDocumentedBudgets()
    {
        var breakdown = LeadScoring.Score(new LeadSignals(
            "Ada", "Lovelace", "Acme", "ada@acme.com", "+1 415 555 0100",
            "VP of Engineering", "https://acme.com", "Partner", 500_000m));

        var firmographic = breakdown.Factors
            .Where(f => f.Key is "corporate_email" or "website" or "deal_size" or "intent")
            .Sum(f => f.Points);
        var seniority = breakdown.Factors.Where(f => f.Key == "seniority").Sum(f => f.Points);
        var completeness = breakdown.Factors
            .Where(f => f.Key is "phone" or "company" or "title")
            .Sum(f => f.Points);

        Assert.InRange(firmographic, 0, 40);
        Assert.InRange(seniority, 0, 30);
        Assert.InRange(completeness, 0, 30);
        Assert.Equal(firmographic + seniority + completeness, breakdown.Total);
    }

    [Fact]
    public void Score_SeniorityTiersAreOrdered()
    {
        static int Seniority(string title) => LeadScoring
            .Score(new LeadSignals(null, null, null, null, null, title, null, null, null))
            .Factors.SingleOrDefault(f => f.Key == "seniority")?.Points ?? 0;

        Assert.Equal(30, Seniority("Chief Executive Officer"));
        Assert.Equal(25, Seniority("VP of Sales"));
        Assert.Equal(20, Seniority("Director of Marketing"));
        Assert.Equal(12, Seniority("Sales Manager"));
        Assert.Equal(0, Seniority("Software Engineer"));
    }
}
