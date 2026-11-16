using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Contacts;

[ApiController]
[Route("api/v1/contacts")]
public class ContactsController(HelixDbContext db) : ControllerBase
{
    public record ContactRequest(
        string? FirstName, string? LastName, string? Email, string? Phone, string? Mobile,
        string? Title, string? Department, Guid? AccountId, Guid? OwnerId, string? LinkedInUrl,
        string? City, string? Country, string? Notes, bool? IsPrimary, string[]? Tags,
        Dictionary<string, string?>? CustomFields);

    public record ContactImportRow(
        string? FirstName, string? LastName, string? Email, string? Phone, string? Title,
        string? Department, string? AccountName, string? City, string? Country);

    public record ImportResultDto(int ImportedCount, int SkippedCount, List<string> Messages);

    public record ContactListItemDto(
        Guid Id, string FirstName, string LastName, string FullName, string? Email, string? Phone,
        string? Title, Guid? AccountId, string? AccountName, Guid? OwnerId, string? OwnerName,
        string? OwnerAvatarUrl, string[] Tags, bool IsPrimary, DateTime UpdatedAt);

    public record ContactDetailDto(
        Guid Id, string FirstName, string LastName, string FullName, string? Email, string? Phone,
        string? Mobile, string? Title, string? Department, Guid? AccountId, string? AccountName,
        Guid? OwnerId, string? OwnerName, string? OwnerAvatarUrl, string? LinkedInUrl, string? City,
        string? Country, string? Notes, bool IsPrimary, string[] Tags, DateTime CreatedAt, DateTime UpdatedAt,
        List<DealRefDto> Deals, List<ActivityDto> Activities, List<TicketRefDto> Tickets,
        List<CustomFieldValueDto> CustomFields, List<AuditDto> Audit);

    private IQueryable<Contact> Filtered(string? search, Guid? ownerId, Guid? accountId, string? tag)
    {
        var query = db.Contacts.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(c => c.FirstName.ToLower().Contains(q)
                || c.LastName.ToLower().Contains(q)
                || (c.Email != null && c.Email.ToLower().Contains(q))
                || (c.Title != null && c.Title.ToLower().Contains(q))
                || (c.Account != null && c.Account.Name.ToLower().Contains(q)));
        }
        if (ownerId is not null) query = query.Where(c => c.OwnerId == ownerId);
        if (accountId is not null) query = query.Where(c => c.AccountId == accountId);
        if (!string.IsNullOrWhiteSpace(tag)) query = query.Where(c => c.TagsJson.Contains(tag));
        return query;
    }

    private static IQueryable<Contact> ApplySort(IQueryable<Contact> query, string? sort, string? dir)
    {
        var desc = !string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
        return sort switch
        {
            "name" => desc ? query.OrderByDescending(c => c.FirstName).ThenByDescending(c => c.LastName)
                           : query.OrderBy(c => c.FirstName).ThenBy(c => c.LastName),
            "company" => desc ? query.OrderByDescending(c => c.Account!.Name) : query.OrderBy(c => c.Account!.Name),
            "createdAt" => desc ? query.OrderByDescending(c => c.CreatedAt) : query.OrderBy(c => c.CreatedAt),
            _ => desc ? query.OrderByDescending(c => c.UpdatedAt) : query.OrderBy(c => c.UpdatedAt)
        };
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<ContactListItemDto>>> List(
        [FromQuery] string? search, [FromQuery] Guid? ownerId, [FromQuery] Guid? accountId,
        [FromQuery] string? tag, [FromQuery] string? sort, [FromQuery] string? dir,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = Filtered(search, ownerId, accountId, tag);
        var total = await query.CountAsync();

        var rows = await ApplySort(query, sort, dir).Page(page, pageSize)
            .Select(c => new
            {
                c.Id, c.FirstName, c.LastName, c.Email, c.Phone, c.Title, c.AccountId,
                AccountName = c.Account != null ? c.Account.Name : null,
                c.OwnerId,
                OwnerName = c.Owner != null ? c.Owner.FullName : null,
                OwnerAvatar = c.Owner != null ? c.Owner.AvatarUrl : null,
                c.TagsJson, c.IsPrimary, c.UpdatedAt
            }).ToListAsync();

        var items = rows.Select(c => new ContactListItemDto(
            c.Id, c.FirstName, c.LastName, $"{c.FirstName} {c.LastName}".Trim(), c.Email, c.Phone,
            c.Title, c.AccountId, c.AccountName, c.OwnerId, c.OwnerName, c.OwnerAvatar,
            Json.StringList(c.TagsJson).ToArray(), c.IsPrimary, c.UpdatedAt)).ToList();

        return Ok(new PagedResult<ContactListItemDto>(items, total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ContactDetailDto>> Get(Guid id)
    {
        var contact = await db.Contacts.AsNoTracking()
            .Include(c => c.Account).Include(c => c.Owner)
            .FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new ApiException(404, "Contact not found.");

        var deals = await db.Deals.AsNoTracking()
            .Where(d => d.PrimaryContactId == id || (contact.AccountId != null && d.AccountId == contact.AccountId))
            .OrderByDescending(d => d.UpdatedAt)
            .Select(d => new DealRefDto(d.Id, d.Name, d.Amount, d.Currency,
                d.Stage != null ? d.Stage.Name : "", d.Stage != null ? d.Stage.Color : "#94a3b8",
                d.Status, d.ExpectedCloseDate))
            .ToListAsync();

        var activities = await db.Activities.AsNoTracking()
            .Where(a => a.RelatedType == EntityTypes.Contact && a.RelatedId == id)
            .Include(a => a.Owner)
            .OrderByDescending(a => a.CreatedAt).Take(100).ToListAsync();

        var tickets = await db.Tickets.AsNoTracking()
            .Where(t => t.ContactId == id)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new TicketRefDto(t.Id, t.Number, t.Subject, t.Status, t.Priority, t.CreatedAt))
            .ToListAsync();

        var audit = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == nameof(Contact) && a.EntityId == id)
            .OrderByDescending(a => a.CreatedAt).Take(30).ToListAsync();

        var customFields = await CustomFieldHelper.ValuesAsync(db, EntityTypes.Contact, contact.CustomDataJson);

        return Ok(new ContactDetailDto(
            contact.Id, contact.FirstName, contact.LastName, contact.FullName, contact.Email, contact.Phone,
            contact.Mobile, contact.Title, contact.Department, contact.AccountId, contact.Account?.Name,
            contact.OwnerId, contact.Owner?.FullName, contact.Owner?.AvatarUrl, contact.LinkedInUrl,
            contact.City, contact.Country, contact.Notes, contact.IsPrimary,
            Json.StringList(contact.TagsJson).ToArray(), contact.CreatedAt, contact.UpdatedAt,
            deals, activities.Select(a => SharedMapper.Activity(a, a.Owner)).ToList(), tickets, customFields,
            audit.Select(SharedMapper.Audit).ToList()));
    }

    [HttpPost]
    public async Task<ActionResult<ContactListItemDto>> Create(ContactRequest request)
    {
        if (request.FirstName.Clean(100).Length == 0 && request.LastName.Clean(100).Length == 0)
            throw new ApiException(400, "A first or last name is required.");
        await EnsureRelations(request.AccountId, request.OwnerId);

        var contact = new Contact
        {
            OrganizationId = User.GetOrganizationId(),
            FirstName = request.FirstName.Clean(100),
            LastName = request.LastName.Clean(100),
            Email = request.Email.Clean(254),
            Phone = request.Phone.Clean(40),
            Mobile = request.Mobile.Clean(40),
            Title = request.Title.Clean(120),
            Department = request.Department.Clean(120),
            AccountId = request.AccountId,
            OwnerId = request.OwnerId ?? User.GetUserId(),
            LinkedInUrl = request.LinkedInUrl.Clean(300),
            City = request.City.Clean(120),
            Country = request.Country.Clean(120),
            Notes = request.Notes.Clean(4000),
            IsPrimary = request.IsPrimary ?? false,
            TagsJson = Json.Serialize(SanitizeTags(request.Tags)),
            CustomDataJson = await CustomFieldHelper.MergeAsync(db, EntityTypes.Contact, request.CustomFields, "{}")
        };

        db.Contacts.Add(contact);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = contact.Id },
            new ContactListItemDto(contact.Id, contact.FirstName, contact.LastName, contact.FullName,
                contact.Email, contact.Phone, contact.Title, contact.AccountId, null, contact.OwnerId,
                null, null, Json.StringList(contact.TagsJson).ToArray(), contact.IsPrimary, contact.UpdatedAt));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ContactDetailDto>> Update(Guid id, ContactRequest request)
    {
        var contact = await db.Contacts.FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new ApiException(404, "Contact not found.");
        await EnsureRelations(request.AccountId, request.OwnerId);

        if (request.FirstName.Clean(100).Length == 0 && request.LastName.Clean(100).Length == 0)
            throw new ApiException(400, "A first or last name is required.");

        contact.FirstName = request.FirstName.Clean(100);
        contact.LastName = request.LastName.Clean(100);
        contact.Email = request.Email.Clean(254);
        contact.Phone = request.Phone.Clean(40);
        contact.Mobile = request.Mobile.Clean(40);
        contact.Title = request.Title.Clean(120);
        contact.Department = request.Department.Clean(120);
        contact.AccountId = request.AccountId;
        contact.OwnerId = request.OwnerId ?? contact.OwnerId;
        contact.LinkedInUrl = request.LinkedInUrl.Clean(300);
        contact.City = request.City.Clean(120);
        contact.Country = request.Country.Clean(120);
        contact.Notes = request.Notes.Clean(4000);
        contact.IsPrimary = request.IsPrimary ?? contact.IsPrimary;
        contact.TagsJson = Json.Serialize(SanitizeTags(request.Tags));
        contact.CustomDataJson = await CustomFieldHelper.MergeAsync(db, EntityTypes.Contact, request.CustomFields, contact.CustomDataJson);

        await db.SaveChangesAsync();
        return Ok(await BuildDetail(id));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var contact = await db.Contacts.FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new ApiException(404, "Contact not found.");
        await db.Deals.Where(d => d.PrimaryContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.PrimaryContactId, (Guid?)null));
        contact.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? search, [FromQuery] Guid? ownerId, [FromQuery] Guid? accountId,
        [FromQuery] string? tag, [FromQuery] string? sort, [FromQuery] string? dir)
    {
        var rows = await ApplySort(Filtered(search, ownerId, accountId, tag), sort, dir)
            .Include(c => c.Account).Include(c => c.Owner).Take(10_000).ToListAsync();

        return CsvWriter.Build($"contacts-{DateTime.UtcNow:yyyyMMdd}.csv",
            ["First Name", "Last Name", "Email", "Phone", "Title", "Department", "Account", "Owner", "City", "Country", "Updated"],
            rows.Select(c => new[]
            {
                c.FirstName, c.LastName, c.Email, c.Phone, c.Title, c.Department,
                c.Account?.Name, c.Owner?.FullName, c.City, c.Country, c.UpdatedAt.ToString("u")
            }));
    }

    [HttpPost("import")]
    public async Task<ActionResult<ImportResultDto>> Import([FromBody] List<ContactImportRow> rows)
    {
        if (rows == null || rows.Count == 0)
            throw new ApiException(400, "No rows provided for import.");

        var imported = 0;
        var skipped = 0;
        var messages = new List<string>();

        var existingEmails = await db.Contacts
            .Where(c => c.Email != null)
            .Select(c => c.Email!.ToLower())
            .ToListAsync();
        var existingEmailSet = new HashSet<string>(existingEmails, StringComparer.OrdinalIgnoreCase);

        var accounts = await db.Accounts.Select(a => new { a.Id, a.Name }).ToListAsync();
        var accountMap = accounts.ToDictionary(a => a.Name.ToLower(), a => a.Id);

        var orgId = User.GetOrganizationId();
        var userId = User.GetUserId();

        foreach (var row in rows)
        {
            var first = row.FirstName?.Trim() ?? "";
            var last = row.LastName?.Trim() ?? "";
            var email = row.Email?.Trim();

            if (string.IsNullOrWhiteSpace(first) && string.IsNullOrWhiteSpace(last))
            {
                skipped++;
                continue;
            }

            if (!string.IsNullOrWhiteSpace(email) && existingEmailSet.Contains(email))
            {
                skipped++;
                messages.Add($"Skipped '{email}': Contact with this email already exists.");
                continue;
            }

            Guid? accountId = null;
            if (!string.IsNullOrWhiteSpace(row.AccountName) && accountMap.TryGetValue(row.AccountName.Trim().ToLower(), out var matchedAccId))
            {
                accountId = matchedAccId;
            }

            var contact = new Contact
            {
                OrganizationId = orgId,
                FirstName = first.Clean(100),
                LastName = last.Clean(100),
                Email = email.Clean(254),
                Phone = row.Phone.Clean(40),
                Title = row.Title.Clean(100),
                Department = row.Department.Clean(100),
                City = row.City.Clean(100),
                Country = row.Country.Clean(100),
                AccountId = accountId,
                OwnerId = userId
            };

            db.Contacts.Add(contact);
            if (!string.IsNullOrWhiteSpace(email)) existingEmailSet.Add(email);
            imported++;
        }

        await db.SaveChangesAsync();
        return Ok(new ImportResultDto(imported, skipped, messages));
    }

    private async Task<ContactDetailDto> BuildDetail(Guid id)
    {
        var result = await Get(id);
        return result.Value ?? (result.Result as ObjectResult)?.Value as ContactDetailDto
            ?? throw new ApiException(404, "Contact not found.");
    }

    private async Task EnsureRelations(Guid? accountId, Guid? ownerId)
    {
        if (accountId is not null && !await db.Accounts.AnyAsync(a => a.Id == accountId))
            throw new ApiException(400, "The selected account does not exist.");
        if (ownerId is not null && !await db.Users.AnyAsync(u => u.Id == ownerId))
            throw new ApiException(400, "The selected owner is not part of this workspace.");
    }

    private static string[] SanitizeTags(string[]? tags) =>
        (tags ?? []).Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(10).ToArray();
}
