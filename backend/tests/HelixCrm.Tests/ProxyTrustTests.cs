using System.Net;
using HelixCrm.Api.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;

namespace HelixCrm.Tests;

public class ProxyTrustTests
{
    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.ToDictionary(v => v.Key, v => v.Value))
            .Build();

    [Fact]
    public void Split_TrimsAndDropsEmptyEntries()
    {
        Assert.Equal(["10.0.0.5", "192.168.1.1"], ProxyTrust.Split(" 10.0.0.5 , ,192.168.1.1, "));
        Assert.Empty(ProxyTrust.Split(null));
    }

    [Fact]
    public void Configure_ParsesKnownProxiesAndNetworks_AndIgnoresJunk()
    {
        var options = new ForwardedHeadersOptions();
        options.KnownProxies.Clear();
        options.KnownIPNetworks.Clear();

        ProxyTrust.Configure(options, Config(
            ("Proxy:KnownProxies", "203.0.113.7, 2001:db8::1, not-an-ip"),
            ("Proxy:KnownNetworks", "172.16.0.0/12, nonsense"),
            ("Proxy:ForwardLimit", "2")));

        Assert.Equal(ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto, options.ForwardedHeaders);
        Assert.Equal(2, options.ForwardLimit);
        Assert.Contains(IPAddress.Parse("203.0.113.7"), options.KnownProxies);
        Assert.Contains(IPAddress.Parse("2001:db8::1"), options.KnownProxies);
        Assert.DoesNotContain(options.KnownProxies, ip => ip.ToString() == "not-an-ip");
        Assert.Contains(options.KnownIPNetworks, network => network.ToString() == "172.16.0.0/12");
        Assert.Single(options.KnownIPNetworks);
    }

    [Fact]
    public void Configure_DefaultsToOneForwardedHop()
    {
        var options = new ForwardedHeadersOptions();
        ProxyTrust.Configure(options, Config());

        Assert.Equal(1, options.ForwardLimit);
        Assert.DoesNotContain(options.KnownProxies, ip => !IPAddress.IsLoopback(ip));
    }
}
