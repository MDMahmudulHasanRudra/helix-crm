using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Email;

[ApiController]
[Route("api/v1/email")]
public class EmailController(
    HelixDbContext db, EmailOutbox outbox, InboundEmailService inbound) : ControllerBase
{
    public record SendEmailRequest(
        string? To, string? ToName, string? Subject, string? Body, string? HtmlBody,
        string? RelatedType, Guid? RelatedId, Guid? ContactId, Guid? EmailAccountId);

    public record LinkRequest(Guid TicketId);

    public record SuppressionRequest(string? Email, string? Reason, string? Note);

    public record EmailStatusDto(
        bool Configured, int Accounts, string? DefaultAddress, bool ImapEnabled,
        int DailyLimit, int SentToday, int Queued, int Failed, int Review, DateTime? LastSyncAt);

    private static readonly string[] SendableRelated =
        [EntityTypes.Account, EntityTypes.Contact, EntityTypes.Lead, EntityTypes.Deal, EntityTypes.Ticket, "Quote"];

    [HttpGet("status")]
    public async Task<ActionResult<EmailStatusDto>> Status()
    {
        var organization = await db.GetCurrentOrganizationAsync();
        var accounts = await db.EmailAccounts.AsNoTracking().Where(a => a.IsActive).ToListAsync();
        var defaultAccount = accounts.FirstOrDefault(a => a.IsDefault) ?? accounts.FirstOrDefault();
        var dayStart = DateTime.UtcNow.Date;

        var sentToday = await db.EmailMessages.CountAsync(
            m => m.Direction == EmailDirection.Outbound && m.SentAt != null && m.SentAt >= dayStart);
        var queued = await db.EmailMessages.CountAsync(
            m => m.Direction == EmailDirection.Outbound
                && (m.Status == EmailStatus.Queued || m.Status == EmailStatus.Sending));
        var failed = await db.EmailMessages.CountAsync(
            m => m.Direction == EmailDirection.Outbound && m.Status == EmailStatus.Failed);
        var review = await db.EmailMessages.CountAsync(m => m.NeedsReview);

        return Ok(new EmailStatusDto(
            accounts.Count > 0, accounts.Count, defaultAccount?.FromAddress,
            defaultAccount?.ImapEnabled ?? false, organization.EmailDailyLimit, sentToday,
            queued, failed, review, accounts.Max(a => a.LastImapSyncAt)));
    }

    [HttpGet("outbox")]
    public async Task<ActionResult<PagedResult<EmailMessageDto>>> Outbox(
        [FromQuery] string? status, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = db.EmailMessages.AsNoTracking().Where(m => m.Direction == EmailDirection.Outbound);

        if (!string.IsNullOrWhiteSpace(status) && EmailStatus.Outbound.Contains(status))
            query = query.Where(m => m.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(m => m.Subject.ToLower().Contains(q)
                || m.ToAddress.ToLower().Contains(q)
                || m.FailureReason != null && m.FailureReason.ToLower().Contains(q));
        }

        var total = await query.CountAsync();
        var rows = await query.OrderByDescending(m => m.CreatedAt).Page(page, pageSize).ToListAsync();
        var names = await RelatedNamesAsync(rows);

        return Ok(new PagedResult<EmailMessageDto>(
            rows.Select(m => EmailMapper.Message(m, Name(names, m))).ToList(), total, page, pageSize));
    }

    [HttpGet("inbound")]
    public async Task<ActionResult<PagedResult<EmailMessageDto>>> Inbound(
        [FromQuery] bool? review, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = db.EmailMessages.AsNoTracking().Where(m => m.Direction == EmailDirection.Inbound);

        if (review == true) query = query.Where(m => m.NeedsReview);
        if (review == false) query = query.Where(m => !m.NeedsReview);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(m => m.Subject.ToLower().Contains(q)
                || m.FromAddress.ToLower().Contains(q)
                || m.FromName.ToLower().Contains(q));
        }

        var total = await query.CountAsync();
        var rows = await query.OrderByDescending(m => m.ReceivedAt ?? m.CreatedAt).Page(page, pageSize).ToListAsync();
        var names = await RelatedNamesAsync(rows);

        return Ok(new PagedResult<EmailMessageDto>(
            rows.Select(m => EmailMapper.Message(m, Name(names, m))).ToList(), total, page, pageSize));
    }

    [HttpPost("outbox/{id:guid}/retry")]
    [Authorize(Roles = $"{Roles.Admin},{Roles.Manager}")]
    public async Task<ActionResult<EmailMessageDto>> Retry(Guid id)
    {
        var message = await db.EmailMessages
            .FirstOrDefaultAsync(m => m.Id == id && m.Direction == EmailDirection.Outbound)
            ?? throw new ApiException(404, "Outbound email not found.");

        if (message.Status != EmailStatus.Failed)
            throw new ApiException(400, "Only failed messages can be retried.");

        message.Status = EmailStatus.Queued;
        message.Attempts = 0;
        message.NextAttemptAt = DateTime.UtcNow;
        message.FailureReason = null;
        await db.SaveChangesAsync();

        var names = await RelatedNamesAsync([message]);
        return Ok(EmailMapper.Message(message, Name(names, message)));
    }

    [HttpPost("inbound/{id:guid}/link")]
    public async Task<ActionResult<EmailMessageDto>> Link(Guid id, LinkRequest request)
    {
        var result = await inbound.LinkAsync(id, request.TicketId, HttpContext.RequestAborted);
        var names = await RelatedNamesAsync([result.Message]);
        return Ok(EmailMapper.Message(result.Message, Name(names, result.Message)));
    }

    [HttpPost("inbound/{id:guid}/dismiss")]
    public async Task<IActionResult> Dismiss(Guid id)
    {
        await inbound.DismissAsync(id, HttpContext.RequestAborted);
        return NoContent();
    }

    [HttpGet("suppressions")]
    public async Task<ActionResult<PagedResult<EmailSuppressionDto>>> Suppressions(
        [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = db.EmailSuppressions.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(s => s.Email.Contains(q) || (s.Note != null && s.Note.ToLower().Contains(q)));
        }

        var total = await query.CountAsync();
        var rows = await query.OrderByDescending(s => s.CreatedAt).Page(page, pageSize)
            .Select(s => new EmailSuppressionDto(s.Id, s.Email, s.Reason, s.Note, s.CreatedAt))
            .ToListAsync();
        return Ok(new PagedResult<EmailSuppressionDto>(rows, total, page, pageSize));
    }

    [HttpPost("suppressions")]
    [Authorize(Roles = $"{Roles.Admin},{Roles.Manager}")]
    public async Task<ActionResult<EmailSuppressionDto>> AddSuppression(SuppressionRequest request)
    {
        var email = EmailAddresses.Normalize(request.Email)
            ?? throw new ApiException(400, "A valid email address is required.");
        if (await db.EmailSuppressions.AnyAsync(s => s.Email == email))
            throw new ApiException(409, $"{email} is already suppressed.");

        var suppression = new EmailSuppression
        {
            OrganizationId = User.GetOrganizationId(),
            Email = email,
            Reason = EmailSuppressionReason.All.Contains(request.Reason) ? request.Reason! : EmailSuppressionReason.Manual,
            Note = request.Note.Clean(500)
        };
        db.EmailSuppressions.Add(suppression);
        await db.SaveChangesAsync();

        return Ok(new EmailSuppressionDto(
            suppression.Id, suppression.Email, suppression.Reason, suppression.Note, suppression.CreatedAt));
    }

    [HttpDelete("suppressions/{id:guid}")]
    [Authorize(Roles = $"{Roles.Admin},{Roles.Manager}")]
    public async Task<IActionResult> RemoveSuppression(Guid id)
    {
        var suppression = await db.EmailSuppressions.FirstOrDefaultAsync(s => s.Id == id)
            ?? throw new ApiException(404, "Suppression not found.");
        suppression.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("send")]
    public async Task<ActionResult<EmailMessageDto>> Send(SendEmailRequest request)
    {
        var subject = request.Subject.Clean(400);
        if (subject.Length == 0) throw new ApiException(400, "Subject is required.");
        if (request.Body.Clean(100_000).Length == 0 && string.IsNullOrWhiteSpace(request.HtmlBody))
            throw new ApiException(400, "A message body is required.");

        if (request.RelatedType is not null || request.RelatedId is not null)
        {
            if (request.RelatedType is null || request.RelatedId is null)
                throw new ApiException(400, "Related type and related id must be supplied together.");
            if (!SendableRelated.Contains(request.RelatedType))
                throw new ApiException(400, "Unknown related record type.");
            await EnsureRelatedExistsAsync(request.RelatedType, request.RelatedId.Value);
        }

        var to = request.To.Clean(254);
        string? toName = request.ToName.Clean(120) is { Length: > 0 } name ? name : null;
        if (to.Length == 0 && request.ContactId is Guid contactId)
        {
            var contact = await db.Contacts.AsNoTracking().FirstOrDefaultAsync(c => c.Id == contactId)
                ?? throw new ApiException(400, "The selected contact does not exist.");
            to = contact.Email ?? "";
            toName ??= contact.FullName;
        }
        if (to.Length == 0) throw new ApiException(400, "A recipient email address is required.");

        var message = await outbox.EnqueueAsync(new NewEmail(
            to, toName, subject, request.Body.Clean(100_000), request.HtmlBody?.Clean(100_000),
            request.RelatedType, request.RelatedId, request.ContactId, request.EmailAccountId),
            HttpContext.RequestAborted);

        if (message.RelatedType is not null && message.RelatedId is not null)
        {
            var activity = new Activity
            {
                OrganizationId = message.OrganizationId,
                Type = ActivityType.Email,
                Subject = message.Subject.Clean(240),
                Body = message.TextBody,
                RelatedType = message.RelatedType,
                RelatedId = message.RelatedId.Value,
                Status = ActivityStatus.Completed,
                CompletedAt = DateTime.UtcNow,
                Priority = "Normal",
                OwnerId = User.GetUserId(),
                EmailMessageId = message.Id
            };
            db.Activities.Add(activity);
            message.ActivityId = activity.Id;
            await db.SaveChangesAsync();
        }

        var names = await RelatedNamesAsync([message]);
        return Accepted(EmailMapper.Message(message, Name(names, message)));
    }

    private async Task EnsureRelatedExistsAsync(string relatedType, Guid id)
    {
        var exists = relatedType switch
        {
            EntityTypes.Account => await db.Accounts.AnyAsync(a => a.Id == id),
            EntityTypes.Contact => await db.Contacts.AnyAsync(c => c.Id == id),
            EntityTypes.Lead => await db.Leads.AnyAsync(l => l.Id == id),
            EntityTypes.Deal => await db.Deals.AnyAsync(d => d.Id == id),
            EntityTypes.Ticket => await db.Tickets.AnyAsync(t => t.Id == id),
            "Quote" => await db.Quotes.AnyAsync(q => q.Id == id),
            _ => false
        };
        if (!exists) throw new ApiException(400, "The related record does not exist.");
    }

    private async Task<Dictionary<Guid, string>> RelatedNamesAsync(IEnumerable<EmailMessage> rows)
    {
        var names = new Dictionary<Guid, string>();
        var ticketIds = rows.Where(m => m.RelatedType == EntityTypes.Ticket && m.RelatedId is not null)
            .Select(m => m.RelatedId!.Value).Distinct().ToList();
        if (ticketIds.Count > 0)
        {
            var tickets = await db.Tickets.AsNoTracking()
                .Where(t => ticketIds.Contains(t.Id))
                .Select(t => new { t.Id, t.Number, t.Subject })
                .ToListAsync();
            foreach (var ticket in tickets) names[ticket.Id] = $"{ticket.Number} · {ticket.Subject}";
        }

        var quoteIds = rows.Where(m => m.RelatedType == "Quote" && m.RelatedId is not null)
            .Select(m => m.RelatedId!.Value).Distinct().ToList();
        if (quoteIds.Count > 0)
        {
            var quotes = await db.Quotes.AsNoTracking()
                .Where(q => quoteIds.Contains(q.Id))
                .Select(q => new { q.Id, q.Number })
                .ToListAsync();
            foreach (var quote in quotes) names[quote.Id] = quote.Number;
        }

        return names;
    }

    private static string? Name(Dictionary<Guid, string> names, EmailMessage message) =>
        message.RelatedId is Guid id && names.TryGetValue(id, out var name) ? name : null;
}

public record EmailSuppressionDto(Guid Id, string Email, string Reason, string? Note, DateTime CreatedAt);
