using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Dashboard;

[ApiController]
[Route("api/v1/dashboard")]
public class DashboardController(HelixDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> Get()
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var me = User.GetUserId();

        var openDealRows = await db.Deals.AsNoTracking()
            .Select(d => new { d.Id, d.Name, d.Amount, d.Probability, d.Status, d.OwnerId, d.StageId, d.ClosedAt, d.UpdatedAt, d.AccountId })
            .ToListAsync();

        var openDeals = openDealRows.Where(d => d.Status == DealStatus.Open).ToList();
        var wonDeals = openDealRows.Where(d => d.Status == DealStatus.Won).ToList();
        var lostCount = openDealRows.Count(d => d.Status == DealStatus.Lost);

        var wonThisMonth = wonDeals.Where(d => (d.ClosedAt ?? d.UpdatedAt) >= monthStart).Sum(d => d.Amount);
        var wonCount = wonDeals.Count;
        var winRate = wonCount + lostCount == 0 ? 0 : Math.Round(wonCount * 100m / (wonCount + lostCount), 1);

        var activeAccounts = await db.Accounts.CountAsync();
        var contactCount = await db.Contacts.CountAsync();
        var newLeads30 = await db.Leads.CountAsync(l => l.CreatedAt >= now.AddDays(-30));
        var openLeads = await db.Leads.CountAsync(l => l.Status != LeadStatus.Converted && l.Status != LeadStatus.Unqualified);
        var convertedLeads = await db.Leads.CountAsync(l => l.Status == LeadStatus.Converted);
        var totalLeads = await db.Leads.CountAsync();
        var conversionRate = totalLeads == 0 ? 0 : Math.Round(convertedLeads * 100m / totalLeads, 1);
        var openTickets = await db.Tickets.CountAsync(t => t.Status == TicketStatus.Open || t.Status == TicketStatus.Pending);
        var avgDealSize = openDeals.Count == 0 ? 0 : Math.Round(openDeals.Average(d => d.Amount), 2);
        var weighted = Math.Round(openDeals.Sum(d => d.Amount * d.Probability / 100m), 2);

        var defaultPipeline = await db.Pipelines.AsNoTracking()
            .OrderByDescending(p => p.IsDefault).ThenBy(p => p.Name).FirstOrDefaultAsync();
        var stages = defaultPipeline is null
            ? []
            : await db.Stages.AsNoTracking().Where(s => s.PipelineId == defaultPipeline.Id).OrderBy(s => s.SortOrder).ToListAsync();

        var allStages = await db.Stages.AsNoTracking().ToListAsync();

        var pipelineByStage = stages.Select(s =>
        {
            var stageDeals = openDeals.Where(d => d.StageId == s.Id).ToList();
            return new { id = s.Id, name = s.Name, color = s.Color, probability = s.Probability, count = stageDeals.Count, value = stageDeals.Sum(d => d.Amount) };
        }).ToList();

        var since = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-5);
        var revenueTrend = Enumerable.Range(0, 6).Select(i =>
        {
            var start = since.AddMonths(i);
            var end = start.AddMonths(1);
            var monthDeals = wonDeals.Where(d => (d.ClosedAt ?? d.UpdatedAt) >= start && (d.ClosedAt ?? d.UpdatedAt) < end).ToList();
            return new { month = start.ToString("MMM"), key = start.ToString("yyyy-MM"), value = monthDeals.Sum(d => d.Amount), count = monthDeals.Count };
        }).ToList();

        var sourceRows = await db.Leads.AsNoTracking().Select(l => new { l.Source, l.EstimatedValue }).ToListAsync();
        var leadsBySource = sourceRows.GroupBy(l => string.IsNullOrWhiteSpace(l.Source) ? "Unknown" : l.Source)
            .Select(g => new { source = g.Key, count = g.Count(), value = g.Sum(x => x.EstimatedValue ?? 0) })
            .OrderByDescending(x => x.count).ToList();

        var users = await db.Users.AsNoTracking().Where(u => u.IsActive).ToListAsync();
        var leaderboard = users.Select(u =>
        {
            var mine = openDealRows.Where(d => d.OwnerId == u.Id).ToList();
            return new
            {
                user = new { id = u.Id, fullName = u.FullName, avatarUrl = u.AvatarUrl, role = u.Role },
                openValue = mine.Where(d => d.Status == DealStatus.Open).Sum(d => d.Amount),
                openCount = mine.Count(d => d.Status == DealStatus.Open),
                wonValue = mine.Where(d => d.Status == DealStatus.Won && (d.ClosedAt ?? d.UpdatedAt) >= monthStart.AddMonths(-2)).Sum(d => d.Amount),
                wonCount = mine.Count(d => d.Status == DealStatus.Won && (d.ClosedAt ?? d.UpdatedAt) >= monthStart.AddMonths(-2))
            };
        }).OrderByDescending(x => x.wonValue).ThenByDescending(x => x.openValue).ToList();

        var myTaskRows = await db.Activities.AsNoTracking()
            .Where(a => a.OwnerId == me && a.Status == ActivityStatus.Open && a.DueAt != null)
            .Include(a => a.Owner)
            .OrderBy(a => a.DueAt).Take(8).ToListAsync();

        var recentRows = await db.Activities.AsNoTracking().Include(a => a.Owner)
            .OrderByDescending(a => a.CreatedAt).Take(10).ToListAsync();
        var relatedNames = await ResolveRelatedNames(recentRows.Concat(myTaskRows).ToList());

        var myTasks = myTaskRows.Select(a => SharedMapper.Activity(a, a.Owner, relatedNames.GetValueOrDefault(a.RelatedId))).ToList();
        var recentActivity = recentRows.Select(a => SharedMapper.Activity(a, a.Owner, relatedNames.GetValueOrDefault(a.RelatedId))).ToList();

        var accountNames = await db.Accounts.AsNoTracking()
            .Select(a => new { a.Id, a.Name }).ToDictionaryAsync(a => a.Id, a => a.Name);

        var topDeals = openDeals.OrderByDescending(d => d.Amount).Take(6).Select(d =>
        {
            var stage = allStages.FirstOrDefault(s => s.Id == d.StageId);
            var owner = users.FirstOrDefault(u => u.Id == d.OwnerId);
            return new
            {
                id = d.Id,
                name = d.Name,
                amount = d.Amount,
                probability = d.Probability,
                accountName = d.AccountId is not null && accountNames.TryGetValue(d.AccountId.Value, out var n) ? n : null,
                stageName = stage?.Name ?? "—",
                stageColor = stage?.Color ?? "#94a3b8",
                ownerName = owner?.FullName,
                ownerAvatarUrl = owner?.AvatarUrl
            };
        }).ToList();

        var ticketRows = await db.Tickets.AsNoTracking().Select(t => new { t.Status, t.Priority, t.CreatedAt }).ToListAsync();
        var tickets = new
        {
            total = ticketRows.Count,
            open = ticketRows.Count(t => t.Status == TicketStatus.Open),
            pending = ticketRows.Count(t => t.Status == TicketStatus.Pending),
            resolved = ticketRows.Count(t => t.Status == TicketStatus.Resolved || t.Status == TicketStatus.Closed),
            urgent = ticketRows.Count(t => t.Priority == "Urgent" && t.Status != TicketStatus.Closed),
            byStatus = new[] { TicketStatus.Open, TicketStatus.Pending, TicketStatus.Resolved, TicketStatus.Closed }
                .Select(s => new { status = s, count = ticketRows.Count(t => t.Status == s) }).ToList(),
            byPriority = new[] { "Low", "Normal", "High", "Urgent" }
                .Select(p => new { priority = p, count = ticketRows.Count(t => t.Priority == p) }).ToList()
        };

        return Ok(new
        {
            kpis = new
            {
                openPipelineValue = openDeals.Sum(d => d.Amount),
                weightedPipelineValue = weighted,
                wonThisMonth,
                winRate,
                newLeads30,
                openLeads,
                conversionRate,
                activeAccounts,
                contacts = contactCount,
                openTickets,
                avgDealSize,
                openDeals = openDeals.Count,
                tasksDue = myTasks.Count(t => t.DueAt is not null && t.DueAt <= now.AddDays(1)),
                overdueTasks = myTasks.Count(t => t.DueAt is not null && t.DueAt < now)
            },
            pipelineByStage,
            pipelineName = defaultPipeline?.Name,
            revenueTrend,
            leadsBySource,
            leaderboard,
            topDeals,
            myTasks,
            recentActivity,
            tickets,
            generatedAt = now
        });
    }

    private async Task<Dictionary<Guid, string>> ResolveRelatedNames(List<Activity> activities)
    {
        var result = new Dictionary<Guid, string>();
        var accountIds = activities.Where(a => a.RelatedType == EntityTypes.Account).Select(a => a.RelatedId).Distinct().ToList();
        var contactIds = activities.Where(a => a.RelatedType == EntityTypes.Contact).Select(a => a.RelatedId).Distinct().ToList();
        var leadIds = activities.Where(a => a.RelatedType == EntityTypes.Lead).Select(a => a.RelatedId).Distinct().ToList();
        var dealIds = activities.Where(a => a.RelatedType == EntityTypes.Deal).Select(a => a.RelatedId).Distinct().ToList();
        var ticketIds = activities.Where(a => a.RelatedType == EntityTypes.Ticket).Select(a => a.RelatedId).Distinct().ToList();

        if (accountIds.Count > 0)
            foreach (var x in await db.Accounts.Where(a => accountIds.Contains(a.Id)).Select(a => new { a.Id, a.Name }).ToListAsync())
                result[x.Id] = x.Name;
        if (dealIds.Count > 0)
            foreach (var x in await db.Deals.Where(d => dealIds.Contains(d.Id)).Select(d => new { d.Id, d.Name }).ToListAsync())
                result[x.Id] = x.Name;
        if (ticketIds.Count > 0)
            foreach (var x in await db.Tickets.Where(t => ticketIds.Contains(t.Id)).Select(t => new { t.Id, t.Subject }).ToListAsync())
                result[x.Id] = x.Subject;
        if (contactIds.Count > 0)
            foreach (var x in await db.Contacts.Where(c => contactIds.Contains(c.Id)).Select(c => new { c.Id, c.FirstName, c.LastName }).ToListAsync())
                result[x.Id] = $"{x.FirstName} {x.LastName}".Trim();
        if (leadIds.Count > 0)
            foreach (var x in await db.Leads.Where(l => leadIds.Contains(l.Id)).Select(l => new { l.Id, l.FirstName, l.LastName }).ToListAsync())
                result[x.Id] = $"{x.FirstName} {x.LastName}".Trim();

        return result;
    }
}
