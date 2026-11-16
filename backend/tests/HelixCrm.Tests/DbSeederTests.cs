using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace HelixCrm.Tests;

public class DbSeederTests
{
    private sealed class FakeTenant : ITenantProvider
    {
        public Guid OrganizationId { get; set; } = Guid.NewGuid();
        public Guid? UserId => null;
        public string? UserName => "Seeder";
        public string? Role => Roles.Admin;
    }

    private static HelixDbContext CreateContext(string database, ITenantProvider tenant) =>
        new(new DbContextOptionsBuilder<HelixDbContext>()
            .UseInMemoryDatabase(database)
            .Options, tenant);

    [Fact]
    public async Task SeedAsync_CreatesDemoWorkspaceWithAutonomousSignals()
    {
        var tenant = new FakeTenant();
        await using var db = CreateContext(Guid.NewGuid().ToString(), tenant);

        await DbSeeder.SeedAsync(db, NullLogger.Instance);

        // The seeder creates its own organisation, so align the tenant before asserting.
        tenant.OrganizationId = (await db.Organizations.IgnoreQueryFilters().SingleAsync()).Id;

        var organization = await db.Organizations.SingleAsync();
        Assert.True(organization.AutonomousEnabled);
        Assert.True(organization.AutoRouteLeads);
        Assert.Equal(75, organization.LeadScoreRoutingThreshold);

        Assert.True(await db.Accounts.CountAsync() > 10);
        Assert.True(await db.Contacts.CountAsync(c => c.IsStale) >= 1);
        Assert.True(await db.Accounts.CountAsync(a => a.Name == "Acme Corp.") == 1);
        Assert.True(await db.Contacts.AnyAsync(c => c.FirstName == "Samantha"));
        Assert.True(await db.Leads.CountAsync(l => l.OwnerId == null && l.Score >= 75) >= 1);
        Assert.True(await db.Deals.CountAsync(d => d.IsStalled) >= 1);
        Assert.True(await db.Deals.Where(d => d.Status == DealStatus.Open).AllAsync(d => d.LastStageMovedAt != null));
        Assert.True(await db.Tickets.CountAsync(t => t.SlaBreached) >= 1);
        Assert.True(await db.Tickets.AnyAsync(t => t.EscalationLevel > 0 && t.Priority == "Urgent"));
    }
}
