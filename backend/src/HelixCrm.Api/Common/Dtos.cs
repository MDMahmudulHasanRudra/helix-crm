using HelixCrm.Api.Domain;

namespace HelixCrm.Api.Common;

public static class AuthConstants
{
    public const string CookieName = "helix_token";
}

public record UserDto(
    Guid Id,
    string Email,
    string FirstName,
    string LastName,
    string FullName,
    string? Title,
    string? Phone,
    string? AvatarUrl,
    string Role,
    bool IsActive,
    DateTime? LastLoginAt);

public record OrganizationDto(Guid Id, string Name, string Slug, string Currency, string TimeZone, string? LogoUrl);

public record MeDto(UserDto User, OrganizationDto Organization);

public static class DtoMapper
{
    public static UserDto User(User u) => new(
        u.Id, u.Email, u.FirstName, u.LastName, u.FullName, u.Title, u.Phone, u.AvatarUrl,
        u.Role, u.IsActive, u.LastLoginAt);

    public static OrganizationDto Organization(Organization o) =>
        new(o.Id, o.Name, o.Slug, o.Currency, o.TimeZone, o.LogoUrl);
}
