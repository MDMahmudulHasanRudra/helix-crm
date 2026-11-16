using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using HelixCrm.Api.Features.Config;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Deals;

[ApiController]
[Route("api/v1/deals")]
public class DealsController(HelixDbContext db, IAutomationEngine automation) : ControllerBase
{
    public record DealRequest(
        string? Name, Guid? AccountId, Guid? PrimaryContactId, decimal? Amount, string? Currency,
        Guid? PipelineId, Guid? StageId, DateTime? ExpectedCloseDate, string? Source,
        string? Description, string? NextStep, Guid? OwnerId, string[]? Tags,
        Dictionary<string, string?>? CustomFields, string? LostReason);

    public record MoveStageRequest(Guid StageId, string? LostReason);

    public record DealListItemDto(
        Guid Id, string Name, decimal Amount, string Currency, Guid? AccountId, string? AccountName,
        Guid StageId, string StageName, string StageColor, Guid PipelineId, string Status, int Probability,
        DateTime? ExpectedCloseDate, string? NextStep, Guid? OwnerId, string? OwnerName,
        string? OwnerAvatarUrl, string[] Tags, DateTime UpdatedAt, bool IsStalled, int HealthIndex);

    public record DealDetailDto(
        Guid Id, string Name, Guid? AccountId, string? AccountName, Guid? PrimaryContactId,
        string? PrimaryContactName, string? PrimaryContactEmail, decimal Amount, string Currency,
        Guid PipelineId, string PipelineName, Guid StageId, string StageName, string StageColor,
        string Status, int Probability, DateTime? ExpectedCloseDate, DateTime? ClosedAt, string? Source,
        string? Description, string? NextStep, Guid? OwnerId, string? OwnerName, string? OwnerAvatarUrl,
        string[] Tags, DateTime CreatedAt, DateTime UpdatedAt, List<ActivityDto> Activities,
        List<QuoteRefDto> Quotes, List<CustomFieldValueDto> CustomFields, List<AuditDto> Audit,
        bool IsStalled, int HealthIndex, DateTime? LastStageMovedAt, string? LostReason);

    private IQueryable<Deal> Filtered(string? search, Guid? ownerId, Guid? pipelineId, Guid? stageId, string? status, Guid? accountId)
    {
        var query = db.Deals.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(d => d.Name.ToLower().Contains(q)
                || (d.Account != null && d.Account.Name.ToLower().Contains(q))
                || (d.NextStep != null && d.NextStep.ToLower().Contains(q)));
        }
        if (ownerId is not null) query = query.Where(d => d.OwnerId == ownerId);
        if (pipelineId is not null) query = query.Where(d => d.PipelineId == pipelineId);
        if (stageId is not null) query = query.Where(d => d.StageId == stageId);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(d => d.Status == status);
        if (accountId is not null) query = query.Where(d => d.AccountId == accountId);
        return query;
    }

    private static IQueryable<Deal> ApplySort(IQueryable<Deal> query, string? sort, string? dir)
    {
        var desc = !string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
        return sort switch
        {
            "name" => desc ? query.OrderByDescending(d => d.Name) : query.OrderBy(d => d.Name),
            "amount" => desc ? query.OrderByDescending(d => d.Amount) : query.OrderBy(d => d.Amount),
            "closeDate" => desc ? query.OrderByDescending(d => d.ExpectedCloseDate) : query.OrderBy(d => d.ExpectedCloseDate),
            "probability" => desc ? query.OrderByDescending(d => d.Probability) : query.OrderBy(d => d.Probability),
            "createdAt" => desc ? query.OrderByDescending(d => d.CreatedAt) : query.OrderBy(d => d.CreatedAt),
            _ => desc ? query.OrderByDescending(d => d.UpdatedAt) : query.OrderBy(d => d.UpdatedAt)
        };
    }

    private record DealRow(
        Guid Id, string Name, decimal Amount, string Currency, Guid? AccountId, string? AccountName,
        Guid StageId, string StageName, string StageColor, Guid PipelineId, string Status, int Probability,
        DateTime? ExpectedCloseDate, string? NextStep, Guid? OwnerId, string? OwnerName,
        string? OwnerAvatarUrl, string TagsJson, DateTime UpdatedAt, bool IsStalled, int HealthIndex);

    private static IQueryable<DealRow> ProjectRows(IQueryable<Deal> query) =>
        query.Select(d => new DealRow(
            d.Id, d.Name, d.Amount, d.Currency, d.AccountId,
            d.Account != null ? d.Account.Name : null,
            d.StageId, d.Stage != null ? d.Stage.Name : "", d.Stage != null ? d.Stage.Color : "#94a3b8",
            d.PipelineId, d.Status, d.Probability, d.ExpectedCloseDate, d.NextStep, d.OwnerId,
            d.Owner != null ? d.Owner.FullName : null,
            d.Owner != null ? d.Owner.AvatarUrl : null,
            d.TagsJson, d.UpdatedAt, d.IsStalled, d.HealthIndex));

    private static DealListItemDto ToDto(DealRow d) => new(
        d.Id, d.Name, d.Amount, d.Currency, d.AccountId, d.AccountName, d.StageId, d.StageName,
        d.StageColor, d.PipelineId, d.Status, d.Probability, d.ExpectedCloseDate, d.NextStep, d.OwnerId,
        d.OwnerName, d.OwnerAvatarUrl, Json.StringList(d.TagsJson).ToArray(), d.UpdatedAt,
        d.IsStalled, d.HealthIndex);

    [HttpGet]
    public async Task<ActionResult<PagedResult<DealListItemDto>>> List(
        [FromQuery] string? search, [FromQuery] Guid? ownerId, [FromQuery] Guid? pipelineId,
        [FromQuery] Guid? stageId, [FromQuery] string? status, [FromQuery] Guid? accountId,
        [FromQuery] string? sort, [FromQuery] string? dir, [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = Filtered(search, ownerId, pipelineId, stageId, status, accountId);
        var total = await query.CountAsync();
        var rows = await ProjectRows(ApplySort(query, sort, dir)).Page(page, pageSize).ToListAsync();
        return Ok(new PagedResult<DealListItemDto>(rows.Select(ToDto).ToList(), total, page, pageSize));
    }

    [HttpGet("board")]
    public async Task<ActionResult<object>> Board(
        [FromQuery] Guid? pipelineId, [FromQuery] Guid? ownerId, [FromQuery] string? search)
    {
        var pipeline = pipelineId is not null
            ? await db.Pipelines.AsNoTracking().FirstOrDefaultAsync(p => p.Id == pipelineId)
            : await db.Pipelines.AsNoTracking().OrderByDescending(p => p.IsDefault).ThenBy(p => p.Name).FirstOrDefaultAsync()
              ?? await db.Pipelines.AsNoTracking().OrderBy(p => p.Name).FirstOrDefaultAsync();

        if (pipeline is null) throw new ApiException(404, "No pipeline found. Create a pipeline in Settings.");

        var stages = await db.Stages.AsNoTracking().Where(s => s.PipelineId == pipeline.Id)
            .OrderBy(s => s.SortOrder).ToListAsync();

        var deals = await ProjectRows(Filtered(search, ownerId, pipeline.Id, null, null, null)
            .Where(d => d.Status == DealStatus.Open))
            .ToListAsync();
        var dealDtos = deals.OrderByDescending(d => d.Amount).Select(ToDto).ToList();

        var columns = stages.Select(s =>
        {
            var stageDeals = dealDtos.Where(d => d.StageId == s.Id).ToList();
            return new
            {
                s.Id,
                s.Name,
                s.Color,
                s.Probability,
                s.IsWon,
                s.IsLost,
                count = stageDeals.Count,
                value = stageDeals.Sum(d => d.Amount),
                deals = stageDeals
            };
        }).ToList();

        return Ok(new
        {
            pipeline = new { pipeline.Id, pipeline.Name, pipeline.IsDefault },
            pipelines = await db.Pipelines.AsNoTracking().OrderByDescending(p => p.IsDefault).ThenBy(p => p.Name)
                .Select(p => new { p.Id, p.Name, p.IsDefault }).ToListAsync(),
            stages = columns,
            totals = new
            {
                count = dealDtos.Count,
                value = dealDtos.Sum(d => d.Amount),
                weighted = dealDtos.Sum(d => d.Amount * d.Probability / 100m)
            }
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DealDetailDto>> Get(Guid id)
    {
        var deal = await db.Deals.AsNoTracking()
            .Include(d => d.Account).Include(d => d.PrimaryContact).Include(d => d.Pipeline)
            .Include(d => d.Stage).Include(d => d.Owner)
            .FirstOrDefaultAsync(d => d.Id == id)
            ?? throw new ApiException(404, "Deal not found.");

        var activities = await db.Activities.AsNoTracking()
            .Where(a => a.RelatedType == EntityTypes.Deal && a.RelatedId == id)
            .Include(a => a.Owner).OrderByDescending(a => a.CreatedAt).Take(100).ToListAsync();

        var quotes = await db.Quotes.AsNoTracking().Where(q => q.DealId == id)
            .OrderByDescending(q => q.IssueDate)
            .Select(q => new QuoteRefDto(q.Id, q.Number, q.Status, q.Total, q.Currency, q.IssueDate))
            .ToListAsync();

        var audit = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == nameof(Deal) && a.EntityId == id)
            .OrderByDescending(a => a.CreatedAt).Take(30).ToListAsync();

        var customFields = await CustomFieldHelper.ValuesAsync(db, EntityTypes.Deal, deal.CustomDataJson);

        return Ok(new DealDetailDto(
            deal.Id, deal.Name, deal.AccountId, deal.Account?.Name, deal.PrimaryContactId,
            deal.PrimaryContact?.FullName, deal.PrimaryContact?.Email, deal.Amount, deal.Currency,
            deal.PipelineId, deal.Pipeline?.Name ?? "", deal.StageId, deal.Stage?.Name ?? "",
            deal.Stage?.Color ?? "#94a3b8", deal.Status, deal.Probability, deal.ExpectedCloseDate,
            deal.ClosedAt, deal.Source, deal.Description, deal.NextStep, deal.OwnerId, deal.Owner?.FullName,
            deal.Owner?.AvatarUrl, Json.StringList(deal.TagsJson).ToArray(), deal.CreatedAt, deal.UpdatedAt,
            activities.Select(a => SharedMapper.Activity(a, a.Owner)).ToList(), quotes, customFields,
            audit.Select(SharedMapper.Audit).ToList(), deal.IsStalled, deal.HealthIndex,
            deal.LastStageMovedAt, deal.LostReason));
    }

    [HttpPost]
    public async Task<ActionResult<DealListItemDto>> Create(DealRequest request)
    {
        var name = request.Name.Clean(200);
        if (name.Length == 0) throw new ApiException(400, "Deal name is required.");
        if (request.Amount is < 0) throw new ApiException(400, "Amount cannot be negative.");
        await EnsureRelations(request.AccountId, request.PrimaryContactId, request.OwnerId);

        var (pipeline, stage) = await ResolveStage(request.PipelineId, request.StageId);

        var deal = new Deal
        {
            OrganizationId = User.GetOrganizationId(),
            Name = name,
            AccountId = request.AccountId,
            PrimaryContactId = request.PrimaryContactId,
            Amount = request.Amount ?? 0,
            Currency = request.Currency.Clean(8) is { Length: > 0 } cur ? cur : "USD",
            PipelineId = pipeline.Id,
            StageId = stage.Id,
            Probability = stage.Probability,
            ExpectedCloseDate = request.ExpectedCloseDate,
            Status = stage.IsWon ? DealStatus.Won : stage.IsLost ? DealStatus.Lost : DealStatus.Open,
            ClosedAt = stage.IsWon || stage.IsLost ? DateTime.UtcNow : null,
            Source = request.Source.Clean(60),
            Description = request.Description.Clean(4000),
            NextStep = request.NextStep.Clean(240),
            OwnerId = request.OwnerId ?? User.GetUserId(),
            TagsJson = Json.Serialize(SanitizeTags(request.Tags)),
            CustomDataJson = await CustomFieldHelper.MergeAsync(db, EntityTypes.Deal, request.CustomFields, "{}"),
            LastStageMovedAt = DateTime.UtcNow,
            HealthIndex = 100
        };

        db.Deals.Add(deal);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = deal.Id }, new DealListItemDto(
            deal.Id, deal.Name, deal.Amount, deal.Currency, deal.AccountId, null, deal.StageId, stage.Name,
            stage.Color, deal.PipelineId, deal.Status, deal.Probability, deal.ExpectedCloseDate, deal.NextStep,
            deal.OwnerId, null, null, Json.StringList(deal.TagsJson).ToArray(), deal.UpdatedAt,
            deal.IsStalled, deal.HealthIndex));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<DealDetailDto>> Update(Guid id, DealRequest request)
    {
        var deal = await db.Deals.FirstOrDefaultAsync(d => d.Id == id)
            ?? throw new ApiException(404, "Deal not found.");
        var name = request.Name.Clean(200);
        if (name.Length == 0) throw new ApiException(400, "Deal name is required.");
        if (request.Amount is < 0) throw new ApiException(400, "Amount cannot be negative.");
        await EnsureRelations(request.AccountId, request.PrimaryContactId, request.OwnerId);

        var (pipeline, stage) = await ResolveStage(request.PipelineId ?? deal.PipelineId, request.StageId ?? deal.StageId);
        var stageChanged = deal.StageId != stage.Id;

        deal.Name = name;
        deal.AccountId = request.AccountId;
        deal.PrimaryContactId = request.PrimaryContactId;
        deal.Amount = request.Amount ?? deal.Amount;
        deal.Currency = request.Currency.Clean(8) is { Length: > 0 } cur ? cur : deal.Currency;
        deal.PipelineId = pipeline.Id;
        deal.StageId = stage.Id;
        deal.Probability = stage.Probability;
        deal.ExpectedCloseDate = request.ExpectedCloseDate;
        deal.Status = stage.IsWon ? DealStatus.Won : stage.IsLost ? DealStatus.Lost : DealStatus.Open;
        deal.ClosedAt = stage.IsWon || stage.IsLost ? deal.ClosedAt ?? DateTime.UtcNow : null;
        deal.LostReason = stage.IsLost
            ? (request.LostReason.Clean(60) is { Length: > 0 } reason ? reason : deal.LostReason)
            : null;
        deal.Source = request.Source.Clean(60);
        deal.Description = request.Description.Clean(4000);
        deal.NextStep = request.NextStep.Clean(240);
        deal.OwnerId = request.OwnerId ?? deal.OwnerId;
        deal.TagsJson = Json.Serialize(SanitizeTags(request.Tags));
        deal.CustomDataJson = await CustomFieldHelper.MergeAsync(db, EntityTypes.Deal, request.CustomFields, deal.CustomDataJson);
        if (stageChanged)
        {
            deal.LastStageMovedAt = DateTime.UtcNow;
            deal.IsStalled = false;
            deal.HealthIndex = 100;
        }

        await db.SaveChangesAsync();
        return Ok(await BuildDetail(id));
    }

    [HttpPatch("{id:guid}/stage")]
    public async Task<ActionResult<DealListItemDto>> MoveStage(Guid id, MoveStageRequest request)
    {
        var deal = await db.Deals.Include(d => d.Stage).FirstOrDefaultAsync(d => d.Id == id)
            ?? throw new ApiException(404, "Deal not found.");
        var stage = await db.Stages.FirstOrDefaultAsync(s => s.Id == request.StageId && s.PipelineId == deal.PipelineId)
            ?? throw new ApiException(400, "That stage does not belong to this deal's pipeline.");

        var oldStage = deal.Stage?.Name ?? "previous stage";
        if (deal.StageId == stage.Id) return Ok(await ListItem(id));

        var lostReason = request.LostReason.Clean(60);
        if (stage.IsLost && lostReason.Length == 0)
            throw new ApiException(400, "A lost reason is required when moving a deal to a lost stage (e.g. Price, Competitor, Budget freeze).");

        deal.StageId = stage.Id;
        deal.Probability = stage.Probability;
        deal.Status = stage.IsWon ? DealStatus.Won : stage.IsLost ? DealStatus.Lost : DealStatus.Open;
        deal.ClosedAt = stage.IsWon || stage.IsLost ? DateTime.UtcNow : null;
        deal.LostReason = stage.IsLost ? lostReason : null;
        deal.LastStageMovedAt = DateTime.UtcNow;
        deal.IsStalled = false;
        deal.HealthIndex = 100;

        db.Activities.Add(new Activity
        {
            OrganizationId = deal.OrganizationId,
            Type = ActivityType.Note,
            Subject = $"Stage moved to {stage.Name}",
            Body = $"{User.GetDisplayName()} moved this deal from {oldStage} to {stage.Name}.",
            Status = ActivityStatus.Completed,
            RelatedType = EntityTypes.Deal,
            RelatedId = deal.Id,
            OwnerId = User.GetUserId()
        });

        await db.SaveChangesAsync();
        if (stage.IsWon)
        {
            await automation.TriggerAsync(AutomationEvents.DealWon, "Deal", deal.Id, deal.Name, deal.OwnerId);
        }
        return Ok(await ListItem(id));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var deal = await db.Deals.FirstOrDefaultAsync(d => d.Id == id)
            ?? throw new ApiException(404, "Deal not found.");
        deal.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? search, [FromQuery] Guid? ownerId, [FromQuery] Guid? pipelineId,
        [FromQuery] Guid? stageId, [FromQuery] string? status, [FromQuery] Guid? accountId,
        [FromQuery] string? sort, [FromQuery] string? dir)
    {
        var rows = await ApplySort(Filtered(search, ownerId, pipelineId, stageId, status, accountId), sort, dir)
            .Include(d => d.Account).Include(d => d.Stage).Include(d => d.Owner).Take(10_000).ToListAsync();

        return CsvWriter.Build($"deals-{DateTime.UtcNow:yyyyMMdd}.csv",
            ["Deal", "Account", "Stage", "Status", "Amount", "Currency", "Probability", "Expected Close", "Owner", "Next Step", "Updated"],
            rows.Select(d => new[]
            {
                d.Name, d.Account?.Name, d.Stage?.Name, d.Status, d.Amount.ToString("0.00"), d.Currency,
                d.Probability.ToString(), d.ExpectedCloseDate?.ToString("yyyy-MM-dd"), d.Owner?.FullName,
                d.NextStep, d.UpdatedAt.ToString("u")
            }));
    }

    private async Task<DealListItemDto> ListItem(Guid id)
    {
        var row = await ProjectRows(db.Deals.AsNoTracking().Where(d => d.Id == id)).FirstAsync();
        return ToDto(row);
    }

    private async Task<DealDetailDto> BuildDetail(Guid id)
    {
        var result = await Get(id);
        return result.Value ?? (result.Result as ObjectResult)?.Value as DealDetailDto
            ?? throw new ApiException(404, "Deal not found.");
    }

    private async Task<(Pipeline Pipeline, Stage Stage)> ResolveStage(Guid? pipelineId, Guid? stageId)
    {
        Pipeline? pipeline;
        if (pipelineId is not null)
        {
            pipeline = await db.Pipelines.FirstOrDefaultAsync(p => p.Id == pipelineId)
                ?? throw new ApiException(400, "The selected pipeline does not exist.");
        }
        else
        {
            pipeline = await db.Pipelines.OrderByDescending(p => p.IsDefault).ThenBy(p => p.Name).FirstOrDefaultAsync()
                ?? throw new ApiException(400, "Create a pipeline before creating deals.");
        }

        Stage? stage;
        if (stageId is not null)
        {
            stage = await db.Stages.FirstOrDefaultAsync(s => s.Id == stageId && s.PipelineId == pipeline.Id)
                ?? throw new ApiException(400, "The selected stage does not belong to this pipeline.");
        }
        else
        {
            stage = await db.Stages.Where(s => s.PipelineId == pipeline.Id && !s.IsWon && !s.IsLost)
                .OrderBy(s => s.SortOrder).FirstOrDefaultAsync()
                ?? await db.Stages.Where(s => s.PipelineId == pipeline.Id).OrderBy(s => s.SortOrder).FirstOrDefaultAsync()
                ?? throw new ApiException(400, "The selected pipeline has no stages.");
        }

        return (pipeline, stage);
    }

    private async Task EnsureRelations(Guid? accountId, Guid? contactId, Guid? ownerId)
    {
        if (accountId is not null && !await db.Accounts.AnyAsync(a => a.Id == accountId))
            throw new ApiException(400, "The selected account does not exist.");
        if (contactId is not null && !await db.Contacts.AnyAsync(c => c.Id == contactId))
            throw new ApiException(400, "The selected contact does not exist.");
        if (ownerId is not null && !await db.Users.AnyAsync(u => u.Id == ownerId))
            throw new ApiException(400, "The selected owner is not part of this workspace.");
    }

    private static string[] SanitizeTags(string[]? tags) =>
        (tags ?? []).Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(10).ToArray();
}
