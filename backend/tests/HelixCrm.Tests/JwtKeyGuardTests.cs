using HelixCrm.Api.Common;

namespace HelixCrm.Tests;

public class JwtKeyGuardTests
{
    private const string StrongKey = "2c5d4b1f9e8a7c6b5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c";

    [Fact]
    public void Development_FallsBackToTheSampleKeyWhenConfigurationIsMissing()
    {
        Assert.Equal(JwtKeyGuard.DevelopmentKey, JwtKeyGuard.Resolve(null, isDevelopment: true));
        Assert.Equal(JwtKeyGuard.DevelopmentKey, JwtKeyGuard.Resolve("  ", isDevelopment: true));
    }

    [Fact]
    public void Development_AcceptsTheCommittedSampleKey()
    {
        Assert.Equal(JwtKeyGuard.DevelopmentKey, JwtKeyGuard.Resolve(JwtKeyGuard.DevelopmentKey, isDevelopment: true));
    }

    [Fact]
    public void Production_RejectsMissingKey()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => JwtKeyGuard.Resolve(null, isDevelopment: false));
        Assert.Contains("Jwt:Key", ex.Message);
    }

    [Theory]
    [InlineData("helix-dev-signing-key-change-me-7f4b2c9e1a8d5f3b6c0e4a2d9f7b1c5e")]
    [InlineData("helix-prod-signing-key-change-me-7f4b2c9e1a8d5f3b6c0e4a2d9f7b1c5e")]
    [InlineData("replace-with-a-long-random-secret-at-least-32-chars")]
    public void Production_RejectsPublicPlaceholderKeys(string placeholder)
    {
        var ex = Assert.Throws<InvalidOperationException>(
            () => JwtKeyGuard.Resolve(placeholder, isDevelopment: false));
        Assert.Contains("placeholder", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Production_RejectsShortKeys()
    {
        var ex = Assert.Throws<InvalidOperationException>(
            () => JwtKeyGuard.Resolve("too-short", isDevelopment: false));
        Assert.Contains("32 characters", ex.Message);
    }

    [Fact]
    public void Production_AcceptsAUniqueKeyOfSufficientLength()
    {
        Assert.Equal(StrongKey, JwtKeyGuard.Resolve(StrongKey, isDevelopment: false));
        Assert.Equal(StrongKey, JwtKeyGuard.Resolve($"  {StrongKey}  ", isDevelopment: false));
    }
}
