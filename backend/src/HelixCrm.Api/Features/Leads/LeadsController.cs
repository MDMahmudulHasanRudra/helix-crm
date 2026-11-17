using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using HelixCrm.Api.Features.Autonomous;
using HelixCrm.Api.Features.Config;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Leads;

[ApiController]
[Route("api/v1/leads")]
public class LeadsController(HelixDbContext db, IAutomationEngine automation, LeadAutopilot autopilot) : ControllerBase
{
    public record LeadRequest(
        string? FirstName, string? LastName, string? Company, string? Email, string? Phone,
        string? Title, string? Website, string? Source, string? Status, int? Score,
        decimal? EstimatedValue, Guid? OwnerId, string? Notes, string[]? Tags,
        Dictionary<string, string?>? CustomFields);

    public record LeadImportRow(
        string? FirstName, string? LastName, string? Company, string? Email, string? Phone,
        string? Title, string? Source, string? Status, int? Score, decimal? EstimatedValue);

    public record ImportResultDto(int ImportedCount, int SkippedCount, List<string> Messages);

    public record ConvertLeadRequest(Guid? AccountId, bool? CreateDeal, string? DealName, decimal? Amount, Guid? PipelineId, Guid? StageId, Guid? OwnerId);

    public record LeadListItemDto(
        Guid Id, string FirstName, string LastName, string FullName, string? Company, string? Email,
        string? Phone, string? Title, string Source, string Status, int Score, decimal? EstimatedValue,
        Guid? OwnerId, string? OwnerName, string? OwnerAvatarUrl, string[] Tags, DateTime UpdatedAt,
        string RoutingState);

    public record LeadDetailDto(
        Guid Id, string FirstName, string LastName, string FullName, string? Company, string? Email,
        string? Phone, string? Title, string? Website, string Source, string Status, int Score,
        decimal? EstimatedValue, Guid? OwnerId, string? OwnerName, string? OwnerAvatarUrl, string? Notes,
        string[] Tags, Guid? ConvertedAccountId, string? ConvertedAccountName, Guid? ConvertedContactId,
        string? ConvertedContactName, Guid? ConvertedDealId, string? ConvertedDealName, DateTime? ConvertedAt,
        DateTime CreatedAt, DateTime UpdatedAt, List<ActivityDto> Activities,
        List<CustomFieldValueDto> CustomFields, List<AuditDto> Audit, string ScoreBreakdownJson, string RoutingState);

    private IQueryable<Lead> Filtered(string? search, Guid? ownerId, string? status, string? source)
    {
        var query = db.Leads.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(l => l.FirstName.ToLower().Contains(q)
                || l.LastName.ToLower().Contains(q)
                || (l.Company != null && l.Company.ToLower().Contains(q))
                || (l.Email != null && l.Email.ToLower().Contains(q)));
        }
        if (ownerId is not null) query = query.Where(l => l.OwnerId == ownerId);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(l => l.Status == status);
        if (!string.IsNullOrWhiteSpace(source)) query = query.Where(l => l.Source == source);
        return query;
    }

    private static IQueryable<Lead> ApplySort(IQueryable<Lead> query, string? sort, string? dir)
    {
        var desc = !string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
        return sort switch
        {
            "name" => desc ? query.OrderByDescending(l => l.FirstName) : query.OrderBy(l => l.FirstName),
            "company" => desc ? query.OrderByDescending(l => l.Company) : query.OrderBy(l => l.Company),
            "score" => desc ? query.OrderByDescending(l => l.Score) : query.OrderBy(l => l.Score),
            "value" => desc ? query.OrderByDescending(l => l.EstimatedValue) : query.OrderBy(l => l.EstimatedValue),
            "createdAt" => desc ? query.OrderByDescending(l => l.CreatedAt) : query.OrderBy(l => l.CreatedAt),
            _ => desc ? query.OrderByDescending(l => l.UpdatedAt) : query.OrderBy(l => l.UpdatedAt)
        };
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<LeadListItemDto>>> List(
        [FromQuery] string? search, [FromQuery] Guid? ownerId, [FromQuery] string? status,
        [FromQuery] string? source, [FromQuery] string? sort, [FromQuery] string? dir,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = Filtered(search, ownerId, status, source);
        var total = await query.CountAsync();

        var rows = await ApplySort(query, sort, dir).Page(page, pageSize)
            .Select(l => new
            {
                l.Id, l.FirstName, l.LastName, l.Company, l.Email, l.Phone, l.Title, l.Source, l.Status,
                l.Score, l.EstimatedValue, l.OwnerId,
                OwnerName = l.Owner != null ? l.Owner.FullName : null,
                OwnerAvatar = l.Owner != null ? l.Owner.AvatarUrl : null,
                l.TagsJson, l.UpdatedAt, l.RoutingState
            }).ToListAsync();

        var items = rows.Select(l => new LeadListItemDto(
            l.Id, l.FirstName, l.LastName, $"{l.FirstName} {l.LastName}".Trim(), l.Company, l.Email,
            l.Phone, l.Title, l.Source, l.Status, l.Score, l.EstimatedValue, l.OwnerId, l.OwnerName,
            l.OwnerAvatar, Json.StringList(l.TagsJson).ToArray(), l.UpdatedAt, l.RoutingState)).ToList();

        return Ok(new PagedResult<LeadListItemDto>(items, total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<LeadDetailDto>> Get(Guid id)
    {
        var lead = await db.Leads.AsNoTracking().Include(l => l.Owner)
            .FirstOrDefaultAsync(l => l.Id == id)
            ?? throw new ApiException(404, "Lead not found.");

        var activities = await db.Activities.AsNoTracking()
            .Where(a => a.RelatedType == EntityTypes.Lead && a.RelatedId == id)
            .Include(a => a.Owner).OrderByDescending(a => a.CreatedAt).Take(100).ToListAsync();

        var audit = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == nameof(Lead) && a.EntityId == id)
            .OrderByDescending(a => a.CreatedAt).Take(30).ToListAsync();

        var customFields = await CustomFieldHelper.ValuesAsync(db, EntityTypes.Lead, lead.CustomDataJson);

        string? accountName = null, contactName = null, dealName = null;
        if (lead.ConvertedAccountId is not null) accountName = await db.Accounts.Where(a => a.Id == lead.ConvertedAccountId).Select(a => a.Name).FirstOrDefaultAsync();
        if (lead.ConvertedContactId is not null)
        {
            var converted = await db.Contacts.Where(c => c.Id == lead.ConvertedContactId)
                .Select(c => new { c.FirstName, c.LastName }).FirstOrDefaultAsync();
            if (converted is not null) contactName = $"{converted.FirstName} {converted.LastName}".Trim();
        }
        if (lead.ConvertedDealId is not null) dealName = await db.Deals.Where(d => d.Id == lead.ConvertedDealId).Select(d => d.Name).FirstOrDefaultAsync();

        return Ok(new LeadDetailDto(
            lead.Id, lead.FirstName, lead.LastName, lead.FullName, lead.Company, lead.Email, lead.Phone,
            lead.Title, lead.Website, lead.Source, lead.Status, lead.Score, lead.EstimatedValue,
            lead.OwnerId, lead.Owner?.FullName, lead.Owner?.AvatarUrl, lead.Notes,
            Json.StringList(lead.TagsJson).ToArray(), lead.ConvertedAccountId, accountName,
            lead.ConvertedContactId, contactName, lead.ConvertedDealId, dealName, lead.ConvertedAt,
            lead.CreatedAt, lead.UpdatedAt, activities.Select(a => SharedMapper.Activity(a, a.Owner)).ToList(),
            customFields, audit.Select(SharedMapper.Audit).ToList(), lead.ScoreBreakdownJson, lead.RoutingState));
    }

    [HttpPost]
    public async Task<ActionResult<LeadListItemDto>> Create(LeadRequest request)
    {
        if (request.FirstName.Clean(100).Length == 0 && request.LastName.Clean(100).Length == 0
            && request.Company.Clean(200).Length == 0)
            throw new ApiException(400, "At least a name or company is required.");
        await EnsureOwner(request.OwnerId);

        var lead = new Lead
        {
            OrganizationId = User.GetOrganizationId(),
            FirstName = request.FirstName.Clean(100),
            LastName = request.LastName.Clean(100),
            Company = request.Company.Clean(200),
            Email = Similarity.FixEmailDomainTypo(request.Email.Clean(254)),
            Phone = request.Phone.Clean(40),
            Title = request.Title.Clean(120),
            Website = request.Website.Clean(300),
            Source = request.Source.Clean(60) is { Length: > 0 } src ? src : "Website",
            Status = LeadStatus.All.Contains(request.Status) ? request.Status! : LeadStatus.New,
            Score = Math.Clamp(request.Score ?? 0, 0, 100),
            EstimatedValue = request.EstimatedValue,
            OwnerId = request.OwnerId,
            Notes = request.Notes.Clean(4000),
            TagsJson = Json.Serialize(SanitizeTags(request.Tags)),
            CustomDataJson = await CustomFieldHelper.MergeAsync(db, EntityTypes.Lead, request.CustomFields, "{}")
        };

        await autopilot.ApplyScoreAsync(lead);
        var organization = await db.GetCurrentOrganizationAsync();
        await autopilot.ApplyRoutingAsync(lead, organization, User.GetUserId(), request.OwnerId is not null);

        db.Leads.Add(lead);
        await db.SaveChangesAsync();
        await automation.TriggerAsync(AutomationEvents.LeadCreated, "Lead", lead.Id, lead.FullName, lead.OwnerId);
        return CreatedAtAction(nameof(Get), new { id = lead.Id }, ToListItem(lead));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<LeadDetailDto>> Update(Guid id, LeadRequest request)
    {
        var lead = await db.Leads.FirstOrDefaultAsync(l => l.Id == id)
            ?? throw new ApiException(404, "Lead not found.");
        await EnsureOwner(request.OwnerId);

        lead.FirstName = request.FirstName.Clean(100);
        lead.LastName = request.LastName.Clean(100);
        lead.Company = request.Company.Clean(200);
        lead.Email = Similarity.FixEmailDomainTypo(request.Email.Clean(254));
        lead.Phone = request.Phone.Clean(40);
        lead.Title = request.Title.Clean(120);
        lead.Website = request.Website.Clean(300);
        lead.Source = request.Source.Clean(60) is { Length: > 0 } src ? src : lead.Source;
        if (LeadStatus.All.Contains(request.Status)) lead.Status = request.Status!;
        lead.Score = Math.Clamp(request.Score ?? lead.Score, 0, 100);
        lead.EstimatedValue = request.EstimatedValue;
        lead.OwnerId = request.OwnerId ?? lead.OwnerId;
        lead.Notes = request.Notes.Clean(4000);
        lead.TagsJson = Json.Serialize(SanitizeTags(request.Tags));
        lead.CustomDataJson = await CustomFieldHelper.MergeAsync(db, EntityTypes.Lead, request.CustomFields, lead.CustomDataJson);

        await autopilot.ApplyScoreAsync(lead);
        await db.SaveChangesAsync();
        return Ok(await BuildDetail(id));
    }

    [HttpPost("{id:guid}/convert")]
    public async Task<ActionResult<object>> Convert(Guid id, ConvertLeadRequest request)
    {
        var lead = await db.Leads.FirstOrDefaultAsync(l => l.Id == id)
            ?? throw new ApiException(404, "Lead not found.");
        if (lead.Status == LeadStatus.Converted || lead.ConvertedContactId is not null)
            throw new ApiException(409, "This lead has already been converted.");

        var organizationId = User.GetOrganizationId();
        var ownerId = request.OwnerId ?? lead.OwnerId ?? User.GetUserId();
        if (!await db.Users.AnyAsync(u => u.Id == ownerId))
            throw new ApiException(400, "The selected owner is not part of this workspace.");

        Account? account = null;
        if (request.AccountId is not null)
        {
            account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.AccountId)
                ?? throw new ApiException(400, "The selected account does not exist.");
        }
        else
        {
            var company = lead.Company.Clean(200) is { Length: > 0 } c ? c : lead.FullName;
            account = new Account
            {
                OrganizationId = organizationId,
                Name = company,
                Website = lead.Website,
                Email = lead.Email,
                Phone = lead.Phone,
                OwnerId = ownerId,
                Status = "Active",
                TagsJson = "[]",
                CustomDataJson = "{}"
            };
            db.Accounts.Add(account);
        }

        var contact = new Contact
        {
            OrganizationId = organizationId,
            FirstName = lead.FirstName,
            LastName = lead.LastName,
            Email = lead.Email,
            Phone = lead.Phone,
            Title = lead.Title,
            AccountId = account.Id,
            OwnerId = ownerId,
            IsPrimary = true,
            TagsJson = "[]",
            CustomDataJson = "{}"
        };
        db.Contacts.Add(contact);

        Deal? deal = null;
        if (request.CreateDeal != false)
        {
            var pipeline = request.PipelineId is not null
                ? await db.Pipelines.FirstOrDefaultAsync(p => p.Id == request.PipelineId)
                : await db.Pipelines.OrderByDescending(p => p.IsDefault).ThenBy(p => p.Name).FirstOrDefaultAsync();
            if (pipeline is null) throw new ApiException(400, "Create a pipeline before converting leads into deals.");

            var stage = request.StageId is not null
                ? await db.Stages.FirstOrDefaultAsync(s => s.Id == request.StageId && s.PipelineId == pipeline.Id)
                : await db.Stages.Where(s => s.PipelineId == pipeline.Id && !s.IsWon && !s.IsLost)
                    .OrderBy(s => s.SortOrder).FirstOrDefaultAsync();
            stage ??= await db.Stages.Where(s => s.PipelineId == pipeline.Id).OrderBy(s => s.SortOrder).FirstOrDefaultAsync();
            if (stage is null) throw new ApiException(400, "The selected pipeline has no stages.");

            deal = new Deal
            {
                OrganizationId = organizationId,
                Name = request.DealName.Clean(200) is { Length: > 0 } dn ? dn : $"{account.Name} — New opportunity",
                AccountId = account.Id,
                PrimaryContactId = contact.Id,
                PipelineId = pipeline.Id,
                StageId = stage.Id,
                Amount = request.Amount ?? lead.EstimatedValue ?? 0,
                Probability = stage.Probability,
                ExpectedCloseDate = DateTime.UtcNow.AddDays(30),
                Status = DealStatus.Open,
                Source = lead.Source,
                OwnerId = ownerId,
                TagsJson = "[]",
                CustomDataJson = "{}"
            };
            db.Deals.Add(deal);
        }

        lead.Status = LeadStatus.Converted;
        lead.ConvertedAt = DateTime.UtcNow;
        lead.ConvertedAccountId = account.Id;
        lead.ConvertedContactId = contact.Id;
        lead.ConvertedDealId = deal?.Id;

        db.Activities.Add(new Activity
        {
            OrganizationId = organizationId,
            Type = ActivityType.Note,
            Subject = "Lead converted",
            Body = $"{lead.FullName} was converted into an account and contact" + (deal is not null ? " with a new opportunity." : "."),
            Status = ActivityStatus.Completed,
            RelatedType = EntityTypes.Account,
            RelatedId = account.Id,
            OwnerId = User.GetUserId()
        });

        await db.SaveChangesAsync();

        return Ok(new
        {
            accountId = account.Id,
            contactId = contact.Id,
            dealId = deal?.Id,
            message = deal is not null ? "Lead converted into an account, contact and deal." : "Lead converted into an account and contact."
        });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var lead = await db.Leads.FirstOrDefaultAsync(l => l.Id == id)
            ?? throw new ApiException(404, "Lead not found.");
        lead.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? search, [FromQuery] Guid? ownerId, [FromQuery] string? status,
        [FromQuery] string? source, [FromQuery] string? sort, [FromQuery] string? dir)
    {
        var rows = await ApplySort(Filtered(search, ownerId, status, source), sort, dir)
            .Include(l => l.Owner).Take(10_000).ToListAsync();

        return CsvWriter.Build($"leads-{DateTime.UtcNow:yyyyMMdd}.csv",
            ["First Name", "Last Name", "Company", "Email", "Phone", "Title", "Source", "Status", "Score", "Estimated Value", "Owner", "Updated"],
            rows.Select(l => new[]
            {
                l.FirstName, l.LastName, l.Company, l.Email, l.Phone, l.Title, l.Source, l.Status,
                l.Score.ToString(), l.EstimatedValue?.ToString("0.00"), l.Owner?.FullName, l.UpdatedAt.ToString("u")
            }));
    }

    [HttpPost("import")]
    public async Task<ActionResult<ImportResultDto>> Import([FromBody] List<LeadImportRow> rows)
    {
        if (rows == null || rows.Count == 0)
            throw new ApiException(400, "No rows provided for import.");

        var imported = 0;
        var skipped = 0;
        var messages = new List<string>();

        var existingEmails = await db.Leads
            .Where(l => l.Email != null)
            .Select(l => l.Email!.ToLower())
            .ToListAsync();
        var existingEmailSet = new HashSet<string>(existingEmails, StringComparer.OrdinalIgnoreCase);

        var orgId = User.GetOrganizationId();
        var userId = User.GetUserId();
        var organization = await db.GetCurrentOrganizationAsync();

        foreach (var row in rows)
        {
            var first = row.FirstName?.Trim() ?? "";
            var last = row.LastName?.Trim() ?? "";
            var company = row.Company?.Trim();
            var email = Similarity.FixEmailDomainTypo(row.Email?.Trim());

            if (string.IsNullOrWhiteSpace(first) && string.IsNullOrWhiteSpace(last) && string.IsNullOrWhiteSpace(company))
            {
                skipped++;
                continue;
            }

            if (!string.IsNullOrWhiteSpace(email) && existingEmailSet.Contains(email))
            {
                skipped++;
                messages.Add($"Skipped '{email}': Lead with this email already exists.");
                continue;
            }

            var lead = new Lead
            {
                OrganizationId = orgId,
                FirstName = first.Clean(100),
                LastName = last.Clean(100),
                Company = company.Clean(200),
                Email = email.Clean(254),
                Phone = row.Phone.Clean(40),
                Title = row.Title.Clean(120),
                Source = string.IsNullOrWhiteSpace(row.Source) ? "Website" : row.Source.Clean(60),
                Status = LeadStatus.All.Contains(row.Status) ? row.Status! : LeadStatus.New,
                Score = Math.Clamp(row.Score ?? 0, 0, 100),
                EstimatedValue = row.EstimatedValue,
                OwnerId = null
            };

            await autopilot.ApplyScoreAsync(lead);
            db.Leads.Add(lead);
            await autopilot.ApplyRoutingAsync(lead, organization, userId, ownerExplicit: false);

            if (!string.IsNullOrWhiteSpace(email)) existingEmailSet.Add(email);
            imported++;
        }

        await db.SaveChangesAsync();
        return Ok(new ImportResultDto(imported, skipped, messages));
    }

    private static LeadListItemDto ToListItem(Lead l) => new(
        l.Id, l.FirstName, l.LastName, l.FullName, l.Company, l.Email, l.Phone, l.Title, l.Source,
        l.Status, l.Score, l.EstimatedValue, l.OwnerId, null, null,
        Json.StringList(l.TagsJson).ToArray(), l.UpdatedAt, l.RoutingState);

    private async Task<LeadDetailDto> BuildDetail(Guid id)
    {
        var result = await Get(id);
        return result.Value ?? (result.Result as ObjectResult)?.Value as LeadDetailDto
            ?? throw new ApiException(404, "Lead not found.");
    }

    private async Task EnsureOwner(Guid? ownerId)
    {
        if (ownerId is not null && !await db.Users.AnyAsync(u => u.Id == ownerId))
            throw new ApiException(400, "The selected owner is not part of this workspace.");
    }

    private static string[] SanitizeTags(string[]? tags) =>
        (tags ?? []).Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(10).ToArray();
}
