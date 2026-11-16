using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Common;

public static class CustomFieldHelper
{
    public static async Task<List<CustomFieldValueDto>> ValuesAsync(
        HelixDbContext db, string entityType, string dataJson, CancellationToken ct = default)
    {
        var definitions = await db.CustomFieldDefinitions
            .Where(f => f.EntityType == entityType && f.IsActive)
            .OrderBy(f => f.SortOrder)
            .ToListAsync(ct);

        var values = Json.Map(dataJson);
        return definitions.Select(d => new CustomFieldValueDto(
            d.Key, d.Label, d.FieldType,
            values.TryGetValue(d.Key, out var v) ? v : null,
            Json.StringList(d.OptionsJson).ToArray(),
            d.IsRequired, d.Placeholder, d.HelpText)).ToList();
    }

    /// <summary>Merges incoming custom values with existing ones, ignoring keys that are not
    /// defined for the entity and rejecting missing required fields.</summary>
    public static async Task<string> MergeAsync(
        HelixDbContext db, string entityType, Dictionary<string, string?>? incoming,
        string? existingJson, CancellationToken ct = default)
    {
        var definitions = await db.CustomFieldDefinitions
            .Where(f => f.EntityType == entityType && f.IsActive)
            .ToListAsync(ct);

        var existing = Json.Map(existingJson);
        if (incoming is not null)
        {
            foreach (var (key, value) in incoming)
            {
                if (definitions.Any(d => d.Key == key)) existing[key] = value;
            }
        }

        foreach (var required in definitions.Where(d => d.IsRequired))
        {
            if (!existing.TryGetValue(required.Key, out var value) || string.IsNullOrWhiteSpace(value))
                throw new ApiException(400, $"{required.Label} is required.");
        }

        return Json.Serialize(existing);
    }
}
