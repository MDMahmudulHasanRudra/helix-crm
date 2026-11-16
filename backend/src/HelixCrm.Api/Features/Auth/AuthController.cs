using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Auth;

[ApiController]
[Route("api/v1/auth")]
public class AuthController(HelixDbContext db, TokenService tokens, IConfiguration configuration) : ControllerBase
{
    public record LoginRequest(string? Email, string? Password);
    public record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);
    public record UpdateProfileRequest(string? FirstName, string? LastName, string? Title, string? Phone);

    private void SetAuthCookie(string token, DateTime expires)
    {
        Response.Cookies.Append(AuthConstants.CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps || configuration.GetValue("Cookie:Secure", false),
            SameSite = SameSiteMode.Lax,
            Path = "/",
            Expires = expires
        });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<MeDto>> Login(LoginRequest request)
    {
        var email = request.Email.Clean(254).ToLowerInvariant();
        var password = request.Password ?? "";

        if (email.Length == 0 || password.Length == 0)
            throw new ApiException(400, "Email and password are required.");

        var user = await db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Email == email && !u.IsDeleted);

        if (user is null || !user.IsActive || !PasswordHasher.Verify(password, user.PasswordHash))
            throw new ApiException(401, "Invalid email or password.");

        var organization = await db.Organizations.FindAsync(user.OrganizationId)
            ?? throw new ApiException(401, "Workspace not found.");

        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var (token, expires) = tokens.Create(user, organization);
        SetAuthCookie(token, expires);

        return Ok(new MeDto(DtoMapper.User(user), DtoMapper.Organization(organization)));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(AuthConstants.CookieName, new CookieOptions { Path = "/" });
        return NoContent();
    }

    [HttpGet("me")]
    public async Task<ActionResult<MeDto>> Me()
    {
        var userId = User.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new ApiException(401, "Session expired. Please sign in again.");
        var organization = await db.Organizations.FindAsync(user.OrganizationId)
            ?? throw new ApiException(404, "Workspace not found.");

        return Ok(new MeDto(DtoMapper.User(user), DtoMapper.Organization(organization)));
    }

    [HttpPatch("profile")]
    public async Task<ActionResult<UserDto>> UpdateProfile(UpdateProfileRequest request)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == User.GetUserId())
            ?? throw new ApiException(404, "User not found.");

        user.FirstName = request.FirstName.Clean(100);
        user.LastName = request.LastName.Clean(100);
        user.Title = request.Title.Clean(120);
        user.Phone = request.Phone.Clean(40);
        if (user.FirstName.Length == 0) throw new ApiException(400, "First name is required.");

        await db.SaveChangesAsync();
        return Ok(DtoMapper.User(user));
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == User.GetUserId())
            ?? throw new ApiException(404, "User not found.");

        if (!PasswordHasher.Verify(request.CurrentPassword ?? "", user.PasswordHash))
            throw new ApiException(400, "Your current password is incorrect.");
        if ((request.NewPassword ?? "").Length < 8)
            throw new ApiException(400, "New password must be at least 8 characters.");

        user.PasswordHash = PasswordHasher.Hash(request.NewPassword!);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
