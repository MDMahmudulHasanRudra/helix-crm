using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Tickets;

[ApiController]
[Route("api/v1/canned-responses")]
public class CannedResponsesController(HelixDbContext db, ITenantProvider tenant) : ControllerBase
{
    public record CannedResponseRequest(string? Title, string? Shortcut, string? Content, string? Category);

    public record CannedResponseDto(Guid Id, string Title, string Shortcut, string Content, string Category, DateTime CreatedAt, DateTime UpdatedAt);

    [HttpGet]
    public async Task<ActionResult<List<CannedResponseDto>>> List([FromQuery] string? category, [FromQuery] string? search)
    {
        var query = db.CannedResponses.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(c => c.Category == category);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(c => c.Title.ToLower().Contains(q) || c.Shortcut.ToLower().Contains(q) || c.Content.ToLower().Contains(q));
        }

        var items = await query
            .OrderBy(c => c.Category)
            .ThenBy(c => c.Shortcut)
            .Select(c => new CannedResponseDto(c.Id, c.Title, c.Shortcut, c.Content, c.Category ?? "General", c.CreatedAt, c.UpdatedAt))
            .ToListAsync();

        return Ok(items);
    }

    [Authorize(Roles = "Admin,Manager")]

    [HttpPost]
    public async Task<ActionResult<CannedResponseDto>> Create(CannedResponseRequest request)
    {
        var title = request.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title))
            throw new ApiException(400, "Title is required.");

        var shortcut = request.Shortcut?.Trim() ?? "";
        if (!shortcut.StartsWith("/")) shortcut = "/" + shortcut;

        var content = request.Content?.Trim();
        if (string.IsNullOrWhiteSpace(content))
            throw new ApiException(400, "Content is required.");

        var item = new CannedResponse
        {
            OrganizationId = tenant.OrganizationId,
            Title = title,
            Shortcut = shortcut,
            Content = content,
            Category = string.IsNullOrWhiteSpace(request.Category) ? "General" : request.Category.Trim()
        };

        db.CannedResponses.Add(item);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(List), new { id = item.Id },
            new CannedResponseDto(item.Id, item.Title, item.Shortcut, item.Content, item.Category ?? "General", item.CreatedAt, item.UpdatedAt));
    }

    [Authorize(Roles = "Admin,Manager")]

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CannedResponseDto>> Update(Guid id, CannedResponseRequest request)
    {
        var item = await db.CannedResponses.FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new ApiException(404, "Canned response not found.");

        if (!string.IsNullOrWhiteSpace(request.Title))
            item.Title = request.Title.Trim();

        if (!string.IsNullOrWhiteSpace(request.Shortcut))
        {
            var shortcut = request.Shortcut.Trim();
            if (!shortcut.StartsWith("/")) shortcut = "/" + shortcut;
            item.Shortcut = shortcut;
        }

        if (!string.IsNullOrWhiteSpace(request.Content))
            item.Content = request.Content.Trim();

        if (!string.IsNullOrWhiteSpace(request.Category))
            item.Category = request.Category.Trim();

        await db.SaveChangesAsync();

        return Ok(new CannedResponseDto(item.Id, item.Title, item.Shortcut, item.Content, item.Category ?? "General", item.CreatedAt, item.UpdatedAt));
    }

    [Authorize(Roles = "Admin,Manager")]

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var item = await db.CannedResponses.FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new ApiException(404, "Canned response not found.");

        item.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }
}

