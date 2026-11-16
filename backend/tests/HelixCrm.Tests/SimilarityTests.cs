using HelixCrm.Api.Common;

namespace HelixCrm.Tests;

public class SimilarityTests
{
    [Theory]
    [InlineData("Acme Corporation, Inc.", "acme")]
    [InlineData("Acme Corp Ltd", "acme")]
    [InlineData("  ACME   Holdings LLC ", "acme")]
    [InlineData("Acme", "acme")]
    public void NormalizeCompany_StripsLegalSuffixesAndPunctuation(string value, string expected)
    {
        Assert.Equal(expected, Similarity.NormalizeCompany(value));
    }

    [Fact]
    public void Normalize_RemovesAccentsAndCollapsesWhitespace()
    {
        Assert.Equal("jose munoz", Similarity.Normalize("  José   Muñoz "));
    }

    [Fact]
    public void CompanySimilarity_ToleratesWordReordering()
    {
        Assert.Equal(1.0, Similarity.CompanySimilarity("Acme Global Ltd", "Global Acme"), 3);
        Assert.True(Similarity.CompanySimilarity("Acme Corporation", "Acme Corp") > 0.95);
        Assert.True(Similarity.CompanySimilarity("Acme", "Zenith") < 0.5);
    }

    [Fact]
    public void JaroWinkler_ScoresExactAndPartialMatches()
    {
        Assert.Equal(1.0, Similarity.JaroWinkler("acme", "acme"), 3);
        Assert.True(Similarity.JaroWinkler("martha", "marhta") > 0.9);
        Assert.Equal(0.0, Similarity.JaroWinkler("", "acme"), 3);
    }

    [Fact]
    public void NormalizePhoneDigits_ComparesMeaningfulTail()
    {
        Assert.Equal("4155550100", Similarity.NormalizePhoneDigits("+1 (415) 555-0100"));
        Assert.Equal("4155550100", Similarity.NormalizePhoneDigits("415.555.0100"));
        Assert.Equal("", Similarity.NormalizePhoneDigits("not a phone"));
    }

    [Fact]
    public void FixEmailDomainTypo_RepairsCommonTypos()
    {
        Assert.Equal("ada@gmail.com", Similarity.FixEmailDomainTypo("Ada@gmial.com"));
        Assert.Equal("ada@gmail.com", Similarity.FixEmailDomainTypo("ada@gmial.com"));
        Assert.Equal("ada@acme.com", Similarity.FixEmailDomainTypo("ada@acme.com"));
        Assert.True(Similarity.IsFreeMailDomain("ada@gmail.com"));
        Assert.False(Similarity.IsFreeMailDomain("ada@acme.com"));
    }
}
