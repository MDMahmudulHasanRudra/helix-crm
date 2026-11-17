using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using IPNetwork = System.Net.IPNetwork;

namespace HelixCrm.Api.Common;

/// <summary>
/// Trusts forwarded headers only from proxies this deployment explicitly names.
/// Without this, every request behind nginx/Caddy/the Next.js rewrite shares one
/// RemoteIpAddress and consumes the same rate-limit partition.
/// </summary>
public static class ProxyTrust
{
    public static void Configure(ForwardedHeadersOptions options, IConfiguration configuration)
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = Math.Max(1, configuration.GetValue("Proxy:ForwardLimit", 1));

        foreach (var value in Split(configuration["Proxy:KnownProxies"]))
        {
            if (IPAddress.TryParse(value, out var address)) options.KnownProxies.Add(address);
        }

        foreach (var value in Split(configuration["Proxy:KnownNetworks"]))
        {
            if (IPNetwork.TryParse(value, out var network)) options.KnownIPNetworks.Add(network);
        }
    }

    public static IEnumerable<string> Split(string? raw) =>
        (raw ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
