using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using HelixCrm.Api.Features.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace HelixCrm.Tests;

public class AuthLockoutTests
{
    private sealed class FakeTenant(Guid organizationId) : ITenantProvider
    {
        public Guid OrganizationId { get; } = organizationId;
        public Guid? UserId => null;
        public string? UserName => null;
        public string? Role => Roles.Admin;
    }

    private const string Password = "Correct@123";

    private static HelixDbContext CreateContext(string database, Guid organizationId) =>
        new(new DbContextOptionsBuilder<HelixDbContext>()
            .UseInMemoryDatabase(database)
            .Options, new FakeTenant(organizationId));

    private static AuthController CreateController(HelixDbContext db)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "test-signing-key-that-is-long-enough-123456",
                ["Jwt:Issuer"] = "helix-crm",
                ["Jwt:Audience"] = "helix-crm-web",
                ["Jwt:ExpiryDays"] = "7"
            })
            .Build();

        return new AuthController(db, new TokenService(configuration), configuration)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
    }

    private static async Task<(string Database, Guid OrganizationId, Guid UserId)> SeedUserAsync(bool isActive = true)
    {
        var database = Guid.NewGuid().ToString();
        var organizationId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        await using var db = CreateContext(database, organizationId);
        db.Organizations.Add(new Organization { Id = organizationId, Name = "Test Workspace", Slug = "test-workspace" });
        db.Users.Add(new User
        {
            Id = userId,
            OrganizationId = organizationId,
            Email = "user@example.com",
            PasswordHash = PasswordHasher.Hash(Password),
            FirstName = "Test",
            LastName = "User",
            Role = Roles.Rep,
            IsActive = isActive
        });
        await db.SaveChangesAsync();

        return (database, organizationId, userId);
    }

    [Fact]
    public async Task WrongPassword_LocksAccountAfterFiveAttempts()
    {
        var (database, organizationId, _) = await SeedUserAsync();
        await using var db = CreateContext(database, organizationId);
        var controller = CreateController(db);

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            var failure = await Assert.ThrowsAsync<ApiException>(
                () => controller.Login(new AuthController.LoginRequest("user@example.com", "wrong-password")));
            Assert.Equal(401, failure.StatusCode);
        }

        var lockout = await Assert.ThrowsAsync<ApiException>(
            () => controller.Login(new AuthController.LoginRequest("user@example.com", "wrong-password")));
        Assert.Equal(429, lockout.StatusCode);

        await using var verify = CreateContext(database, organizationId);
        var user = await verify.Users.IgnoreQueryFilters().SingleAsync();
        Assert.NotNull(user.LockoutEndAt);
        Assert.True(user.LockoutEndAt > DateTime.UtcNow);
        Assert.Null(user.LastLoginAt);
    }

    [Fact]
    public async Task LockedAccount_RejectsCorrectPasswordUntilCooldownExpires()
    {
        var (database, organizationId, _) = await SeedUserAsync();
        await using (var db = CreateContext(database, organizationId))
        {
            var controller = CreateController(db);
            for (var attempt = 1; attempt <= 4; attempt++)
            {
                await Assert.ThrowsAsync<ApiException>(
                    () => controller.Login(new AuthController.LoginRequest("user@example.com", "wrong-password")));
            }
            await Assert.ThrowsAsync<ApiException>(
                () => controller.Login(new AuthController.LoginRequest("user@example.com", "wrong-password")));
        }

        await using (var db = CreateContext(database, organizationId))
        {
            var blocked = await Assert.ThrowsAsync<ApiException>(
                () => CreateController(db).Login(new AuthController.LoginRequest("user@example.com", Password)));
            Assert.Equal(429, blocked.StatusCode);
        }

        // Simulate the cooldown elapsing.
        await using (var db = CreateContext(database, organizationId))
        {
            var user = await db.Users.IgnoreQueryFilters().SingleAsync();
            user.LockoutEndAt = DateTime.UtcNow.AddSeconds(-1);
            await db.SaveChangesAsync();
        }

        await using (var db = CreateContext(database, organizationId))
        {
            var result = await CreateController(db).Login(new AuthController.LoginRequest("user@example.com", Password));
            Assert.IsType<OkObjectResult>(result.Result);
        }

        await using (var verify = CreateContext(database, organizationId))
        {
            var user = await verify.Users.IgnoreQueryFilters().SingleAsync();
            Assert.Equal(0, user.FailedLoginAttempts);
            Assert.Null(user.LockoutEndAt);
            Assert.NotNull(user.LastLoginAt);
        }
    }

    [Fact]
    public async Task SuccessfulLogin_ResetsTheFailureStreak()
    {
        var (database, organizationId, _) = await SeedUserAsync();
        await using (var db = CreateContext(database, organizationId))
        {
            var controller = CreateController(db);
            for (var attempt = 1; attempt <= 3; attempt++)
            {
                await Assert.ThrowsAsync<ApiException>(
                    () => controller.Login(new AuthController.LoginRequest("user@example.com", "wrong-password")));
            }

            var result = await controller.Login(new AuthController.LoginRequest("user@example.com", Password));
            Assert.IsType<OkObjectResult>(result.Result);
        }

        await using var verify = CreateContext(database, organizationId);
        Assert.Equal(0, (await verify.Users.IgnoreQueryFilters().SingleAsync()).FailedLoginAttempts);
    }

    [Fact]
    public async Task UnknownEmail_ReturnsGenericFailureWithoutWritingAnAccount()
    {
        var (database, organizationId, _) = await SeedUserAsync();
        await using var db = CreateContext(database, organizationId);

        var failure = await Assert.ThrowsAsync<ApiException>(
            () => CreateController(db).Login(new AuthController.LoginRequest("nobody@example.com", Password)));

        Assert.Equal(401, failure.StatusCode);
        Assert.Equal(1, await db.Users.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task InactiveUser_CannotSignIn()
    {
        var (database, organizationId, _) = await SeedUserAsync(isActive: false);
        await using var db = CreateContext(database, organizationId);

        var failure = await Assert.ThrowsAsync<ApiException>(
            () => CreateController(db).Login(new AuthController.LoginRequest("user@example.com", Password)));

        Assert.Equal(401, failure.StatusCode);
    }

    [Fact]
    public async Task FailedAttempts_DoNotFloodTheAuditTrail()
    {
        var (database, organizationId, _) = await SeedUserAsync();
        var before = 0;
        await using (var db = CreateContext(database, organizationId))
        {
            before = await db.AuditLogs.CountAsync();
            var controller = CreateController(db);
            for (var attempt = 1; attempt <= 4; attempt++)
            {
                await Assert.ThrowsAsync<ApiException>(
                    () => controller.Login(new AuthController.LoginRequest("user@example.com", "wrong-password")));
            }
        }

        await using var verify = CreateContext(database, organizationId);
        Assert.Equal(before, await verify.AuditLogs.CountAsync());
    }
}
