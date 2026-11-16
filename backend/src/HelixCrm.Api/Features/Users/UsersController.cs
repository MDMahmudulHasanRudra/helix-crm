using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Users;

[ApiController]
[Route("api/v1/users")]
public class UsersController(HelixDbContext db) : ControllerBase
{
    public record CreateUserRequest(string? Email, string? FirstName, string? LastName, string? Role, string? Password, string? Title, string? Phone);
    public record UpdateUserRequest(string? FirstName, string? LastName, string? Role, string? Title, string? Phone, bool? IsActive);

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UserDto>>> List([FromQuery] string? search, [FromQuery] bool includeInactive = false)
    {
        var query = db.Users.AsQueryable();
        if (!includeInactive) query = query.Where(u => u.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(u => u.FirstName.ToLower().Contains(q) || u.LastName.ToLower().Contains(q) || u.Email.Contains(q));
        }

        var users = await query.OrderBy(u => u.FirstName).ThenBy(u => u.LastName).ToListAsync();
        return Ok(users.Select(DtoMapper.User).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<UserDto>> Get(Guid id)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id)
            ?? throw new ApiException(404, "User not found.");
        return Ok(DtoMapper.User(user));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserDto>> Create(CreateUserRequest request)
    {
        var email = request.Email.Clean(254).ToLowerInvariant();
        if (!email.Contains('@')) throw new ApiException(400, "A valid email is required.");
        if ((request.Password ?? "").Length < 8) throw new ApiException(400, "Password must be at least 8 characters.");

        var exists = await db.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == email);
        if (exists) throw new ApiException(409, "A user with this email already exists.");

        var role = Roles.All.Contains(request.Role) ? request.Role! : Roles.Rep;
        var user = new User
        {
            OrganizationId = User.GetOrganizationId(),
            Email = email,
            FirstName = request.FirstName.Clean(100) is { Length: > 0 } first ? first : "New",
            LastName = request.LastName.Clean(100) is { Length: > 0 } last ? last : "Teammate",
            Role = role,
            Title = request.Title.Clean(120),
            Phone = request.Phone.Clean(40),
            PasswordHash = PasswordHasher.Hash(request.Password!)
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = user.Id }, DtoMapper.User(user));
    }

    [HttpPatch("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserDto>> Update(Guid id, UpdateUserRequest request)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id)
            ?? throw new ApiException(404, "User not found.");

        if (request.Role is not null)
        {
            if (!Roles.All.Contains(request.Role)) throw new ApiException(400, "Unknown role.");
            if (id == User.GetUserId() && request.Role != Roles.Admin)
                throw new ApiException(400, "You cannot remove your own admin access.");
            user.Role = request.Role;
        }

        if (request.FirstName is not null) user.FirstName = request.FirstName.Clean(100);
        if (request.LastName is not null) user.LastName = request.LastName.Clean(100);
        if (request.Title is not null) user.Title = request.Title.Clean(120);
        if (request.Phone is not null) user.Phone = request.Phone.Clean(40);
        if (request.IsActive is not null)
        {
            if (id == User.GetUserId() && request.IsActive == false)
                throw new ApiException(400, "You cannot deactivate your own account.");
            user.IsActive = request.IsActive.Value;
        }

        await db.SaveChangesAsync();
        return Ok(DtoMapper.User(user));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (id == User.GetUserId()) throw new ApiException(400, "You cannot delete your own account.");
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id)
            ?? throw new ApiException(404, "User not found.");

        var adminCount = await db.Users.CountAsync(u => u.Role == Roles.Admin && u.IsActive && u.Id != id);
        if (user.Role == Roles.Admin && adminCount == 0)
            throw new ApiException(400, "The workspace must have at least one active admin.");

        user.IsDeleted = true;
        user.IsActive = false;
        await db.SaveChangesAsync();
        return NoContent();
    }
}
