using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Notifications;

[ApiController]
[Route("api/v1/notifications")]
public class NotificationsController(HelixDbContext db) : ControllerBase
{
    public record NotificationDto(Guid Id, string Title, string? Body, string? Link, string Type, bool IsRead, DateTime CreatedAt);

    [HttpGet]
    public async Task<ActionResult<object>> List([FromQuery] bool unreadOnly = false)
    {
        var userId = User.GetUserId();
        var query = db.Notifications.AsNoTracking().Where(n => n.UserId == userId);
        var unread = await query.CountAsync(n => !n.IsRead);
        if (unreadOnly) query = query.Where(n => !n.IsRead);

        var items = await query.OrderByDescending(n => n.CreatedAt).Take(30)
            .Select(n => new NotificationDto(n.Id, n.Title, n.Body, n.Link, n.Type, n.IsRead, n.CreatedAt))
            .ToListAsync();

        return Ok(new { items, unread });
    }

    [HttpPatch("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var notification = await db.Notifications.FirstOrDefaultAsync(n => n.Id == id && n.UserId == User.GetUserId())
            ?? throw new ApiException(404, "Notification not found.");
        notification.IsRead = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var userId = User.GetUserId();
        await db.Notifications.Where(n => n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true).SetProperty(n => n.UpdatedAt, DateTime.UtcNow));
        return NoContent();
    }
}
