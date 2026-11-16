using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Autonomous;

[ApiController]
[Route("api/v1/autonomous")]
public class AutonomousController(
    HelixDbContext db,
    AutonomousMonitor monitor,
    LeadAutopilot leadAutopilot,
    DuplicateDetectionService duplicates) : ControllerBase
{
    public record SettingsDto(
        bool AutonomousEnabled,
        bool AutoRouteLeads,
        int StaleDealDays,
        int StaleDealProbabilityPenalty,
        int DataFreshnessDays,
        int LeadScoreRoutingThreshold);

    public record UpdateSettingsRequest(
        bool? AutonomousEnabled,
        bool? AutoRouteLeads,
        int? StaleDealDays,
        int? StaleDealProbabilityPenalty,
        int? DataFreshnessDays,
        int? LeadScoreRoutingThreshold);

    [HttpGet("insights")]
    public async Task<ActionResult<AutonomousInsights>> Insights()
        => Ok(await monitor.GetInsightsAsync());

    [HttpPost("run")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<object>> Run()
    {
        var organization = await db.Organizations.FirstAsync();
        var summary = await monitor.RunAllAsync(organization);
        var duplicatesCreated = await duplicates.ScanAsync();
        return Ok(new
        {
            summary.DealsReviewed,
            summary.DealsFlaggedStalled,
            summary.TicketsReviewed,
            summary.TicketsEscalated,
            summary.ContactsReviewed,
            summary.ContactsFlaggedStale,
            summary.LeadsRouted,
            duplicatesCreated.CandidatesCreated,
            summary.RanAt
        });
    }

    [HttpPost("leads/rescore")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<object>> RescoreLeads()
    {
        var changed = await leadAutopilot.RescoreAllAsync();
        return Ok(new { changed, message = $"Re-scored leads. {changed} score(s) changed." });
    }

    [HttpGet("settings")]
    public async Task<ActionResult<SettingsDto>> GetSettings()
    {
        var organization = await db.Organizations.FirstAsync();
        return Ok(ToDto(organization));
    }

    [HttpPut("settings")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<SettingsDto>> UpdateSettings(UpdateSettingsRequest request)
    {
        var organization = await db.Organizations.FirstAsync();
        organization.AutonomousEnabled = request.AutonomousEnabled ?? organization.AutonomousEnabled;
        organization.AutoRouteLeads = request.AutoRouteLeads ?? organization.AutoRouteLeads;
        organization.StaleDealDays = Math.Clamp(request.StaleDealDays ?? organization.StaleDealDays, 3, 365);
        organization.StaleDealProbabilityPenalty = Math.Clamp(
            request.StaleDealProbabilityPenalty ?? organization.StaleDealProbabilityPenalty, 0, 80);
        organization.DataFreshnessDays = Math.Clamp(
            request.DataFreshnessDays ?? organization.DataFreshnessDays, 30, 730);
        organization.LeadScoreRoutingThreshold = Math.Clamp(
            request.LeadScoreRoutingThreshold ?? organization.LeadScoreRoutingThreshold, 0, 100);

        await db.SaveChangesAsync();
        return Ok(ToDto(organization));
    }

    private static SettingsDto ToDto(Organization organization) => new(
        organization.AutonomousEnabled,
        organization.AutoRouteLeads,
        organization.StaleDealDays,
        organization.StaleDealProbabilityPenalty,
        organization.DataFreshnessDays,
        organization.LeadScoreRoutingThreshold);
}
