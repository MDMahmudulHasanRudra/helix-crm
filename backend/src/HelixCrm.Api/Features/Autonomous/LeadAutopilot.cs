using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Autonomous;

/// <summary>
/// Applies the explainable score to a lead and (optionally) routes it to the
/// least-loaded account executive. Shared by the controller, CSV import and the
/// manual "re-score" action.
/// </summary>
public class LeadAutopilot(HelixDbContext db)
{
    public async Task<LeadScoreBreakdown> ApplyScoreAsync(Lead lead)
    {
        var breakdown = LeadScoring.Score(LeadScoring.Signals(lead));
        lead.Score = breakdown.Total;
        lead.ScoreBreakdownJson = Json.Serialize(breakdown);
        lead.ScoreUpdatedAt = DateTime.UtcNow;
        await Task.CompletedTask;
        return breakdown;
    }

    public async Task ApplyRoutingAsync(Lead lead, Organization organization, Guid? fallbackOwnerId, bool ownerExplicit)
    {
        if (ownerExplicit)
        {
            lead.OwnerId ??= fallbackOwnerId;
            lead.RoutingState = LeadRoutingState.Assigned;
            return;
        }

        if (!organization.AutoRouteLeads)
        {
            lead.OwnerId ??= fallbackOwnerId;
            lead.RoutingState = LeadRoutingState.Unrouted;
            return;
        }

        if (lead.Score < organization.LeadScoreRoutingThreshold)
        {
            // Low-intent leads stay in the inbound SDR queue owned by the creator.
            lead.OwnerId = fallbackOwnerId ?? lead.OwnerId;
            lead.RoutingState = LeadRoutingState.SdrQueue;
            return;
        }

        var candidates = await db.Users.AsNoTracking()
            .Where(u => u.IsActive && (u.Role == Roles.Rep || u.Role == Roles.Manager))
            .Select(u => new { u.Id, u.Role })
            .ToListAsync();

        if (candidates.Count == 0)
        {
            lead.OwnerId = fallbackOwnerId ?? lead.OwnerId;
            lead.RoutingState = LeadRoutingState.SdrQueue;
            return;
        }

        var loads = await db.Leads.AsNoTracking()
            .Where(l => l.OwnerId != null
                && l.Status != LeadStatus.Converted
                && l.Status != LeadStatus.Unqualified)
            .GroupBy(l => l.OwnerId!.Value)
            .Select(g => new { OwnerId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.OwnerId, x => x.Count);

        // Include leads added earlier in the same unit of work (CSV import batches)
        // so a bulk import round-robins across reps instead of piling onto one.
        foreach (var entry in db.ChangeTracker.Entries<Lead>())
        {
            if (entry.State != EntityState.Added) continue;
            var pending = entry.Entity;
            if (pending.OwnerId is not { } pendingOwner
                || pending.Status is LeadStatus.Converted or LeadStatus.Unqualified
                || pending.Id == lead.Id) continue;
            loads[pendingOwner] = loads.GetValueOrDefault(pendingOwner) + 1;
        }

        var pick = candidates
            .OrderBy(c => loads.GetValueOrDefault(c.Id))
            .ThenBy(c => c.Role == Roles.Rep ? 0 : 1)
            .ThenBy(c => c.Id)
            .First();

        lead.OwnerId = pick.Id;
        lead.RoutingState = LeadRoutingState.AutoRouted;
    }

    /// <summary>Re-scores every lead in the current workspace and returns how many changed.</summary>
    public async Task<int> RescoreAllAsync()
    {
        var leads = await db.Leads.ToListAsync();
        var changed = 0;
        foreach (var lead in leads)
        {
            var before = lead.Score;
            await ApplyScoreAsync(lead);
            if (lead.Score != before) changed++;
        }
        if (leads.Count > 0) await db.SaveChangesAsync();
        return changed;
    }
}
