using System.Text.RegularExpressions;
using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Config;

[ApiController]
[Route("api/v1/custom-fields")]
public class CustomFieldsController(HelixDbContext db) : ControllerBase
{
    public record CustomFieldDto(Guid Id, string EntityType, string Key, string Label, string FieldType,
        string[] Options, bool IsRequired, int SortOrder, bool IsActive, string? Placeholder, string? HelpText);

    public record CustomFieldRequest(string? EntityType, string? Key, string? Label, string? FieldType,
        string[]? Options, bool? IsRequired, int? SortOrder, bool? IsActive, string? Placeholder, string? HelpText);

    private static readonly string[] FieldTypes =
        ["text", "textarea", "number", "currency", "date", "boolean", "select", "url", "email"];

    [HttpGet]
    public async Task<ActionResult<List<CustomFieldDto>>> List([FromQuery] string? entityType)
    {
        var query = db.CustomFieldDefinitions.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(f => f.EntityType == entityType);
        var fields = await query.OrderBy(f => f.EntityType).ThenBy(f => f.SortOrder).ToListAsync();
        return Ok(fields.Select(ToDto).ToList());
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<CustomFieldDto>> Create(CustomFieldRequest request)
    {
        var entityType = NormalizeEntityType(request.EntityType);
        if (!EntityTypes.All.Contains(entityType))
            throw new ApiException(400, "Custom fields are supported on accounts, contacts, leads and deals.");

        var label = request.Label.Clean(120);
        if (label.Length == 0) throw new ApiException(400, "Field label is required.");

        var key = string.IsNullOrWhiteSpace(request.Key)
            ? Regex.Replace(label.ToLowerInvariant(), "[^a-z0-9]+", "_").Trim('_')
            : Regex.Replace(request.Key.Trim().ToLowerInvariant(), "[^a-z0-9_]+", "_").Trim('_');
        if (key.Length == 0) throw new ApiException(400, "Field key is required.");
        if (key.Length > 60) throw new ApiException(400, "Field key must be 60 characters or less.");

        if (await db.CustomFieldDefinitions.AnyAsync(f => f.EntityType == entityType && f.Key == key))
            throw new ApiException(409, "A field with this key already exists for this entity.");

        var fieldType = FieldTypes.Contains(request.FieldType) ? request.FieldType! : "text";
        var maxSort = await db.CustomFieldDefinitions.Where(f => f.EntityType == entityType)
            .MaxAsync(f => (int?)f.SortOrder) ?? 0;

        var field = new CustomFieldDefinition
        {
            OrganizationId = User.GetOrganizationId(),
            EntityType = entityType,
            Key = key,
            Label = label,
            FieldType = fieldType,
            OptionsJson = Json.Serialize((request.Options ?? []).Select(o => o.Trim()).Where(o => o.Length > 0).Distinct().Take(50)),
            IsRequired = request.IsRequired ?? false,
            SortOrder = request.SortOrder ?? maxSort + 1,
            IsActive = request.IsActive ?? true,
            Placeholder = request.Placeholder.Clean(120),
            HelpText = request.HelpText.Clean(300)
        };

        db.CustomFieldDefinitions.Add(field);
        await db.SaveChangesAsync();
        return Ok(ToDto(field));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<CustomFieldDto>> Update(Guid id, CustomFieldRequest request)
    {
        var field = await db.CustomFieldDefinitions.FirstOrDefaultAsync(f => f.Id == id)
            ?? throw new ApiException(404, "Custom field not found.");

        var label = request.Label.Clean(120);
        if (label.Length == 0) throw new ApiException(400, "Field label is required.");

        field.Label = label;
        if (FieldTypes.Contains(request.FieldType)) field.FieldType = request.FieldType!;
        if (request.Options is not null)
            field.OptionsJson = Json.Serialize(request.Options.Select(o => o.Trim()).Where(o => o.Length > 0).Distinct().Take(50));
        if (request.IsRequired is not null) field.IsRequired = request.IsRequired.Value;
        if (request.SortOrder is not null) field.SortOrder = request.SortOrder.Value;
        if (request.IsActive is not null) field.IsActive = request.IsActive.Value;
        if (request.Placeholder is not null) field.Placeholder = request.Placeholder.Clean(120);
        if (request.HelpText is not null) field.HelpText = request.HelpText.Clean(300);

        await db.SaveChangesAsync();
        return Ok(ToDto(field));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var field = await db.CustomFieldDefinitions.FirstOrDefaultAsync(f => f.Id == id)
            ?? throw new ApiException(404, "Custom field not found.");
        field.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static string NormalizeEntityType(string? value) =>
        EntityTypes.All.FirstOrDefault(t => string.Equals(t, value, StringComparison.OrdinalIgnoreCase)) ?? "Account";

    private static CustomFieldDto ToDto(CustomFieldDefinition f) => new(
        f.Id, f.EntityType, f.Key, f.Label, f.FieldType, Json.StringList(f.OptionsJson).ToArray(),
        f.IsRequired, f.SortOrder, f.IsActive, f.Placeholder, f.HelpText);
}
