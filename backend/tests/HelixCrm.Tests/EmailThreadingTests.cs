using HelixCrm.Api.Features.Email;
using Microsoft.AspNetCore.DataProtection;

namespace HelixCrm.Tests;

public class EmailThreadingTests
{
    [Theory]
    [InlineData("Re: Printer down [#TCK-1001]", "T-1001")]
    [InlineData("printer down [#tck-42]", "T-42")]
    [InlineData("Re: Printer down [T-1001]", "T-1001")]
    [InlineData("No token here", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void TryTicketNumber_ReadsBothTokenForms(string? subject, string? expected)
    {
        Assert.Equal(expected, EmailThreading.TryTicketNumber(subject));
    }

    [Fact]
    public void WithTicketToken_PrefixesReplyAndAddsTokenOnce()
    {
        var once = EmailThreading.WithTicketToken("Printer down", "T-1001");
        Assert.Equal("Re: Printer down [#TCK-1001]", once);

        var twice = EmailThreading.WithTicketToken(once, "T-1001");
        Assert.Equal(once, twice);
    }

    [Theory]
    [InlineData("Dana <Dana@Example.COM>", "dana@example.com")]
    [InlineData("  dana@example.com  ", "dana@example.com")]
    [InlineData("not-an-address", null)]
    [InlineData("", null)]
    public void Normalize_ReturnsLowercaseMailboxOrNull(string input, string? expected)
    {
        Assert.Equal(expected, EmailAddresses.Normalize(input));
    }

    [Fact]
    public void Split_KeepsValidAddressesOnly()
    {
        Assert.Equal(
            ["a@example.com", "b@example.com"],
            EmailAddresses.Split(" A@Example.com, junk, b@example.com ,"));
    }

    [Fact]
    public void NewMessageId_UsesTheSenderDomain()
    {
        var id = EmailThreading.NewMessageId("Support@Acme.Test");
        Assert.StartsWith("<", id);
        Assert.EndsWith("@Acme.Test>", id);
        Assert.NotEqual(id, EmailThreading.NewMessageId("support@acme.test"));
    }

    [Fact]
    public void SecretProtector_RoundTripsAndRejectsTamperedCiphertext()
    {
        var protector = new SecretProtector(new EphemeralDataProtectionProvider());
        var cipher = protector.Protect("hunter2");

        Assert.NotEqual("hunter2", cipher);
        Assert.Equal("hunter2", protector.TryUnprotect(cipher));
        Assert.Null(protector.TryUnprotect(cipher[..^2]));
        Assert.Null(protector.TryUnprotect(null));
    }
}
