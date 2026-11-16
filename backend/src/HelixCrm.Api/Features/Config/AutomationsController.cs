using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Config;

[ApiController]
[Route("api/v1/automations")]
public class AutomationsController(HelixDbContext db, ITenantProvider tenant) : ControllerBase
{
    public record AutomationRuleRequest(
        string? Name,
        string? EventType,
        string? ActionType,
        string? ActionConfigJson,
        bool? IsActive);

    public record AutomationRuleDto(
        Guid Id,
        string Name,
        string EventType,
        string ActionType,
        string ActionConfigJson,
        bool IsActive,
        int ExecutionCount,
        DateTime CreatedAt,
        DateTime UpdatedAt);

    private static readonly string[] ActionTypes = ["CreateTask", "SendNotification"];

    private static string ValidAction(string? actionType)
    {
        var value = string.IsNullOrWhiteSpace(actionType) ? "CreateTask" : actionType.Trim();
        if (!ActionTypes.Contains(value))
            throw new ApiException(400, $"Invalid action type. Supported: {string.Join(", ", ActionTypes)}");
        return value;
    }

    [HttpGet]
    public async Task<ActionResult<List<AutomationRuleDto>>> List()
    {
        var rules = await db.AutomationRules
            .AsNoTracking()
            .OrderBy(r => r.EventType)
            .ThenBy(r => r.Name)
            .Select(r => new AutomationRuleDto(
                r.Id,
                r.Name,
                r.EventType,
                r.ActionType,
                r.ActionConfigJson,
                r.IsActive,
                r.ExecutionCount,
                r.CreatedAt,
                r.UpdatedAt))
            .ToListAsync();

        return Ok(rules);
    }

    [Authorize(Roles = "Admin,Manager")]

    [HttpPost]
    public async Task<ActionResult<AutomationRuleDto>> Create(AutomationRuleRequest request)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new ApiException(400, "Rule name is required.");

        var eventType = request.EventType?.Trim() ?? AutomationEvents.LeadCreated;
        if (!AutomationEvents.All.Contains(eventType))
            throw new ApiException(400, $"Invalid event type. Supported: {string.Join(", ", AutomationEvents.All)}");

        var rule = new AutomationRule
        {
            OrganizationId = tenant.OrganizationId,
            Name = name,
            EventType = eventType,
            ActionType = ValidAction(request.ActionType),
            ActionConfigJson = string.IsNullOrWhiteSpace(request.ActionConfigJson) ? "{}" : request.ActionConfigJson,
            IsActive = request.IsActive ?? true
        };

        db.AutomationRules.Add(rule);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(List), new { id = rule.Id }, new AutomationRuleDto(
            rule.Id, rule.Name, rule.EventType, rule.ActionType, rule.ActionConfigJson, rule.IsActive, rule.ExecutionCount, rule.CreatedAt, rule.UpdatedAt));
    }

    [Authorize(Roles = "Admin,Manager")]

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<AutomationRuleDto>> Update(Guid id, AutomationRuleRequest request)
    {
        var rule = await db.AutomationRules.FirstOrDefaultAsync(r => r.Id == id)
            ?? throw new ApiException(404, "Automation rule not found.");

        if (!string.IsNullOrWhiteSpace(request.Name))
            rule.Name = request.Name.Trim();

        if (!string.IsNullOrWhiteSpace(request.EventType) && AutomationEvents.All.Contains(request.EventType.Trim()))
            rule.EventType = request.EventType.Trim();

        if (!string.IsNullOrWhiteSpace(request.ActionType))
            rule.ActionType = ValidAction(request.ActionType);

        if (request.ActionConfigJson != null)
            rule.ActionConfigJson = request.ActionConfigJson;

        if (request.IsActive.HasValue)
            rule.IsActive = request.IsActive.Value;

        await db.SaveChangesAsync();

        return Ok(new AutomationRuleDto(
            rule.Id, rule.Name, rule.EventType, rule.ActionType, rule.ActionConfigJson, rule.IsActive, rule.ExecutionCount, rule.CreatedAt, rule.UpdatedAt));
    }

    [Authorize(Roles = "Admin,Manager")]

    [HttpPatch("{id:guid}/toggle")]
    public async Task<ActionResult<AutomationRuleDto>> Toggle(Guid id)
    {
        var rule = await db.AutomationRules.FirstOrDefaultAsync(r => r.Id == id)
            ?? throw new ApiException(404, "Automation rule not found.");

        rule.IsActive = !rule.IsActive;
        await db.SaveChangesAsync();

        return Ok(new AutomationRuleDto(
            rule.Id, rule.Name, rule.EventType, rule.ActionType, rule.ActionConfigJson, rule.IsActive, rule.ExecutionCount, rule.CreatedAt, rule.UpdatedAt));
    }

    [Authorize(Roles = "Admin,Manager")]

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var rule = await db.AutomationRules.FirstOrDefaultAsync(r => r.Id == id)
            ?? throw new ApiException(404, "Automation rule not found.");

        rule.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }
}

