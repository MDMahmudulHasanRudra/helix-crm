using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Auth;

[ApiController]
[Route("api/v1/auth")]
public class AuthController(HelixDbContext db, TokenService tokens, IConfiguration configuration) : ControllerBase
{
    private const int MaxFailedAttempts = 5;
    private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);
    private static readonly Lazy<string> DummyHash =
        new(() => PasswordHasher.Hash(Guid.NewGuid().ToString("N")));

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
    [EnableRateLimiting("login")]
    public async Task<ActionResult<MeDto>> Login(LoginRequest request)
    {
        var email = request.Email.Clean(254).ToLowerInvariant();
        var password = request.Password ?? "";

        if (email.Length == 0 || password.Length == 0)
            throw new ApiException(400, "Email and password are required.");

        var user = await db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Email == email && !u.IsDeleted);

        // Spend the same hashing work for unknown emails so response timing does not leak accounts.
        if (user is null)
        {
            PasswordHasher.Verify(password, DummyHash.Value);
            throw new ApiException(401, "Invalid email or password.");
        }

        var now = DateTime.UtcNow;
        if (user.LockoutEndAt is { } lockedUntil && lockedUntil > now)
        {
            var minutes = Math.Max(1, (int)Math.Ceiling((lockedUntil - now).TotalMinutes));
            throw new ApiException(429,
                $"Too many failed sign-in attempts. Try again in {minutes} minute{(minutes == 1 ? "" : "s")}.");
        }

        if (!PasswordHasher.Verify(password, user.PasswordHash) || !user.IsActive)
        {
            var lockedOut = await RecordFailedLoginAsync(user, now);
            throw lockedOut
                ? new ApiException(429,
                    $"Too many failed sign-in attempts. Try again in {LockoutDuration.TotalMinutes:0} minutes.")
                : new ApiException(401, "Invalid email or password.");
        }

        user.FailedLoginAttempts = 0;
        user.LockoutEndAt = null;
        user.LastLoginAt = now;
        await db.SaveChangesAsync();

        var organization = await db.Organizations.FindAsync(user.OrganizationId)
            ?? throw new ApiException(401, "Workspace not found.");

        var (token, expires) = tokens.Create(user, organization);
        SetAuthCookie(token, expires);

        return Ok(new MeDto(DtoMapper.User(user), DtoMapper.Organization(organization)));
    }

    /// <summary>Counts a failed attempt and starts a cooldown once the threshold is crossed.</summary>
    private async Task<bool> RecordFailedLoginAsync(User user, DateTime now)
    {
        // An expired lockout starts a fresh streak.
        if (user.LockoutEndAt is { } lockedUntil && lockedUntil <= now)
        {
            user.LockoutEndAt = null;
            user.FailedLoginAttempts = 0;
        }

        user.FailedLoginAttempts++;

        var lockedOut = user.FailedLoginAttempts >= MaxFailedAttempts;
        if (lockedOut)
        {
            user.FailedLoginAttempts = 0;
            user.LockoutEndAt = now.Add(LockoutDuration);
        }

        // Security bookkeeping is not worth an audit row per password guess.
        db.AuditEnabled = false;
        await db.SaveChangesAsync();
        return lockedOut;
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
