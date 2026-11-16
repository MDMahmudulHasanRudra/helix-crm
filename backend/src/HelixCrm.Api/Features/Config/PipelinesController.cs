using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Config;

[ApiController]
[Route("api/v1/pipelines")]
public class PipelinesController(HelixDbContext db) : ControllerBase
{
    public record StageDto(Guid Id, string Name, int SortOrder, int Probability, string Color, bool IsWon, bool IsLost, int DealCount, decimal DealValue);
    public record PipelineDto(Guid Id, string Name, bool IsDefault, int OpenDealCount, decimal OpenValue, List<StageDto> Stages);
    public record PipelineRequest(string? Name, bool? IsDefault);
    public record StageRequest(string? Name, int? Probability, string? Color, bool? IsWon, bool? IsLost);
    public record ReorderRequest(List<Guid>? StageIds);

    [HttpGet]
    public async Task<ActionResult<List<PipelineDto>>> List()
    {
        var pipelines = await db.Pipelines.AsNoTracking().OrderByDescending(p => p.IsDefault).ThenBy(p => p.Name).ToListAsync();
        var stages = await db.Stages.AsNoTracking().OrderBy(s => s.SortOrder).ToListAsync();
        var deals = await db.Deals.AsNoTracking()
            .Select(d => new { d.PipelineId, d.StageId, d.Status, d.Amount })
            .ToListAsync();

        var result = pipelines.Select(p =>
        {
            var pipelineDeals = deals.Where(d => d.PipelineId == p.Id && d.Status == DealStatus.Open).ToList();
            var stageDtos = stages.Where(s => s.PipelineId == p.Id).Select(s =>
            {
                var stageDeals = pipelineDeals.Where(d => d.StageId == s.Id).ToList();
                return new StageDto(s.Id, s.Name, s.SortOrder, s.Probability, s.Color, s.IsWon, s.IsLost,
                    stageDeals.Count, stageDeals.Sum(d => d.Amount));
            }).ToList();
            return new PipelineDto(p.Id, p.Name, p.IsDefault, pipelineDeals.Count, pipelineDeals.Sum(d => d.Amount), stageDtos);
        }).ToList();

        return Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<PipelineDto>> Create(PipelineRequest request)
    {
        var name = request.Name.Clean(120);
        if (name.Length == 0) throw new ApiException(400, "Pipeline name is required.");

        var isFirst = !await db.Pipelines.AnyAsync();
        var pipeline = new Pipeline
        {
            OrganizationId = User.GetOrganizationId(),
            Name = name,
            IsDefault = isFirst || request.IsDefault == true
        };
        if (pipeline.IsDefault) await ClearDefaults();

        db.Pipelines.Add(pipeline);
        await db.SaveChangesAsync();
        return Ok(new PipelineDto(pipeline.Id, pipeline.Name, pipeline.IsDefault, 0, 0, []));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<PipelineDto>> Update(Guid id, PipelineRequest request)
    {
        var pipeline = await db.Pipelines.FirstOrDefaultAsync(p => p.Id == id)
            ?? throw new ApiException(404, "Pipeline not found.");
        var name = request.Name.Clean(120);
        if (name.Length == 0) throw new ApiException(400, "Pipeline name is required.");
        pipeline.Name = name;

        if (request.IsDefault == true)
        {
            await ClearDefaults();
            pipeline.IsDefault = true;
        }

        await db.SaveChangesAsync();
        return Ok(new PipelineDto(pipeline.Id, pipeline.Name, pipeline.IsDefault, 0, 0, []));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var pipeline = await db.Pipelines.FirstOrDefaultAsync(p => p.Id == id)
            ?? throw new ApiException(404, "Pipeline not found.");
        if (await db.Pipelines.CountAsync() <= 1)
            throw new ApiException(400, "You need at least one pipeline.");
        if (await db.Deals.AnyAsync(d => d.PipelineId == id && d.Status == DealStatus.Open))
            throw new ApiException(409, "This pipeline still has open deals. Move or close them first.");

        pipeline.IsDeleted = true;
        var stages = await db.Stages.Where(s => s.PipelineId == id).ToListAsync();
        foreach (var stage in stages) stage.IsDeleted = true;

        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/stages")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<StageDto>> AddStage(Guid id, StageRequest request)
    {
        var pipeline = await db.Pipelines.FirstOrDefaultAsync(p => p.Id == id)
            ?? throw new ApiException(404, "Pipeline not found.");
        var name = request.Name.Clean(120);
        if (name.Length == 0) throw new ApiException(400, "Stage name is required.");

        var maxSort = await db.Stages.Where(s => s.PipelineId == id).MaxAsync(s => (int?)s.SortOrder) ?? 0;
        var stage = new Stage
        {
            OrganizationId = pipeline.OrganizationId,
            PipelineId = id,
            Name = name,
            SortOrder = maxSort + 1,
            Probability = Math.Clamp(request.Probability ?? 20, 0, 100),
            Color = NormalizeColor(request.Color),
            IsWon = request.IsWon ?? false,
            IsLost = request.IsLost ?? false
        };
        db.Stages.Add(stage);
        await db.SaveChangesAsync();
        return Ok(new StageDto(stage.Id, stage.Name, stage.SortOrder, stage.Probability, stage.Color,
            stage.IsWon, stage.IsLost, 0, 0));
    }

    [HttpPut("{id:guid}/stages/{stageId:guid}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<StageDto>> UpdateStage(Guid id, Guid stageId, StageRequest request)
    {
        var stage = await db.Stages.FirstOrDefaultAsync(s => s.Id == stageId && s.PipelineId == id)
            ?? throw new ApiException(404, "Stage not found.");
        var name = request.Name.Clean(120);
        if (name.Length == 0) throw new ApiException(400, "Stage name is required.");

        stage.Name = name;
        stage.Probability = Math.Clamp(request.Probability ?? stage.Probability, 0, 100);
        stage.Color = NormalizeColor(request.Color ?? stage.Color);
        stage.IsWon = request.IsWon ?? stage.IsWon;
        stage.IsLost = request.IsLost ?? stage.IsLost;
        if (stage.IsWon && stage.IsLost) stage.IsLost = false;

        await db.SaveChangesAsync();
        return Ok(new StageDto(stage.Id, stage.Name, stage.SortOrder, stage.Probability, stage.Color,
            stage.IsWon, stage.IsLost, 0, 0));
    }

    [HttpDelete("{id:guid}/stages/{stageId:guid}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> DeleteStage(Guid id, Guid stageId)
    {
        var stage = await db.Stages.FirstOrDefaultAsync(s => s.Id == stageId && s.PipelineId == id)
            ?? throw new ApiException(404, "Stage not found.");
        if (await db.Deals.AnyAsync(d => d.StageId == stageId && d.Status == DealStatus.Open))
            throw new ApiException(409, "This stage still has open deals. Move them first.");
        if (await db.Stages.CountAsync(s => s.PipelineId == id) <= 1)
            throw new ApiException(400, "A pipeline must have at least one stage.");

        stage.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("{id:guid}/stages/reorder")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> Reorder(Guid id, ReorderRequest request)
    {
        var ids = request.StageIds ?? [];
        var stages = await db.Stages.Where(s => s.PipelineId == id).ToListAsync();
        if (ids.Count != stages.Count || ids.Any(i => stages.All(s => s.Id != i)))
            throw new ApiException(400, "The reorder list must contain every stage exactly once.");

        for (var i = 0; i < ids.Count; i++)
        {
            var stage = stages.First(s => s.Id == ids[i]);
            stage.SortOrder = i + 1;
        }
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task ClearDefaults()
    {
        var defaults = await db.Pipelines.Where(p => p.IsDefault).ToListAsync();
        foreach (var p in defaults) p.IsDefault = false;
    }

    private static string NormalizeColor(string? color) =>
        !string.IsNullOrWhiteSpace(color) && color.StartsWith('#') && color.Length <= 9 ? color : "#6366f1";
}
