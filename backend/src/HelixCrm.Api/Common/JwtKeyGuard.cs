namespace HelixCrm.Api.Common;

/// <summary>
/// Rejects signing keys that are committed to the public repository. Development keeps a
/// zero-config fallback; every other environment must supply a unique key of real length.
/// </summary>
public static class JwtKeyGuard
{
    public const string DevelopmentKey =
        "helix-dev-signing-key-change-me-7f4b2c9e1a8d5f3b6c0e4a2d9f7b1c5e";

    private static readonly HashSet<string> PlaceholderKeys = new(StringComparer.Ordinal)
    {
        DevelopmentKey,
        "helix-prod-signing-key-change-me-7f4b2c9e1a8d5f3b6c0e4a2d9f7b1c5e",
        "replace-with-a-long-random-secret-at-least-32-chars"
    };

    public static string Resolve(string? configuredKey, bool isDevelopment)
    {
        var key = configuredKey?.Trim();

        if (isDevelopment)
        {
            if (string.IsNullOrEmpty(key))
                return DevelopmentKey;

            // The sample key in appsettings.json is fine locally; never fail a developer for it.
            return PlaceholderKeys.Contains(key) ? DevelopmentKey : Validate(key);
        }

        if (string.IsNullOrEmpty(key))
            throw new InvalidOperationException(
                "Jwt:Key is required outside Development. Set JWT_KEY to a random value of at least 32 characters.");

        if (PlaceholderKeys.Contains(key))
            throw new InvalidOperationException(
                "Jwt:Key is still set to a public placeholder. Set JWT_KEY to a unique random value before starting in Production.");

        return Validate(key);
    }

    private static string Validate(string key)
    {
        if (key.Length < 32)
            throw new InvalidOperationException("Jwt:Key must be at least 32 characters.");

        return key;
    }
}
