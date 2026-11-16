using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;

namespace HelixCrm.Api.Common;

public class ApiException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(Total / (double)PageSize);
    public bool HasNext => Page * PageSize < Total;
    public bool HasPrevious => Page > 1;
}

public static class ClaimsExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var value = user.FindFirstValue("sub");
        return Guid.TryParse(value, out var id) ? id : Guid.Empty;
    }

    public static Guid GetOrganizationId(this ClaimsPrincipal user)
    {
        var value = user.FindFirstValue("org");
        return Guid.TryParse(value, out var id) ? id : Guid.Empty;
    }

    public static string GetDisplayName(this ClaimsPrincipal user) =>
        user.FindFirstValue("name") ?? "Unknown user";

    public static string GetRole(this ClaimsPrincipal user) =>
        user.FindFirstValue("role") ?? Domain.Roles.Rep;
}

public static class PasswordHasher
{
    private const int Iterations = 120_000;
    private const int SaltSize = 16;
    private const int KeySize = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
    }

    public static bool Verify(string password, string hash)
    {
        try
        {
            var parts = hash.Split('.', 3);
            if (parts.Length != 3) return false;
            var iterations = int.Parse(parts[0]);
            var salt = Convert.FromBase64String(parts[1]);
            var expected = Convert.FromBase64String(parts[2]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch
        {
            return false;
        }
    }
}

public static class Json
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    public static T Deserialize<T>(string? value, T fallback)
    {
        if (string.IsNullOrWhiteSpace(value)) return fallback;
        try
        {
            return JsonSerializer.Deserialize<T>(value, Options) ?? fallback;
        }
        catch
        {
            return fallback;
        }
    }

    public static List<string> StringList(string? value) => Deserialize(value, new List<string>());
    public static Dictionary<string, string?> Map(string? value) => Deserialize(value, new Dictionary<string, string?>());
}

public static class QueryExtensions
{
    public static IQueryable<T> Page<T>(this IQueryable<T> query, int page, int pageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        return query.Skip((page - 1) * pageSize).Take(pageSize);
    }

    public static string Clean(this string? value, int max = 2000)
    {
        var clean = (value ?? "").Trim();
        return clean.Length > max ? clean[..max] : clean;
    }
}
