using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Activities;

[ApiController]
[Route("api/v1/activities")]
public class ActivitiesController(HelixDbContext db) : ControllerBase
{
    public record ActivityRequest(
        string? Type, string? Subject, string? Body, DateTime? DueAt, string? Priority,
        string? RelatedType, Guid? RelatedId, Guid? OwnerId, int? DurationMinutes, string? Outcome,
        string? Status);

    public record CompleteRequest(bool Completed, string? Outcome, string? Body);

    public record CalendarEventDto(
        Guid Id, string Title, string Type, DateTime Date, string Status, string Priority,
        string RelatedType, Guid RelatedId, string? RelatedName, Guid? OwnerId, string? OwnerName,
        string Color);

    private IQueryable<Activity> Filtered(
        string? search, Guid? ownerId, string? status, string? type, string? relatedType,
        Guid? relatedId, string? due)
    {
        var query = db.Activities.AsNoTracking().AsQueryable();
        var now = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(a => a.Subject.ToLower().Contains(q) || (a.Body != null && a.Body.ToLower().Contains(q)));
        }
        if (ownerId is not null) query = query.Where(a => a.OwnerId == ownerId);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(a => a.Status == status);
        if (!string.IsNullOrWhiteSpace(type)) query = query.Where(a => a.Type == type);
        if (!string.IsNullOrWhiteSpace(relatedType)) query = query.Where(a => a.RelatedType == relatedType);
        if (relatedId is not null) query = query.Where(a => a.RelatedId == relatedId);

        var startOfDay = now.Date;
        query = due switch
        {
            "overdue" => query.Where(a => a.Status == ActivityStatus.Open && a.DueAt != null && a.DueAt < now),
            "today" => query.Where(a => a.DueAt != null && a.DueAt >= startOfDay && a.DueAt < startOfDay.AddDays(1)),
            "week" => query.Where(a => a.DueAt != null && a.DueAt >= startOfDay && a.DueAt < startOfDay.AddDays(7)),
            "upcoming" => query.Where(a => a.Status == ActivityStatus.Open && a.DueAt != null && a.DueAt >= now),
            _ => query
        };

        return query;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<ActivityDto>>> List(
        [FromQuery] string? search, [FromQuery] Guid? ownerId, [FromQuery] string? status,
        [FromQuery] string? type, [FromQuery] string? relatedType, [FromQuery] Guid? relatedId,
        [FromQuery] string? due, [FromQuery] string? sort, [FromQuery] string? dir,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = Filtered(search, ownerId, status, type, relatedType, relatedId, due);
        var total = await query.CountAsync();

        var asc = string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
        query = sort switch
        {
            "dueAt" => asc ? query.OrderBy(a => a.DueAt == null).ThenBy(a => a.DueAt) : query.OrderByDescending(a => a.DueAt),
            "subject" => asc ? query.OrderBy(a => a.Subject) : query.OrderByDescending(a => a.Subject),
            _ => asc ? query.OrderBy(a => a.CreatedAt) : query.OrderByDescending(a => a.CreatedAt)
        };

        var rows = await query.Include(a => a.Owner).Page(page, pageSize).ToListAsync();
        var names = await ResolveRelatedNames(rows);
        var items = rows.Select(a => SharedMapper.Activity(a, a.Owner, names.GetValueOrDefault(a.RelatedId))).ToList();
        return Ok(new PagedResult<ActivityDto>(items, total, page, pageSize));
    }

    [HttpGet("calendar")]
    public async Task<ActionResult<List<CalendarEventDto>>> Calendar(
        [FromQuery] DateTime? start, [FromQuery] DateTime? end, [FromQuery] Guid? ownerId, [FromQuery] string? type)
    {
        var s = start ?? DateTime.UtcNow.AddMonths(-1);
        var e = end ?? DateTime.UtcNow.AddMonths(2);

        var query = db.Activities.AsNoTracking()
            .Include(a => a.Owner)
            .Where(a => a.DueAt != null && a.DueAt >= s && a.DueAt <= e);

        if (ownerId.HasValue) query = query.Where(a => a.OwnerId == ownerId.Value);
        if (!string.IsNullOrWhiteSpace(type) && type != "All") query = query.Where(a => a.Type == type);

        var activities = await query.ToListAsync();
        var names = await ResolveRelatedNames(activities);

        var events = activities.Select(a => new CalendarEventDto(
            a.Id,
            a.Subject,
            a.Type,
            a.DueAt!.Value,
            a.Status,
            a.Priority,
            a.RelatedType,
            a.RelatedId,
            names.GetValueOrDefault(a.RelatedId),
            a.OwnerId,
            a.Owner?.FullName,
            a.Type switch
            {
                ActivityType.Meeting => "#8b5cf6",
                ActivityType.Call => "#3b82f6",
                ActivityType.Email => "#ec4899",
                _ => "#f59e0b"
            }
        )).ToList();

        if (string.IsNullOrWhiteSpace(type) || type is "All" or "DealClose")
        {
            var dealsQuery = db.Deals.AsNoTracking()
                .Include(d => d.Account)
                .Include(d => d.Owner)
                .Where(d => d.Status == DealStatus.Open && d.ExpectedCloseDate != null && d.ExpectedCloseDate >= s && d.ExpectedCloseDate <= e);

            if (ownerId.HasValue) dealsQuery = dealsQuery.Where(d => d.OwnerId == ownerId.Value);

            var deals = await dealsQuery.ToListAsync();
            foreach (var d in deals)
            {
                events.Add(new CalendarEventDto(
                    d.Id,
                    $"Deal Close: {d.Name} ({d.Amount:C0})",
                    "DealClose",
                    d.ExpectedCloseDate!.Value,
                    d.Status,
                    "High",
                    "Deal",
                    d.Id,
                    d.Account?.Name,
                    d.OwnerId,
                    d.Owner?.FullName,
                    "#10b981"
                ));
            }
        }

        return Ok(events.OrderBy(ev => ev.Date).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ActivityDto>> Get(Guid id)
    {
        var activity = await db.Activities.AsNoTracking().Include(a => a.Owner)
            .FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Activity not found.");
        var names = await ResolveRelatedNames([activity]);
        return Ok(SharedMapper.Activity(activity, activity.Owner, names.GetValueOrDefault(activity.RelatedId)));
    }

    [HttpPost]
    public async Task<ActionResult<ActivityDto>> Create(ActivityRequest request)
    {
        var type = ActivityType.All.Contains(request.Type) ? request.Type! : ActivityType.Task;
        var subject = request.Subject.Clean(240);
        if (subject.Length == 0) throw new ApiException(400, "Subject is required.");

        var relatedType = NormalizeRelatedType(request.RelatedType);
        var relatedId = request.RelatedId ?? throw new ApiException(400, "Link this activity to a record.");
        await EnsureRelatedExists(relatedType, relatedId);
        await EnsureOwner(request.OwnerId);

        var activity = new Activity
        {
            OrganizationId = User.GetOrganizationId(),
            Type = type,
            Subject = subject,
            Body = request.Body.Clean(8000),
            DueAt = request.DueAt,
            Status = type == ActivityType.Note ? ActivityStatus.Completed
                : request.Status == ActivityStatus.Cancelled ? ActivityStatus.Cancelled : ActivityStatus.Open,
            CompletedAt = type == ActivityType.Note ? DateTime.UtcNow : null,
            Priority = request.Priority.Clean(20) is { Length: > 0 } p ? p : "Normal",
            RelatedType = relatedType,
            RelatedId = relatedId,
            OwnerId = request.OwnerId ?? User.GetUserId(),
            DurationMinutes = request.DurationMinutes,
            Outcome = request.Outcome.Clean(1000)
        };

        db.Activities.Add(activity);
        await db.SaveChangesAsync();

        var owner = await db.Users.FindAsync(activity.OwnerId);
        var names = await ResolveRelatedNames([activity]);
        return CreatedAtAction(nameof(Get), new { id = activity.Id },
            SharedMapper.Activity(activity, owner, names.GetValueOrDefault(activity.RelatedId)));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ActivityDto>> Update(Guid id, ActivityRequest request)
    {
        var activity = await db.Activities.FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Activity not found.");

        var subject = request.Subject.Clean(240);
        if (subject.Length == 0) throw new ApiException(400, "Subject is required.");
        var relatedType = NormalizeRelatedType(request.RelatedType ?? activity.RelatedType);
        var relatedId = request.RelatedId ?? activity.RelatedId;
        await EnsureRelatedExists(relatedType, relatedId);
        await EnsureOwner(request.OwnerId);

        activity.Type = ActivityType.All.Contains(request.Type) ? request.Type! : activity.Type;
        activity.Subject = subject;
        activity.Body = request.Body.Clean(8000);
        activity.DueAt = request.DueAt;
        activity.Priority = request.Priority.Clean(20) is { Length: > 0 } p ? p : activity.Priority;
        activity.RelatedType = relatedType;
        activity.RelatedId = relatedId;
        activity.OwnerId = request.OwnerId ?? activity.OwnerId;
        activity.DurationMinutes = request.DurationMinutes;
        activity.Outcome = request.Outcome.Clean(1000);
        if (request.Status == ActivityStatus.Cancelled) activity.Status = ActivityStatus.Cancelled;

        await db.SaveChangesAsync();
        var owner = await db.Users.FindAsync(activity.OwnerId);
        var names = await ResolveRelatedNames([activity]);
        return Ok(SharedMapper.Activity(activity, owner, names.GetValueOrDefault(activity.RelatedId)));
    }

    [HttpPatch("{id:guid}/complete")]
    public async Task<ActionResult<ActivityDto>> Complete(Guid id, CompleteRequest request)
    {
        var activity = await db.Activities.Include(a => a.Owner).FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Activity not found.");

        activity.Status = request.Completed ? ActivityStatus.Completed : ActivityStatus.Open;
        activity.CompletedAt = request.Completed ? DateTime.UtcNow : null;
        if (request.Outcome is not null) activity.Outcome = request.Outcome.Clean(1000);
        if (request.Body is not null) activity.Body = request.Body.Clean(8000);

        await db.SaveChangesAsync();
        var names = await ResolveRelatedNames([activity]);
        return Ok(SharedMapper.Activity(activity, activity.Owner, names.GetValueOrDefault(activity.RelatedId)));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var activity = await db.Activities.FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Activity not found.");
        activity.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static string NormalizeRelatedType(string? type)
    {
        var match = EntityTypes.RelationshipAll.FirstOrDefault(t => string.Equals(t, type, StringComparison.OrdinalIgnoreCase));
        return match ?? throw new ApiException(400, "Activities must be linked to an account, contact, lead or deal.");
    }

    private async Task EnsureRelatedExists(string relatedType, Guid id)
    {
        var exists = relatedType switch
        {
            EntityTypes.Account => await db.Accounts.AnyAsync(a => a.Id == id),
            EntityTypes.Contact => await db.Contacts.AnyAsync(c => c.Id == id),
            EntityTypes.Lead => await db.Leads.AnyAsync(l => l.Id == id),
            EntityTypes.Deal => await db.Deals.AnyAsync(d => d.Id == id),
            EntityTypes.Ticket => await db.Tickets.AnyAsync(t => t.Id == id),
            _ => false
        };
        if (!exists) throw new ApiException(400, "The linked record does not exist.");
    }

    private async Task EnsureOwner(Guid? ownerId)
    {
        if (ownerId is not null && !await db.Users.AnyAsync(u => u.Id == ownerId))
            throw new ApiException(400, "The selected owner is not part of this workspace.");
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
            foreach (var pair in await db.Accounts.Where(a => accountIds.Contains(a.Id)).Select(a => new { a.Id, a.Name }).ToDictionaryAsync(a => a.Id, a => a.Name))
                result[pair.Key] = pair.Value;
        if (contactIds.Count > 0)
        {
            var contacts = await db.Contacts.Where(c => contactIds.Contains(c.Id))
                .Select(c => new { c.Id, c.FirstName, c.LastName }).ToListAsync();
            foreach (var c in contacts) result[c.Id] = $"{c.FirstName} {c.LastName}".Trim();
        }
        if (leadIds.Count > 0)
        {
            var leads = await db.Leads.Where(l => leadIds.Contains(l.Id))
                .Select(l => new { l.Id, l.FirstName, l.LastName }).ToListAsync();
            foreach (var l in leads) result[l.Id] = $"{l.FirstName} {l.LastName}".Trim();
        }
        if (dealIds.Count > 0)
            foreach (var pair in await db.Deals.Where(d => dealIds.Contains(d.Id)).Select(d => new { d.Id, d.Name }).ToDictionaryAsync(d => d.Id, d => d.Name))
                result[pair.Key] = pair.Value;
        if (ticketIds.Count > 0)
            foreach (var pair in await db.Tickets.Where(t => ticketIds.Contains(t.Id)).Select(t => new { t.Id, t.Subject }).ToDictionaryAsync(t => t.Id, t => t.Subject))
                result[pair.Key] = pair.Value;

        return result;
    }
}
