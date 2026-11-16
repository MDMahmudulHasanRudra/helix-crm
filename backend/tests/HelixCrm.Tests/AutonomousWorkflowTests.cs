using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using HelixCrm.Api.Features.Autonomous;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Tests;

public class AutonomousWorkflowTests
{
    private sealed class FakeTenant(Guid organizationId, Guid? userId = null) : ITenantProvider
    {
        public Guid OrganizationId { get; } = organizationId;
        public Guid? UserId { get; } = userId;
        public string? UserName => "Autonomous Test";
        public string? Role => Roles.Admin;
    }

    private static HelixDbContext CreateContext(string database, ITenantProvider tenant) =>
        new(new DbContextOptionsBuilder<HelixDbContext>()
            .UseInMemoryDatabase(database)
            .Options, tenant);

    private static Organization Organization() => new()
    {
        Name = "Helix Test",
        Slug = "helix-test",
        AutonomousEnabled = true,
        AutoRouteLeads = true,
        StaleDealDays = 14,
        StaleDealProbabilityPenalty = 15,
        DataFreshnessDays = 180,
        LeadScoreRoutingThreshold = 75
    };

    [Fact]
    public async Task DuplicateScan_FlagsSimilarAccounts_AndMergeRelinksRecords()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        Guid primaryId;
        Guid duplicateId;

        await using (var db = CreateContext(database, tenant))
        {
            db.AuditEnabled = false;
            var primary = new Account
            {
                OrganizationId = org, Name = "Acme Corporation", Domain = "acme.com", Status = "Active"
            };
            var duplicate = new Account
            {
                OrganizationId = org, Name = "Acme Corp", Domain = "acme.com", Status = "Active"
            };
            primary.CreatedAt = DateTime.UtcNow.AddMinutes(-5);
            duplicate.CreatedAt = DateTime.UtcNow;
            db.Accounts.AddRange(primary, duplicate);
            db.Contacts.Add(new Contact
            {
                OrganizationId = org, FirstName = "Ada", LastName = "Lovelace", AccountId = duplicate.Id
            });
            await db.SaveChangesAsync();

            primaryId = primary.Id;
            duplicateId = duplicate.Id;

            var service = new DuplicateDetectionService(db, tenant);
            var scan = await service.ScanAsync();
            Assert.True(scan.CandidatesCreated >= 1);

            var candidate = await db.DuplicateCandidates.SingleAsync();
            Assert.Equal(EntityTypes.Account, candidate.EntityType);
            Assert.Equal(primaryId, candidate.PrimaryId);
            Assert.Equal(duplicateId, candidate.DuplicateId);

            var merge = await service.MergeAsync(candidate.Id);
            Assert.Equal(primaryId, merge.PrimaryId);
            Assert.Equal(1, merge.RelinkedRecords);
        }

        await using (var db = CreateContext(database, tenant))
        {
            Assert.False(await db.Accounts.AnyAsync(a => a.Id == duplicateId));
            var contact = await db.Contacts.SingleAsync();
            Assert.Equal(primaryId, contact.AccountId);

            var candidate = await db.DuplicateCandidates.SingleAsync();
            Assert.Equal(DuplicateStatus.Merged, candidate.Status);

            var primary = await db.Accounts.SingleAsync(a => a.Id == primaryId);
            Assert.False(primary.IsDuplicateCandidate);
        }
    }

    [Fact]
    public async Task DuplicateScan_MatchesSimilarNamesWithoutDomain_AndIgnoresUnrelatedAccounts()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        await using var db = CreateContext(database, tenant);
        db.AuditEnabled = false;

        db.Accounts.AddRange(
            new Account { OrganizationId = org, Name = "Globex Industries" },
            new Account { OrganizationId = org, Name = "Globex Inc" },
            new Account { OrganizationId = org, Name = "Northwind Traders" });
        await db.SaveChangesAsync();

        var scan = await new DuplicateDetectionService(db, tenant).ScanAsync();

        Assert.Equal(1, scan.CandidatesCreated);
        var candidate = await db.DuplicateCandidates.SingleAsync();
        Assert.Equal(EntityTypes.Account, candidate.EntityType);
    }

    [Fact]
    public async Task Dismiss_ClearsDuplicateReviewFlags()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        await using var db = CreateContext(database, tenant);
        db.AuditEnabled = false;

        var a = new Account { OrganizationId = org, Name = "Acme Corporation", Domain = "acme.com" };
        var b = new Account { OrganizationId = org, Name = "Acme Corp", Domain = "acme.com" };
        a.CreatedAt = DateTime.UtcNow.AddMinutes(-5);
        b.CreatedAt = DateTime.UtcNow;
        db.Accounts.AddRange(a, b);
        await db.SaveChangesAsync();

        var service = new DuplicateDetectionService(db, tenant);
        await service.ScanAsync();
        var candidate = await db.DuplicateCandidates.SingleAsync();
        Assert.True(a.IsDuplicateCandidate && b.IsDuplicateCandidate);

        await service.DismissAsync(candidate.Id);

        var stored = await db.DuplicateCandidates.SingleAsync();
        Assert.Equal(DuplicateStatus.Dismissed, stored.Status);
        Assert.False(a.IsDuplicateCandidate);
        Assert.False(b.IsDuplicateCandidate);
    }

    [Fact]
    public async Task MergeAccounts_RelinksConvertedLeadsAndAccountActivity()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        Guid primaryId;
        Guid duplicateId;

        await using (var db = CreateContext(database, tenant))
        {
            db.AuditEnabled = false;
            var primary = new Account { OrganizationId = org, Name = "Northwind Traders", Domain = "northwind.com" };
            var duplicate = new Account { OrganizationId = org, Name = "Northwind Trading", Domain = "northwind.com" };
            primary.CreatedAt = DateTime.UtcNow.AddMinutes(-5);
            duplicate.CreatedAt = DateTime.UtcNow;
            db.Accounts.AddRange(primary, duplicate);

            db.Leads.Add(new Lead
            {
                OrganizationId = org, FirstName = "Ada", LastName = "Lovelace",
                Status = LeadStatus.Converted, ConvertedAccountId = duplicate.Id
            });
            db.Activities.Add(new Activity
            {
                OrganizationId = org, Type = ActivityType.Note, Subject = "Legacy note",
                Status = ActivityStatus.Completed, RelatedType = EntityTypes.Account, RelatedId = duplicate.Id
            });
            await db.SaveChangesAsync();

            primaryId = primary.Id;
            duplicateId = duplicate.Id;

            var service = new DuplicateDetectionService(db, tenant);
            await service.ScanAsync();
            var candidate = await db.DuplicateCandidates.SingleAsync();
            var result = await service.MergeAsync(candidate.Id);
            Assert.Equal(2, result.RelinkedRecords);
        }

        await using (var db = CreateContext(database, tenant))
        {
            Assert.False(await db.Accounts.AnyAsync(a => a.Id == duplicateId));
            Assert.Equal(primaryId, (await db.Leads.SingleAsync()).ConvertedAccountId);
            Assert.Equal(primaryId, (await db.Activities.SingleAsync(a => a.Subject == "Legacy note")).RelatedId);
        }
    }

    [Fact]
    public async Task ApplyRouting_SendsHighScoreLeadToLeastLoadedRep()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        await using var db = CreateContext(database, tenant);
        db.AuditEnabled = false;

        var busy = new User
        {
            OrganizationId = org, Email = "busy@helix.test", FirstName = "Busy", LastName = "Rep",
            Role = Roles.Rep, IsActive = true
        };
        var idle = new User
        {
            OrganizationId = org, Email = "idle@helix.test", FirstName = "Idle", LastName = "Rep",
            Role = Roles.Rep, IsActive = true
        };
        db.Users.AddRange(busy, idle);
        db.Leads.AddRange(
            new Lead { OrganizationId = org, FirstName = "One", LastName = "Lead", OwnerId = busy.Id },
            new Lead { OrganizationId = org, FirstName = "Two", LastName = "Lead", OwnerId = busy.Id });
        await db.SaveChangesAsync();

        var autopilot = new LeadAutopilot(db);
        var lead = new Lead
        {
            OrganizationId = org, FirstName = "Ada", LastName = "Lovelace", Company = "Acme",
            Email = "ada@acme.com", Title = "CTO", Score = 90
        };

        await autopilot.ApplyRoutingAsync(lead, Organization(), busy.Id, ownerExplicit: false);

        Assert.Equal(idle.Id, lead.OwnerId);
        Assert.Equal(LeadRoutingState.AutoRouted, lead.RoutingState);
    }

    [Fact]
    public async Task ApplyRouting_KeepsLowScoreLeadInSdrQueue()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        await using var db = CreateContext(database, tenant);
        db.AuditEnabled = false;

        var rep = new User
        {
            OrganizationId = org, Email = "rep@helix.test", FirstName = "Rep", LastName = "One",
            Role = Roles.Rep, IsActive = true
        };
        db.Users.Add(rep);
        await db.SaveChangesAsync();

        var autopilot = new LeadAutopilot(db);
        var lead = new Lead { OrganizationId = org, FirstName = "Cold", LastName = "Lead", Score = 40 };

        await autopilot.ApplyRoutingAsync(lead, Organization(), rep.Id, ownerExplicit: false);

        Assert.Equal(rep.Id, lead.OwnerId);
        Assert.Equal(LeadRoutingState.SdrQueue, lead.RoutingState);
    }

    [Fact]
    public async Task ApplyRouting_BalancesAcrossRepsWithinOneUnitOfWork()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        await using var db = CreateContext(database, tenant);
        db.AuditEnabled = false;

        db.Users.AddRange(
            new User { OrganizationId = org, Email = "a@helix.test", FirstName = "A", LastName = "Rep", Role = Roles.Rep, IsActive = true },
            new User { OrganizationId = org, Email = "b@helix.test", FirstName = "B", LastName = "Rep", Role = Roles.Rep, IsActive = true });
        await db.SaveChangesAsync();

        var autopilot = new LeadAutopilot(db);
        var organization = Organization();

        var first = new Lead { OrganizationId = org, FirstName = "One", LastName = "Lead", Score = 90 };
        db.Leads.Add(first);
        await autopilot.ApplyRoutingAsync(first, organization, Guid.NewGuid(), ownerExplicit: false);

        var second = new Lead { OrganizationId = org, FirstName = "Two", LastName = "Lead", Score = 90 };
        db.Leads.Add(second);
        await autopilot.ApplyRoutingAsync(second, organization, Guid.NewGuid(), ownerExplicit: false);

        Assert.NotNull(first.OwnerId);
        Assert.NotNull(second.OwnerId);
        Assert.NotEqual(first.OwnerId, second.OwnerId);
        Assert.Equal(LeadRoutingState.AutoRouted, second.RoutingState);
    }

    [Fact]
    public async Task ApplyScore_PersistsExplainableBreakdown()
    {
        var database = Guid.NewGuid().ToString();
        await using var db = CreateContext(database, new FakeTenant(Guid.NewGuid()));

        var lead = new Lead
        {
            FirstName = "Ada", LastName = "Lovelace", Company = "Acme", Email = "ada@acme.com",
            Phone = "+1 415 555 0100", Title = "Chief Technology Officer",
            Website = "https://acme.com", Source = "Referral", EstimatedValue = 120_000m
        };

        var breakdown = await new LeadAutopilot(db).ApplyScoreAsync(lead);

        Assert.Equal(100, breakdown.Total);
        Assert.Equal(100, lead.Score);
        Assert.NotNull(lead.ScoreUpdatedAt);
        Assert.Contains("corporate_email", lead.ScoreBreakdownJson);
    }

    [Fact]
    public async Task LeadRoutingSweep_AssignsUnownedHighIntentLeads()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        await using var db = CreateContext(database, tenant);
        db.AuditEnabled = false;

        db.Users.Add(new User
        {
            OrganizationId = org, Email = "rep@helix.test", FirstName = "Rep", LastName = "One",
            Role = Roles.Rep, IsActive = true
        });
        var lead = new Lead
        {
            OrganizationId = org, FirstName = "Hot", LastName = "Lead", Score = 88,
            RoutingState = LeadRoutingState.Unrouted, Status = LeadStatus.New
        };
        db.Leads.Add(lead);
        await db.SaveChangesAsync();

        var monitor = new AutonomousMonitor(db, new LeadAutopilot(db));
        var summary = await monitor.RunLeadRoutingAsync(Organization());

        Assert.Equal(1, summary.Reviewed);
        Assert.Equal(1, summary.Routed);
        Assert.NotNull(lead.OwnerId);
        Assert.Equal(LeadRoutingState.AutoRouted, lead.RoutingState);

        var disabled = Organization();
        disabled.AutoRouteLeads = false;
        Assert.Equal((0, 0), await monitor.RunLeadRoutingAsync(disabled));
    }

    [Fact]
    public async Task DealStagnation_FlagsDealAndCreatesFollowUpTask()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        await using var db = CreateContext(database, tenant);
        db.AuditEnabled = false;

        var pipeline = new Pipeline { OrganizationId = org, Name = "Sales", IsDefault = true };
        var stage = new Stage { OrganizationId = org, PipelineId = pipeline.Id, Name = "Discovery", Probability = 50 };
        db.Pipelines.Add(pipeline);
        db.Stages.Add(stage);

        var deal = new Deal
        {
            OrganizationId = org, Name = "Acme expansion", Amount = 25_000m,
            PipelineId = pipeline.Id, StageId = stage.Id, Status = DealStatus.Open, Probability = 50,
            LastStageMovedAt = DateTime.UtcNow.AddDays(-30), UpdatedAt = DateTime.UtcNow.AddDays(-30)
        };
        db.Deals.Add(deal);
        await db.SaveChangesAsync();

        var summary = await new AutonomousMonitor(db, new LeadAutopilot(db)).RunDealStagnationAsync(Organization());

        Assert.Equal(1, summary.Reviewed);
        Assert.Equal(1, summary.Flagged);
        var stored = await db.Deals.SingleAsync();
        Assert.True(stored.IsStalled);
        Assert.Equal(35, stored.Probability);
        Assert.InRange(stored.HealthIndex, 0, 45);
        Assert.True(await db.Activities.AnyAsync(a =>
            a.RelatedType == EntityTypes.Deal && a.RelatedId == stored.Id
            && a.Status == ActivityStatus.Open && a.Subject.StartsWith("Re-engage")));
    }

    [Fact]
    public async Task SlaMonitor_EscalatesBreachedTicket()
    {
        var org = Guid.NewGuid();
        var database = Guid.NewGuid().ToString();
        var tenant = new FakeTenant(org);

        await using var db = CreateContext(database, tenant);
        db.AuditEnabled = false;

        var ticket = new Ticket
        {
            OrganizationId = org, Number = "TCK-1001", Subject = "Login outage", Status = TicketStatus.Open,
            Priority = "Normal", CreatedAt = DateTime.UtcNow.AddHours(-2), SlaDueAt = DateTime.UtcNow.AddHours(-1)
        };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var summary = await new AutonomousMonitor(db, new LeadAutopilot(db)).RunSlaEscalationAsync(Organization());

        Assert.Equal(1, summary.Reviewed);
        Assert.Equal(1, summary.Escalated);
        var stored = await db.Tickets.SingleAsync();
        Assert.True(stored.SlaBreached);
        Assert.Equal(2, stored.EscalationLevel);
        Assert.Equal("Urgent", stored.Priority);
    }
}
