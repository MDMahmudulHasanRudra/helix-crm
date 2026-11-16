using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Dashboard;

[ApiController]
[Route("api/v1/reports")]
public class ReportsController(HelixDbContext db) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<ActionResult<object>> Summary([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var now = DateTime.UtcNow;
        var end = to ?? now;
        var start = from ?? new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-11);

        var deals = await db.Deals.AsNoTracking()
            .Select(d => new { d.Id, d.Name, d.Amount, d.Currency, d.Status, d.OwnerId, d.AccountId,
                d.StageId, d.PipelineId, d.Probability, d.ClosedAt, d.CreatedAt, d.UpdatedAt, d.ExpectedCloseDate })
            .ToListAsync();
        var accounts = await db.Accounts.AsNoTracking().Select(a => new { a.Id, a.Name, a.Industry }).ToListAsync();
        var users = await db.Users.AsNoTracking().Where(u => u.IsActive).ToListAsync();
        var stages = await db.Stages.AsNoTracking().ToListAsync();
        var leads = await db.Leads.AsNoTracking().Select(l => new { l.Id, l.Source, l.Status, l.EstimatedValue, l.CreatedAt, l.ConvertedAt }).ToListAsync();
        var tickets = await db.Tickets.AsNoTracking().Select(t => new { t.Status, t.Priority, t.Channel, t.CreatedAt, t.ResolvedAt }).ToListAsync();
        var activities = await db.Activities.AsNoTracking().Select(a => new { a.Type, a.CreatedAt, a.Status }).ToListAsync();

        var inRange = deals.Where(d => (d.ClosedAt ?? d.UpdatedAt) >= start && (d.ClosedAt ?? d.UpdatedAt) <= end).ToList();
        var won = inRange.Where(d => d.Status == DealStatus.Won).ToList();
        var lost = inRange.Where(d => d.Status == DealStatus.Lost).ToList();
        var open = deals.Where(d => d.Status == DealStatus.Open).ToList();

        var months = new List<object>();
        var cursor = new DateTime(start.Year, start.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        while (cursor <= end && months.Count < 36)
        {
            var next = cursor.AddMonths(1);
            var monthWon = won.Where(d => (d.ClosedAt ?? d.UpdatedAt) >= cursor && (d.ClosedAt ?? d.UpdatedAt) < next).ToList();
            var monthLost = lost.Where(d => (d.ClosedAt ?? d.UpdatedAt) >= cursor && (d.ClosedAt ?? d.UpdatedAt) < next).ToList();
            months.Add(new
            {
                key = cursor.ToString("yyyy-MM"),
                month = cursor.ToString("MMM yy"),
                wonValue = monthWon.Sum(d => d.Amount),
                wonCount = monthWon.Count,
                lostCount = monthLost.Count,
                pipelineCreated = deals.Where(d => d.CreatedAt >= cursor && d.CreatedAt < next).Sum(d => d.Amount)
            });
            cursor = next;
        }

        var pipelineByStage = stages.OrderBy(s => s.SortOrder).Select(s =>
        {
            var stageDeals = open.Where(d => d.StageId == s.Id).ToList();
            return new { id = s.Id, name = s.Name, color = s.Color, count = stageDeals.Count, value = stageDeals.Sum(d => d.Amount) };
        }).ToList();

        var dealsByOwner = users.Select(u =>
        {
            var mine = deals.Where(d => d.OwnerId == u.Id).ToList();
            var mineWon = won.Where(d => d.OwnerId == u.Id).ToList();
            var mineLost = lost.Where(d => d.OwnerId == u.Id).ToList();
            return new
            {
                ownerId = u.Id,
                name = u.FullName,
                avatarUrl = u.AvatarUrl,
                openValue = mine.Where(d => d.Status == DealStatus.Open).Sum(d => d.Amount),
                openCount = mine.Count(d => d.Status == DealStatus.Open),
                wonValue = mineWon.Sum(d => d.Amount),
                wonCount = mineWon.Count,
                winRate = mineWon.Count + mineLost.Count == 0 ? 0 : Math.Round(mineWon.Count * 100m / (mineWon.Count + mineLost.Count), 1)
            };
        }).OrderByDescending(x => x.wonValue).ToList();

        var accountStats = accounts.Select(a =>
        {
            var mine = deals.Where(d => d.AccountId == a.Id).ToList();
            return new
            {
                accountId = a.Id,
                name = a.Name,
                industry = a.Industry,
                openValue = mine.Where(d => d.Status == DealStatus.Open).Sum(d => d.Amount),
                wonValue = won.Where(d => d.AccountId == a.Id).Sum(d => d.Amount),
                dealCount = mine.Count
            };
        }).OrderByDescending(x => x.wonValue + x.openValue).Take(10).ToList();

        var leadRows = leads.Where(l => l.CreatedAt >= start && l.CreatedAt <= end).ToList();
        var leadsBySource = leadRows.GroupBy(l => string.IsNullOrWhiteSpace(l.Source) ? "Unknown" : l.Source)
            .Select(g => new { source = g.Key, count = g.Count(), value = g.Sum(x => x.EstimatedValue ?? 0) })
            .OrderByDescending(x => x.count).ToList();
        var leadFunnel = new[] { LeadStatus.New, LeadStatus.Contacted, LeadStatus.Qualified, LeadStatus.Converted, LeadStatus.Unqualified }
            .Select(s => new { status = s, count = leadRows.Count(l => l.Status == s) }).ToList();

        var ticketsByStatus = new[] { TicketStatus.Open, TicketStatus.Pending, TicketStatus.Resolved, TicketStatus.Closed }
            .Select(s => new { status = s, count = tickets.Count(t => t.Status == s) }).ToList();
        var ticketsByChannel = tickets.GroupBy(t => t.Channel)
            .Select(g => new { channel = g.Key, count = g.Count() }).OrderByDescending(x => x.count).ToList();
        var resolvedTickets = tickets.Where(t => t.ResolvedAt is not null).ToList();
        var avgResolutionHours = resolvedTickets.Count == 0 ? 0 :
            Math.Round(resolvedTickets.Average(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours), 1);

        var activityByType = ActivityType.All.Select(t =>
            new { type = t, count = activities.Count(a => a.Type == t) }).ToList();

        return Ok(new
        {
            range = new { from = start, to = end },
            kpis = new
            {
                wonValue = won.Sum(d => d.Amount),
                lostValue = lost.Sum(d => d.Amount),
                openPipeline = open.Sum(d => d.Amount),
                weightedPipeline = Math.Round(open.Sum(d => d.Amount * d.Probability / 100m), 2),
                wonCount = won.Count,
                lostCount = lost.Count,
                winRate = won.Count + lost.Count == 0 ? 0 : Math.Round(won.Count * 100m / (won.Count + lost.Count), 1),
                avgDealSize = won.Count == 0 ? 0 : Math.Round(won.Average(d => d.Amount), 2),
                newLeads = leadRows.Count,
                conversionRate = leadRows.Count == 0 ? 0 : Math.Round(leadRows.Count(l => l.Status == LeadStatus.Converted) * 100m / leadRows.Count, 1),
                avgTicketResolutionHours = avgResolutionHours,
                ticketsResolved = resolvedTickets.Count
            },
            months,
            pipelineByStage,
            dealsByOwner,
            topAccounts = accountStats,
            leadsBySource,
            leadFunnel,
            ticketsByStatus,
            ticketsByChannel,
            activityByType
        });
    }
}
