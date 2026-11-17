using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Tests;

public class HelixDbContextTests
{
    private sealed class FakeTenant(Guid organizationId, Guid? userId = null) : ITenantProvider
    {
        public Guid OrganizationId { get; } = organizationId;
        public Guid? UserId { get; } = userId;
        public string? UserName => "Test User";
        public string? Role => Roles.Admin;
    }

    private static HelixDbContext CreateContext(string database, ITenantProvider tenant) =>
        new(new DbContextOptionsBuilder<HelixDbContext>()
            .UseInMemoryDatabase(database)
            .Options, tenant);

    [Fact]
    public async Task SaveChanges_StampsTimestampsAndWritesAuditEntry()
    {
        var org = Guid.NewGuid();
        var user = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();

        await using (var db = CreateContext(database, new FakeTenant(org, user)))
        {
            var account = new Account { OrganizationId = org, Name = "Acme Corporation", Status = "Active" };
            db.Accounts.Add(account);
            await db.SaveChangesAsync();

            Assert.NotEqual(default, account.CreatedAt);
            Assert.Equal(DateTimeKind.Utc, account.CreatedAt.Kind);
            Assert.Equal(user, account.CreatedById);
            Assert.Equal(user, account.UpdatedById);
        }

        await using (var db = CreateContext(database, new FakeTenant(org, user)))
        {
            var audit = await db.AuditLogs.SingleAsync(a => a.EntityType == nameof(Account));
            Assert.Equal("created", audit.Action);
            Assert.Contains("Acme Corporation", audit.ChangesJson);
            Assert.Equal("Test User", audit.ActorName);
        }
    }

    [Fact]
    public async Task QueryFilters_IsolateOrganizationsAndHideSoftDeletedRows()
    {
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();

        await using (var db = CreateContext(database, new FakeTenant(orgA)))
        {
            db.Accounts.Add(new Account { OrganizationId = orgA, Name = "Visible", Status = "Active" });
            db.Accounts.Add(new Account { OrganizationId = orgA, Name = "Archived", Status = "Active", IsDeleted = true });
            db.Accounts.Add(new Account { OrganizationId = orgB, Name = "Other workspace", Status = "Active" });
            await db.SaveChangesAsync();
        }

        await using (var db = CreateContext(database, new FakeTenant(orgA)))
        {
            var names = await db.Accounts.Select(a => a.Name).ToListAsync();
            Assert.Equal(["Visible"], names);
        }

        await using (var db = CreateContext(database, new FakeTenant(orgB)))
        {
            var names = await db.Accounts.Select(a => a.Name).ToListAsync();
            Assert.Equal(["Other workspace"], names);
        }
    }

    [Fact]
    public async Task SoftDelete_IsRecordedInAuditTrail()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();

        Guid accountId;
        await using (var db = CreateContext(database, new FakeTenant(org)))
        {
            var account = new Account { OrganizationId = org, Name = "Acme", Status = "Active" };
            db.Accounts.Add(account);
            await db.SaveChangesAsync();
            accountId = account.Id;
        }

        await using (var db = CreateContext(database, new FakeTenant(org)))
        {
            var account = await db.Accounts.SingleAsync(a => a.Id == accountId);
            account.IsDeleted = true;
            await db.SaveChangesAsync();
        }

        await using (var db = CreateContext(database, new FakeTenant(org)))
        {
            Assert.False(await db.Accounts.AnyAsync(a => a.Id == accountId));

            var deleted = await db.AuditLogs
                .Where(a => a.EntityId == accountId && a.Action == "deleted")
                .SingleAsync();
            Assert.Equal(nameof(Account), deleted.EntityType);
        }
    }

    [Fact]
    public async Task SaveChanges_DoesNotAuditWhenDisabled()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();

        await using (var db = CreateContext(database, new FakeTenant(org)))
        {
            db.AuditEnabled = false;
            db.Accounts.Add(new Account { OrganizationId = org, Name = "Seed row", Status = "Active" });
            await db.SaveChangesAsync();
            Assert.Equal(0, await db.AuditLogs.CountAsync());
        }
    }

    [Fact]
    public async Task GetCurrentOrganization_ReturnsTheTenantWorkspace_NotTheFirstRow()
    {
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();

        await using (var db = CreateContext(database, new FakeTenant(orgA)))
        {
            db.Organizations.Add(new Organization { Id = orgA, Name = "First workspace", Slug = "first" });
            db.Organizations.Add(new Organization { Id = orgB, Name = "Second workspace", Slug = "second" });
            await db.SaveChangesAsync();
        }

        await using (var db = CreateContext(database, new FakeTenant(orgB)))
        {
            var organization = await db.GetCurrentOrganizationAsync();
            Assert.Equal(orgB, organization.Id);
            Assert.Equal("Second workspace", organization.Name);
        }
    }

    [Fact]
    public async Task GetCurrentOrganization_RejectsRequestsWithoutTenantContext()
    {
        var database = Guid.NewGuid().ToString();
        await using var db = CreateContext(database, new FakeTenant(Guid.Empty));

        var ex = await Assert.ThrowsAsync<HelixCrm.Api.Common.ApiException>(() => db.GetCurrentOrganizationAsync());
        Assert.Equal(401, ex.StatusCode);
    }

    [Fact]
    public async Task GetCurrentOrganization_ReturnsNotFoundWhenTheWorkspaceIsMissing()
    {
        var database = Guid.NewGuid().ToString();
        await using var db = CreateContext(database, new FakeTenant(Guid.NewGuid()));

        var ex = await Assert.ThrowsAsync<HelixCrm.Api.Common.ApiException>(() => db.GetCurrentOrganizationAsync());
        Assert.Equal(404, ex.StatusCode);
    }
}
