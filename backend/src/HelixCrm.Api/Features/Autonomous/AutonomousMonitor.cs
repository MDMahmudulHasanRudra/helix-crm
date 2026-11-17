using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Autonomous;

public record AutonomousRunSummary(
    int DealsReviewed,
    int DealsFlaggedStalled,
    int TicketsReviewed,
    int TicketsEscalated,
    int ContactsReviewed,
    int ContactsFlaggedStale,
    int LeadsReviewed,
    int LeadsRouted,
    DateTime RanAt);

public record AutonomousInsightItem(
    string Type,
    Guid Id,
    string Title,
    string Subtitle,
    string Url,
    string Severity);

public record AutonomousInsights(
    bool Enabled,
    int StalledDeals,
    decimal StalledDealValue,
    int SlaBreaches,
    int Escalations,
    int StaleContacts,
    int DuplicateCandidates,
    int HighScoreLeads,
    IReadOnlyList<AutonomousInsightItem> Items,
    DateTime GeneratedAt);

/// <summary>
/// The five autonomous workers, minus external enrichment: pipeline velocity,
/// SLA escalation, record freshness and duplicate flagging. Each monitor is
/// idempotent so it is safe to run on a schedule and on demand.
/// </summary>
public class AutonomousMonitor(HelixDbContext db, LeadAutopilot leadAutopilot)
{
    private const int ActivityGraceDays = 7;

    public async Task<AutonomousRunSummary> RunAllAsync(Organization organization)
    {
        var deals = await RunDealStagnationAsync(organization);
        var tickets = await RunSlaEscalationAsync(organization);
        var contacts = await RunFreshnessAsync(organization);
        var leads = await RunLeadRoutingAsync(organization);
        return new AutonomousRunSummary(
            deals.Reviewed, deals.Flagged,
            tickets.Reviewed, tickets.Escalated,
            contacts.Reviewed, contacts.Flagged,
            leads.Reviewed, leads.Routed,
            DateTime.UtcNow);
    }

    /// <summary>
    /// Routes inbound high-intent leads that never got an owner (CSV drops,
    /// integrations, imports done while routing was disabled).
    /// </summary>
    public async Task<(int Reviewed, int Routed)> RunLeadRoutingAsync(Organization organization)
    {
        if (!organization.AutoRouteLeads) return (0, 0);

        var leads = await db.Leads
            .Where(l => l.OwnerId == null
                && l.Score >= organization.LeadScoreRoutingThreshold
                && l.Status != LeadStatus.Converted
                && l.Status != LeadStatus.Unqualified
                && (l.RoutingState == LeadRoutingState.Unrouted || l.RoutingState == LeadRoutingState.SdrQueue))
            .OrderByDescending(l => l.Score)
            .Take(100)
            .ToListAsync();
        if (leads.Count == 0) return (0, 0);

        var routed = 0;
        var changed = false;
        foreach (var lead in leads)
        {
            await leadAutopilot.ApplyRoutingAsync(lead, organization, fallbackOwnerId: null, ownerExplicit: false);
            if (lead.OwnerId is not null)
            {
                routed++;
                changed = true;
            }
            else if (lead.RoutingState != LeadRoutingState.Unrouted)
            {
                changed = true;
            }
        }

        if (changed) await db.SaveChangesAsync();
        return (leads.Count, routed);
    }

    public async Task<(int Reviewed, int Flagged)> RunDealStagnationAsync(Organization organization)
    {
        var now = DateTime.UtcNow;
        var deals = await db.Deals.Where(d => d.Status == DealStatus.Open).ToListAsync();
        if (deals.Count == 0) return (0, 0);

        var activityRows = await db.Activities.AsNoTracking()
            .Where(a => a.RelatedType == EntityTypes.Deal)
            .Select(a => new { a.RelatedId, a.CreatedAt })
            .ToListAsync();
        var lastActivity = activityRows
            .GroupBy(a => a.RelatedId)
            .ToDictionary(g => g.Key, g => g.Max(a => a.CreatedAt));

        var stageNames = await db.Stages.AsNoTracking()
            .Select(s => new { s.Id, s.Name }).ToDictionaryAsync(s => s.Id, s => s.Name);

        var flagged = 0;
        var changed = false;

        foreach (var deal in deals)
        {
            var anchor = deal.LastStageMovedAt ?? deal.UpdatedAt;
            var daysInStage = (now - anchor).TotalDays;
            var lastTouch = lastActivity.TryGetValue(deal.Id, out var touched)
                ? (touched > anchor ? touched : anchor)
                : anchor;
            var daysSinceTouch = (now - lastTouch).TotalDays;

            var shouldStall = daysInStage > organization.StaleDealDays && daysSinceTouch > ActivityGraceDays;
            var health = Math.Clamp(100 - (int)Math.Round(daysSinceTouch * 1.5), 0, 100);
            if (shouldStall) health = Math.Min(health, 45);

            if (shouldStall && !deal.IsStalled)
            {
                deal.IsStalled = true;
                deal.Probability = Math.Max(0, deal.Probability - organization.StaleDealProbabilityPenalty);
                deal.HealthIndex = health;
                changed = true;
                flagged++;

                var subject = $"Re-engage “{deal.Name}” — stalled in {stageNames.GetValueOrDefault(deal.StageId, "its stage")}";
                var hasTask = await db.Activities.AnyAsync(a =>
                    a.RelatedType == EntityTypes.Deal && a.RelatedId == deal.Id
                    && a.Status == ActivityStatus.Open && a.Type == ActivityType.Task
                    && a.Subject.StartsWith("Re-engage"));
                if (!hasTask)
                {
                    db.Activities.Add(new Activity
                    {
                        OrganizationId = deal.OrganizationId,
                        Type = ActivityType.Task,
                        Subject = subject,
                        Body = $"The autonomous velocity monitor has not seen activity on this deal for {Math.Round(daysSinceTouch)} days. Confirm the next step or mark it lost.",
                        DueAt = now.AddDays(1),
                        Priority = "High",
                        RelatedType = EntityTypes.Deal,
                        RelatedId = deal.Id,
                        OwnerId = deal.OwnerId,
                        Status = ActivityStatus.Open
                    });
                }

                if (daysInStage > 30)
                {
                    await NotifyManagersAsync(deal.OrganizationId, deal.OwnerId,
                        $"Stalled deal: {deal.Name}",
                        $"This deal has been in {stageNames.GetValueOrDefault(deal.StageId, "its stage")} for {Math.Round(daysInStage)} days.",
                        $"/deals/{deal.Id}");
                }
            }
            else if (!shouldStall)
            {
                if (deal.IsStalled)
                {
                    deal.IsStalled = false;
                    changed = true;
                }
                if (deal.HealthIndex != health)
                {
                    deal.HealthIndex = health;
                    changed = true;
                }
            }
        }

        if (changed) await db.SaveChangesAsync();
        return (deals.Count, flagged);
    }

    public async Task<(int Reviewed, int Escalated)> RunSlaEscalationAsync(Organization organization)
    {
        var now = DateTime.UtcNow;
        var tickets = await db.Tickets
            .Where(t => (t.Status == TicketStatus.Open || t.Status == TicketStatus.Pending) && t.SlaDueAt != null)
            .ToListAsync();
        if (tickets.Count == 0) return (0, 0);

        var escalated = 0;
        var changed = false;

        foreach (var ticket in tickets)
        {
            var total = (ticket.SlaDueAt!.Value - ticket.CreatedAt).TotalSeconds;
            if (total <= 0) total = 1;
            var remaining = (ticket.SlaDueAt.Value - now).TotalSeconds;
            var ratio = remaining / total;

            if (ratio <= 0)
            {
                if (!ticket.SlaBreached)
                {
                    ticket.SlaBreached = true;
                    ticket.EscalationLevel = 2;
                    ticket.SlaWarnedAt ??= now;
                    if (ticket.Priority != "Urgent") ticket.Priority = "Urgent";
                    changed = true;
                    escalated++;

                    await NotifyAsync(ticket.OrganizationId, ticket.AssigneeId,
                        $"SLA breached: {ticket.Number}",
                        $"{ticket.Subject} passed its SLA target and was escalated.",
                        $"/tickets/{ticket.Id}", "danger");
                    await NotifyManagersAsync(ticket.OrganizationId, ticket.AssigneeId,
                        $"Escalated ticket {ticket.Number}",
                        $"{ticket.Subject} breached its SLA and needs a second pair of eyes.",
                        $"/tickets/{ticket.Id}");
                }
                else if (ticket.EscalationLevel < 2)
                {
                    ticket.EscalationLevel = 2;
                    changed = true;
                }
            }
            else if (ratio <= 0.25 && ticket.EscalationLevel == 0)
            {
                ticket.EscalationLevel = 1;
                ticket.SlaWarnedAt = now;
                changed = true;
                escalated++;

                await NotifyAsync(ticket.OrganizationId, ticket.AssigneeId,
                    $"SLA warning: {ticket.Number}",
                    $"{ticket.Subject} has less than 25% of its SLA window left.",
                    $"/tickets/{ticket.Id}", "warning");
            }
        }

        if (changed) await db.SaveChangesAsync();
        return (tickets.Count, escalated);
    }

    public async Task<(int Reviewed, int Flagged)> RunFreshnessAsync(Organization organization)
    {
        var now = DateTime.UtcNow;
        var days = Math.Max(30, organization.DataFreshnessDays);

        var contactActivity = await db.Activities.AsNoTracking()
            .Where(a => a.RelatedType == EntityTypes.Contact)
            .Select(a => new { a.RelatedId, a.CreatedAt })
            .ToListAsync();
        var lastContactTouch = contactActivity
            .GroupBy(a => a.RelatedId)
            .ToDictionary(g => g.Key, g => g.Max(a => a.CreatedAt));

        var contacts = await db.Contacts.ToListAsync();
        var flagged = 0;
        var changed = false;
        foreach (var contact in contacts)
        {
            var anchor = lastContactTouch.TryGetValue(contact.Id, out var touched)
                ? (touched > contact.UpdatedAt ? touched : contact.UpdatedAt)
                : contact.UpdatedAt;
            var idleDays = (now - anchor).TotalDays;
            var score = Math.Clamp(100 - (int)Math.Round(idleDays * 100 / days), 0, 100);
            var stale = idleDays > days;
            if (contact.IsStale != stale || contact.DataFreshnessScore != score)
            {
                contact.IsStale = stale;
                contact.DataFreshnessScore = score;
                changed = true;
                if (stale) flagged++;
            }
        }

        var accountActivity = await db.Activities.AsNoTracking()
            .Where(a => a.RelatedType == EntityTypes.Account)
            .Select(a => new { a.RelatedId, a.CreatedAt })
            .ToListAsync();
        var lastAccountTouch = accountActivity
            .GroupBy(a => a.RelatedId)
            .ToDictionary(g => g.Key, g => g.Max(a => a.CreatedAt));

        var accounts = await db.Accounts.ToListAsync();
        foreach (var account in accounts)
        {
            var anchor = lastAccountTouch.TryGetValue(account.Id, out var touched)
                ? (touched > account.UpdatedAt ? touched : account.UpdatedAt)
                : account.UpdatedAt;
            var idleDays = (now - anchor).TotalDays;
            var score = Math.Clamp(100 - (int)Math.Round(idleDays * 100 / days), 0, 100);
            if (account.DataFreshnessScore != score)
            {
                account.DataFreshnessScore = score;
                changed = true;
            }
        }

        if (changed) await db.SaveChangesAsync();
        return (contacts.Count, flagged);
    }

    public async Task<AutonomousInsights> GetInsightsAsync()
    {
        var now = DateTime.UtcNow;
        var organization = await db.GetCurrentOrganizationAsync();
        var threshold = organization.LeadScoreRoutingThreshold;

        var stalled = await db.Deals.AsNoTracking()
            .Where(d => d.IsStalled && d.Status == DealStatus.Open)
            .OrderByDescending(d => d.Amount)
            .Take(5)
            .Select(d => new
            {
                d.Id, d.Name, d.Amount, d.Currency, d.LastStageMovedAt, d.UpdatedAt,
                StageName = d.Stage != null ? d.Stage.Name : "—",
                OwnerName = d.Owner != null ? d.Owner.FullName : null
            })
            .ToListAsync();
        var stalledCount = await db.Deals.CountAsync(d => d.IsStalled && d.Status == DealStatus.Open);
        var stalledValue = await db.Deals.Where(d => d.IsStalled && d.Status == DealStatus.Open)
            .SumAsync(d => (decimal?)d.Amount) ?? 0;

        var breaches = await db.Tickets.AsNoTracking()
            .Where(t => t.SlaBreached && (t.Status == TicketStatus.Open || t.Status == TicketStatus.Pending))
            .OrderBy(t => t.SlaDueAt)
            .Take(5)
            .Select(t => new
            {
                t.Id, t.Number, t.Subject, t.Priority, t.SlaDueAt,
                AssigneeName = t.Assignee != null ? t.Assignee.FullName : null
            })
            .ToListAsync();
        var breachCount = await db.Tickets.CountAsync(t =>
            t.SlaBreached && (t.Status == TicketStatus.Open || t.Status == TicketStatus.Pending));
        var escalationCount = await db.Tickets.CountAsync(t =>
            t.EscalationLevel > 0 && (t.Status == TicketStatus.Open || t.Status == TicketStatus.Pending));

        var stale = await db.Contacts.AsNoTracking()
            .Where(c => c.IsStale)
            .OrderBy(c => c.DataFreshnessScore)
            .Take(5)
            .Select(c => new
            {
                c.Id, c.FirstName, c.LastName, c.DataFreshnessScore, c.UpdatedAt,
                AccountName = c.Account != null ? c.Account.Name : null
            })
            .ToListAsync();
        var staleCount = await db.Contacts.CountAsync(c => c.IsStale);

        var duplicateCount = await db.DuplicateCandidates.CountAsync(c => c.Status == DuplicateStatus.Pending);
        var duplicateSamples = await db.DuplicateCandidates.AsNoTracking()
            .Where(c => c.Status == DuplicateStatus.Pending)
            .OrderByDescending(c => c.Similarity)
            .Take(5)
            .ToListAsync();

        var highScoreLeads = await db.Leads.CountAsync(l =>
            l.Score >= threshold
            && l.Status != LeadStatus.Converted
            && l.Status != LeadStatus.Unqualified
            && (l.RoutingState == LeadRoutingState.Unrouted || l.RoutingState == LeadRoutingState.SdrQueue));

        var items = new List<AutonomousInsightItem>();

        foreach (var deal in stalled)
        {
            var anchor = deal.LastStageMovedAt ?? deal.UpdatedAt;
            var days = Math.Max(0, (int)Math.Round((now - anchor).TotalDays));
            items.Add(new AutonomousInsightItem(
                "stalled-deal", deal.Id, deal.Name,
                $"Stalled {days}d in {deal.StageName} · {deal.OwnerName ?? "Unassigned"}",
                $"/deals/{deal.Id}", "danger"));
        }

        foreach (var ticket in breaches)
        {
            items.Add(new AutonomousInsightItem(
                "sla-breach", ticket.Id, $"{ticket.Number} · {ticket.Subject}",
                $"SLA breached · {ticket.AssigneeName ?? "Unassigned"}",
                $"/tickets/{ticket.Id}", "danger"));
        }

        foreach (var contact in stale)
        {
            items.Add(new AutonomousInsightItem(
                "stale-contact", contact.Id, $"{contact.FirstName} {contact.LastName}".Trim(),
                $"No contact in a while · {contact.AccountName ?? "No account"}",
                $"/contacts/{contact.Id}", "warning"));
        }

        foreach (var duplicate in duplicateSamples)
        {
            items.Add(new AutonomousInsightItem(
                "duplicate", duplicate.Id,
                duplicate.EntityType == EntityTypes.Account ? "Possible duplicate account" : "Possible duplicate contact",
                $"{Math.Round(duplicate.Similarity * 100)}% match · {duplicate.Reason}",
                "/settings?tab=autonomous", "info"));
        }

        return new AutonomousInsights(
            organization.AutonomousEnabled,
            stalledCount, stalledValue,
            breachCount, escalationCount,
            staleCount, duplicateCount,
            highScoreLeads,
            items.Take(12).ToList(),
            now);
    }

    private async Task NotifyAsync(Guid organizationId, Guid? userId, string title, string body, string link, string type)
    {
        if (userId is null) return;
        db.Notifications.Add(new Notification
        {
            OrganizationId = organizationId,
            UserId = userId.Value,
            Title = title,
            Body = body,
            Link = link,
            Type = type
        });
    }

    private async Task NotifyManagersAsync(Guid organizationId, Guid? excludeUserId, string title, string body, string link)
    {
        var managers = await db.Users.AsNoTracking()
            .Where(u => u.IsActive
                && (u.Role == Roles.Admin || u.Role == Roles.Manager)
                && (excludeUserId == null || u.Id != excludeUserId))
            .Select(u => u.Id)
            .Take(3)
            .ToListAsync();

        foreach (var managerId in managers)
        {
            db.Notifications.Add(new Notification
            {
                OrganizationId = organizationId,
                UserId = managerId,
                Title = title,
                Body = body,
                Link = link,
                Type = "warning"
            });
        }
    }
}
