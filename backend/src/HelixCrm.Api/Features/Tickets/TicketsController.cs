using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using HelixCrm.Api.Features.Config;
using HelixCrm.Api.Features.Email;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Tickets;

[ApiController]
[Route("api/v1/tickets")]
public class TicketsController(HelixDbContext db, IAutomationEngine automation, EmailOutbox outbox) : ControllerBase
{
    public record TicketRequest(
        string? Subject, string? Description, string? Status, string? Priority, string? Channel,
        Guid? AccountId, Guid? ContactId, Guid? AssigneeId, string[]? Tags, DateTime? SlaDueAt);

    public record StatusRequest(string? Status);
    public record AssignRequest(Guid? AssigneeId);
    public record ReplyRequest(string? Body, bool? Internal);

    public record TicketListItemDto(
        Guid Id, string Number, string Subject, string Status, string Priority, string Channel,
        Guid? AccountId, string? AccountName, Guid? ContactId, string? ContactName, Guid? AssigneeId,
        string? AssigneeName, string? AssigneeAvatarUrl, DateTime? SlaDueAt, DateTime CreatedAt,
        DateTime? ResolvedAt, string[] Tags, bool SlaBreached, int EscalationLevel);

    public record TicketDetailDto(
        Guid Id, string Number, string Subject, string? Description, string Status, string Priority,
        string Channel, Guid? AccountId, string? AccountName, Guid? ContactId, string? ContactName,
        Guid? AssigneeId, string? AssigneeName, string? AssigneeAvatarUrl, DateTime? SlaDueAt,
        DateTime? FirstResponseAt, DateTime? ResolvedAt, DateTime CreatedAt, DateTime UpdatedAt,
        string[] Tags, List<ActivityDto> Conversation, List<AuditDto> Audit,
        bool SlaBreached, int EscalationLevel);

    private IQueryable<Ticket> Filtered(
        string? search, string? status, string? priority, Guid? assigneeId, Guid? accountId, string? channel)
    {
        var query = db.Tickets.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(t => t.Subject.ToLower().Contains(q)
                || t.Number.ToLower().Contains(q)
                || (t.Description != null && t.Description.ToLower().Contains(q))
                || (t.Account != null && t.Account.Name.ToLower().Contains(q)));
        }
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(t => t.Status == status);
        if (!string.IsNullOrWhiteSpace(priority)) query = query.Where(t => t.Priority == priority);
        if (assigneeId is not null) query = query.Where(t => t.AssigneeId == assigneeId);
        if (accountId is not null) query = query.Where(t => t.AccountId == accountId);
        if (!string.IsNullOrWhiteSpace(channel)) query = query.Where(t => t.Channel == channel);
        return query;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<TicketListItemDto>>> List(
        [FromQuery] string? search, [FromQuery] string? status, [FromQuery] string? priority,
        [FromQuery] Guid? assigneeId, [FromQuery] Guid? accountId, [FromQuery] string? channel,
        [FromQuery] string? sort, [FromQuery] string? dir, [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = Filtered(search, status, priority, assigneeId, accountId, channel);
        var total = await query.CountAsync();

        var desc = !string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
        query = sort switch
        {
            "number" => desc ? query.OrderByDescending(t => t.Number) : query.OrderBy(t => t.Number),
            "priority" => desc ? query.OrderByDescending(t => t.Priority) : query.OrderBy(t => t.Priority),
            "sla" => desc ? query.OrderByDescending(t => t.SlaDueAt) : query.OrderBy(t => t.SlaDueAt),
            "createdAt" => desc ? query.OrderByDescending(t => t.CreatedAt) : query.OrderBy(t => t.CreatedAt),
            _ => desc ? query.OrderByDescending(t => t.UpdatedAt) : query.OrderBy(t => t.UpdatedAt)
        };

        var rows = await query.Page(page, pageSize)
            .Select(t => new
            {
                t.Id, t.Number, t.Subject, t.Status, t.Priority, t.Channel, t.AccountId,
                AccountName = t.Account != null ? t.Account.Name : null,
                t.ContactId,
                ContactFirst = t.Contact != null ? t.Contact.FirstName : null,
                ContactLast = t.Contact != null ? t.Contact.LastName : null,
                t.AssigneeId,
                AssigneeName = t.Assignee != null ? t.Assignee.FullName : null,
                AssigneeAvatar = t.Assignee != null ? t.Assignee.AvatarUrl : null,
                t.SlaDueAt, t.CreatedAt, t.ResolvedAt, t.TagsJson, t.SlaBreached, t.EscalationLevel
            }).ToListAsync();

        var items = rows.Select(t => new TicketListItemDto(
            t.Id, t.Number, t.Subject, t.Status, t.Priority, t.Channel, t.AccountId, t.AccountName,
            t.ContactId, $"{t.ContactFirst} {t.ContactLast}".Trim() is { Length: > 0 } n ? n : null,
            t.AssigneeId, t.AssigneeName, t.AssigneeAvatar, t.SlaDueAt, t.CreatedAt, t.ResolvedAt,
            Json.StringList(t.TagsJson).ToArray(), t.SlaBreached, t.EscalationLevel)).ToList();

        return Ok(new PagedResult<TicketListItemDto>(items, total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TicketDetailDto>> Get(Guid id)
    {
        var ticket = await db.Tickets.AsNoTracking()
            .Include(t => t.Account).Include(t => t.Contact).Include(t => t.Assignee)
            .FirstOrDefaultAsync(t => t.Id == id)
            ?? throw new ApiException(404, "Ticket not found.");

        var conversation = await db.Activities.AsNoTracking()
            .Where(a => a.RelatedType == EntityTypes.Ticket && a.RelatedId == id)
            .Include(a => a.Owner).OrderBy(a => a.CreatedAt).ToListAsync();

        var audit = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == nameof(Ticket) && a.EntityId == id)
            .OrderByDescending(a => a.CreatedAt).Take(30).ToListAsync();

        var emailIds = conversation.Where(a => a.EmailMessageId is not null)
            .Select(a => a.EmailMessageId!.Value).Distinct().ToList();
        var emailStatuses = emailIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.EmailMessages.AsNoTracking()
                .Where(m => emailIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => m.Status);

        return Ok(new TicketDetailDto(
            ticket.Id, ticket.Number, ticket.Subject, ticket.Description, ticket.Status, ticket.Priority,
            ticket.Channel, ticket.AccountId, ticket.Account?.Name, ticket.ContactId, ticket.Contact?.FullName,
            ticket.AssigneeId, ticket.Assignee?.FullName, ticket.Assignee?.AvatarUrl, ticket.SlaDueAt,
            ticket.FirstResponseAt, ticket.ResolvedAt, ticket.CreatedAt, ticket.UpdatedAt,
            Json.StringList(ticket.TagsJson).ToArray(),
            conversation.Select(a => SharedMapper.Activity(
                a, a.Owner, ticket.Subject,
                a.EmailMessageId is Guid emailId && emailStatuses.TryGetValue(emailId, out var status) ? status : null)).ToList(),
            audit.Select(SharedMapper.Audit).ToList(), ticket.SlaBreached, ticket.EscalationLevel));
    }

    [HttpPost]
    public async Task<ActionResult<TicketListItemDto>> Create(TicketRequest request)
    {
        var subject = request.Subject.Clean(240);
        if (subject.Length == 0) throw new ApiException(400, "Subject is required.");
        await EnsureRelations(request.AccountId, request.ContactId, request.AssigneeId);

        var organizationId = User.GetOrganizationId();
        var count = await db.Tickets.IgnoreQueryFilters().CountAsync(t => t.OrganizationId == organizationId);
        var priority = NormalizePriority(request.Priority);
        var now = DateTime.UtcNow;

        var ticket = new Ticket
        {
            OrganizationId = organizationId,
            Number = $"T-{1001 + count}",
            Subject = subject,
            Description = request.Description.Clean(8000),
            Status = TicketStatus.All.Contains(request.Status) ? request.Status! : TicketStatus.Open,
            Priority = priority,
            Channel = request.Channel.Clean(30) is { Length: > 0 } c ? c : "Email",
            AccountId = request.AccountId,
            ContactId = request.ContactId,
            AssigneeId = request.AssigneeId ?? User.GetUserId(),
            SlaDueAt = request.SlaDueAt ?? now.AddHours(priority is "Urgent" or "High" ? 24 : 72),
            TagsJson = Json.Serialize(SanitizeTags(request.Tags))
        };

        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();
        await automation.TriggerAsync(AutomationEvents.TicketCreated, "Ticket", ticket.Id, ticket.Subject, ticket.AssigneeId);
        return CreatedAtAction(nameof(Get), new { id = ticket.Id }, new TicketListItemDto(
            ticket.Id, ticket.Number, ticket.Subject, ticket.Status, ticket.Priority, ticket.Channel,
            ticket.AccountId, null, ticket.ContactId, null, ticket.AssigneeId, null, null,
            ticket.SlaDueAt, ticket.CreatedAt, null, Json.StringList(ticket.TagsJson).ToArray(),
            ticket.SlaBreached, ticket.EscalationLevel));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TicketDetailDto>> Update(Guid id, TicketRequest request)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id)
            ?? throw new ApiException(404, "Ticket not found.");
        var subject = request.Subject.Clean(240);
        if (subject.Length == 0) throw new ApiException(400, "Subject is required.");
        await EnsureRelations(request.AccountId, request.ContactId, request.AssigneeId);

        ticket.Subject = subject;
        ticket.Description = request.Description.Clean(8000);
        if (TicketStatus.All.Contains(request.Status)) ticket.Status = request.Status!;
        ticket.Priority = NormalizePriority(request.Priority);
        ticket.Channel = request.Channel.Clean(30) is { Length: > 0 } c ? c : ticket.Channel;
        ticket.AccountId = request.AccountId;
        ticket.ContactId = request.ContactId;
        ticket.AssigneeId = request.AssigneeId ?? ticket.AssigneeId;
        if (request.SlaDueAt is not null) ticket.SlaDueAt = request.SlaDueAt;
        ticket.TagsJson = Json.Serialize(SanitizeTags(request.Tags));
        if (ticket.Status is TicketStatus.Resolved or TicketStatus.Closed) ticket.ResolvedAt ??= DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(await BuildDetail(id));
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<TicketListItemDto>> SetStatus(Guid id, StatusRequest request)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id)
            ?? throw new ApiException(404, "Ticket not found.");
        var status = request.Status.Clean(20);
        if (!TicketStatus.All.Contains(status)) throw new ApiException(400, "Unknown ticket status.");

        ticket.Status = status;
        if (status is TicketStatus.Resolved or TicketStatus.Closed) ticket.ResolvedAt ??= DateTime.UtcNow;
        else ticket.ResolvedAt = null;
        ticket.FirstResponseAt ??= DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(await ListItem(id));
    }

    [HttpPatch("{id:guid}/assign")]
    public async Task<ActionResult<TicketListItemDto>> Assign(Guid id, AssignRequest request)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id)
            ?? throw new ApiException(404, "Ticket not found.");
        if (request.AssigneeId is not null && !await db.Users.AnyAsync(u => u.Id == request.AssigneeId))
            throw new ApiException(400, "The selected assignee is not part of this workspace.");

        ticket.AssigneeId = request.AssigneeId;
        await db.SaveChangesAsync();
        return Ok(await ListItem(id));
    }

    [HttpPost("{id:guid}/replies")]
    public async Task<ActionResult<TicketDetailDto>> Reply(Guid id, ReplyRequest request)
    {
        var ticket = await db.Tickets.Include(t => t.Contact)
            .FirstOrDefaultAsync(t => t.Id == id)
            ?? throw new ApiException(404, "Ticket not found.");

        var body = request.Body.Clean(20_000);
        if (body.Length == 0) throw new ApiException(400, "Write a reply first.");

        var now = DateTime.UtcNow;
        if (request.Internal == true)
        {
            db.Activities.Add(new Activity
            {
                OrganizationId = ticket.OrganizationId,
                Type = ActivityType.Note,
                Subject = "Internal note",
                Body = body,
                RelatedType = EntityTypes.Ticket,
                RelatedId = ticket.Id,
                Status = ActivityStatus.Completed,
                CompletedAt = now,
                Priority = "Normal",
                OwnerId = User.GetUserId()
            });
            await db.SaveChangesAsync();
            return Ok(await BuildDetail(id));
        }

        var email = ticket.Contact?.Email;
        if (string.IsNullOrWhiteSpace(email))
            throw new ApiException(400, "Add an email address to the ticket's contact before replying.");

        var message = await outbox.EnqueueAsync(new NewEmail(
            email, ticket.Contact?.FullName, $"Re: {ticket.Subject}", body,
            RelatedType: EntityTypes.Ticket, RelatedId: ticket.Id, ContactId: ticket.ContactId),
            HttpContext.RequestAborted);

        var activity = new Activity
        {
            OrganizationId = ticket.OrganizationId,
            Type = ActivityType.Email,
            Subject = message.Subject.Clean(240),
            Body = body,
            RelatedType = EntityTypes.Ticket,
            RelatedId = ticket.Id,
            Status = ActivityStatus.Completed,
            CompletedAt = now,
            Priority = "Normal",
            OwnerId = User.GetUserId(),
            EmailMessageId = message.Id
        };
        db.Activities.Add(activity);
        message.ActivityId = activity.Id;
        ticket.FirstResponseAt ??= now;
        await db.SaveChangesAsync();

        return Ok(await BuildDetail(id));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id)
            ?? throw new ApiException(404, "Ticket not found.");
        ticket.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? search, [FromQuery] string? status, [FromQuery] string? priority,
        [FromQuery] Guid? assigneeId, [FromQuery] Guid? accountId, [FromQuery] string? channel)
    {
        var rows = await Filtered(search, status, priority, assigneeId, accountId, channel)
            .Include(t => t.Account).Include(t => t.Assignee).OrderByDescending(t => t.CreatedAt)
            .Take(10_000).ToListAsync();

        return CsvWriter.Build($"tickets-{DateTime.UtcNow:yyyyMMdd}.csv",
            ["Number", "Subject", "Status", "Priority", "Channel", "Account", "Assignee", "SLA Due", "Created", "Resolved"],
            rows.Select(t => new[]
            {
                t.Number, t.Subject, t.Status, t.Priority, t.Channel, t.Account?.Name,
                t.Assignee?.FullName, t.SlaDueAt?.ToString("u"), t.CreatedAt.ToString("u"), t.ResolvedAt?.ToString("u")
            }));
    }

    private async Task<TicketDetailDto> BuildDetail(Guid id)
    {
        var result = await Get(id);
        return result.Value ?? (result.Result as ObjectResult)?.Value as TicketDetailDto
            ?? throw new ApiException(404, "Ticket not found.");
    }

    private async Task<TicketListItemDto> ListItem(Guid id)
    {
        var t = await db.Tickets.AsNoTracking().Include(x => x.Account).Include(x => x.Contact)
            .Include(x => x.Assignee).FirstAsync(x => x.Id == id);
        return new TicketListItemDto(t.Id, t.Number, t.Subject, t.Status, t.Priority, t.Channel,
            t.AccountId, t.Account?.Name, t.ContactId, t.Contact?.FullName, t.AssigneeId,
            t.Assignee?.FullName, t.Assignee?.AvatarUrl, t.SlaDueAt, t.CreatedAt, t.ResolvedAt,
            Json.StringList(t.TagsJson).ToArray(), t.SlaBreached, t.EscalationLevel);
    }

    private async Task EnsureRelations(Guid? accountId, Guid? contactId, Guid? assigneeId)
    {
        if (accountId is not null && !await db.Accounts.AnyAsync(a => a.Id == accountId))
            throw new ApiException(400, "The selected account does not exist.");
        if (contactId is not null && !await db.Contacts.AnyAsync(c => c.Id == contactId))
            throw new ApiException(400, "The selected contact does not exist.");
        if (assigneeId is not null && !await db.Users.AnyAsync(u => u.Id == assigneeId))
            throw new ApiException(400, "The selected assignee is not part of this workspace.");
    }

    private static string NormalizePriority(string? priority) => priority switch
    {
        "Low" or "Normal" or "High" or "Urgent" => priority,
        _ => "Normal"
    };

    private static string[] SanitizeTags(string[]? tags) =>
        (tags ?? []).Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(10).ToArray();
}
