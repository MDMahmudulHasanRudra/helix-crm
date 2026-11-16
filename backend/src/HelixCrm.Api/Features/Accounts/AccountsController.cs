using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Accounts;

[ApiController]
[Route("api/v1/accounts")]
public class AccountsController(HelixDbContext db) : ControllerBase
{
    public record AccountRequest(
        string? Name, string? Domain, string? Website, string? Industry, int? Employees,
        decimal? AnnualRevenue, string? Phone, string? Email, string? Street, string? City,
        string? State, string? PostalCode, string? Country, string? Description, string? Status,
        Guid? OwnerId, string[]? Tags, Dictionary<string, string?>? CustomFields);

    public record AccountImportRow(
        string? Name, string? Domain, string? Industry, string? Phone, string? Email,
        string? City, string? Country, string? Status);

    public record ImportResultDto(int ImportedCount, int SkippedCount, List<string> Messages);

    public record AccountListItemDto(
        Guid Id, string Name, string? Domain, string? Industry, string? Phone, string? City,
        string? Country, string Status, int ContactCount, int OpenDealCount, decimal OpenPipelineValue,
        string[] Tags, Guid? OwnerId, string? OwnerName, string? OwnerAvatarUrl, DateTime UpdatedAt);

    public record AccountDetailDto(
        Guid Id, string Name, string? Domain, string? Website, string? Industry, int? Employees,
        decimal? AnnualRevenue, string? Phone, string? Email, string? Street, string? City, string? State,
        string? PostalCode, string? Country, string? Description, string Status, string[] Tags,
        Guid? OwnerId, string? OwnerName, string? OwnerAvatarUrl, DateTime CreatedAt, DateTime UpdatedAt,
        List<ContactRefDto> Contacts, List<DealRefDto> Deals, List<ActivityDto> Activities,
        List<TicketRefDto> Tickets, List<QuoteRefDto> Quotes,
        List<CustomFieldValueDto> CustomFields, List<AuditDto> Audit);

    private IQueryable<Account> Filtered(string? search, Guid? ownerId, string? status, string? industry)
    {
        var query = db.Accounts.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(a => a.Name.ToLower().Contains(q)
                || (a.Domain != null && a.Domain.ToLower().Contains(q))
                || (a.Email != null && a.Email.ToLower().Contains(q)));
        }
        if (ownerId is not null) query = query.Where(a => a.OwnerId == ownerId);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(a => a.Status == status);
        if (!string.IsNullOrWhiteSpace(industry)) query = query.Where(a => a.Industry == industry);
        return query;
    }

    private static IQueryable<Account> ApplySort(IQueryable<Account> query, string? sort, string? dir)
    {
        var desc = !string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
        return sort switch
        {
            "name" => desc ? query.OrderByDescending(a => a.Name) : query.OrderBy(a => a.Name),
            "revenue" => desc ? query.OrderByDescending(a => a.AnnualRevenue) : query.OrderBy(a => a.AnnualRevenue),
            "employees" => desc ? query.OrderByDescending(a => a.Employees) : query.OrderBy(a => a.Employees),
            "createdAt" => desc ? query.OrderByDescending(a => a.CreatedAt) : query.OrderBy(a => a.CreatedAt),
            _ => desc ? query.OrderByDescending(a => a.UpdatedAt) : query.OrderBy(a => a.UpdatedAt)
        };
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<AccountListItemDto>>> List(
        [FromQuery] string? search, [FromQuery] Guid? ownerId, [FromQuery] string? status,
        [FromQuery] string? industry, [FromQuery] string? sort, [FromQuery] string? dir,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = Filtered(search, ownerId, status, industry);
        var total = await query.CountAsync();
        var rows = await ApplySort(query, sort, dir).Page(page, pageSize)
            .Select(a => new
            {
                a.Id, a.Name, a.Domain, a.Industry, a.Phone, a.City, a.Country, a.Status, a.TagsJson,
                a.OwnerId, OwnerName = a.Owner != null ? a.Owner.FullName : null,
                OwnerAvatar = a.Owner != null ? a.Owner.AvatarUrl : null,
                ContactCount = a.Contacts.Count,
                OpenDealCount = a.Deals.Count(d => d.Status == DealStatus.Open),
                OpenPipelineValue = a.Deals.Where(d => d.Status == DealStatus.Open).Sum(d => (decimal?)d.Amount) ?? 0,
                a.UpdatedAt
            }).ToListAsync();

        var items = rows.Select(a => new AccountListItemDto(
            a.Id, a.Name, a.Domain, a.Industry, a.Phone, a.City, a.Country, a.Status,
            a.ContactCount, a.OpenDealCount, a.OpenPipelineValue, Json.StringList(a.TagsJson).ToArray(),
            a.OwnerId, a.OwnerName, a.OwnerAvatar, a.UpdatedAt)).ToList();

        return Ok(new PagedResult<AccountListItemDto>(items, total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<AccountDetailDto>> Get(Guid id)
    {
        var account = await db.Accounts.AsNoTracking()
            .Include(a => a.Owner)
            .FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Account not found.");

        var contactRows = await db.Contacts.AsNoTracking()
            .Where(c => c.AccountId == id)
            .OrderByDescending(c => c.IsPrimary).ThenBy(c => c.FirstName)
            .Select(c => new { c.Id, c.FirstName, c.LastName, c.Email, c.Title, c.AccountId })
            .ToListAsync();
        var contacts = contactRows.Select(c => new ContactRefDto(
            c.Id, $"{c.FirstName} {c.LastName}".Trim(), c.Email, c.Title, c.AccountId, account.Name)).ToList();

        var deals = await db.Deals.AsNoTracking()
            .Where(d => d.AccountId == id)
            .OrderByDescending(d => d.UpdatedAt)
            .Select(d => new DealRefDto(d.Id, d.Name, d.Amount, d.Currency,
                d.Stage != null ? d.Stage.Name : "", d.Stage != null ? d.Stage.Color : "#94a3b8",
                d.Status, d.ExpectedCloseDate))
            .ToListAsync();

        var activities = await db.Activities.AsNoTracking()
            .Where(a => a.RelatedType == EntityTypes.Account && a.RelatedId == id)
            .Include(a => a.Owner)
            .OrderByDescending(a => a.CreatedAt)
            .Take(100)
            .ToListAsync();

        var tickets = await db.Tickets.AsNoTracking()
            .Where(t => t.AccountId == id)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new TicketRefDto(t.Id, t.Number, t.Subject, t.Status, t.Priority, t.CreatedAt))
            .ToListAsync();

        var quotes = await db.Quotes.AsNoTracking()
            .Where(q => q.AccountId == id)
            .OrderByDescending(q => q.IssueDate)
            .Select(q => new QuoteRefDto(q.Id, q.Number, q.Status, q.Total, q.Currency, q.IssueDate))
            .ToListAsync();

        var audit = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == nameof(Account) && a.EntityId == id)
            .OrderByDescending(a => a.CreatedAt).Take(30).ToListAsync();

        var customFields = await CustomFieldHelper.ValuesAsync(db, EntityTypes.Account, account.CustomDataJson);

        return Ok(new AccountDetailDto(
            account.Id, account.Name, account.Domain, account.Website, account.Industry, account.Employees,
            account.AnnualRevenue, account.Phone, account.Email, account.Street, account.City, account.State,
            account.PostalCode, account.Country, account.Description, account.Status,
            Json.StringList(account.TagsJson).ToArray(), account.OwnerId, account.Owner?.FullName,
            account.Owner?.AvatarUrl, account.CreatedAt, account.UpdatedAt,
            contacts, deals, activities.Select(a => SharedMapper.Activity(a, a.Owner)).ToList(),
            tickets, quotes, customFields, audit.Select(SharedMapper.Audit).ToList()));
    }

    [HttpPost]
    public async Task<ActionResult<AccountListItemDto>> Create(AccountRequest request)
    {
        var name = request.Name.Clean(200);
        if (name.Length == 0) throw new ApiException(400, "Account name is required.");
        await EnsureOwner(request.OwnerId);

        var account = new Account
        {
            OrganizationId = User.GetOrganizationId(),
            Name = name,
            Domain = request.Domain.Clean(200),
            Website = request.Website.Clean(300),
            Industry = request.Industry.Clean(120),
            Employees = request.Employees,
            AnnualRevenue = request.AnnualRevenue,
            Phone = request.Phone.Clean(40),
            Email = request.Email.Clean(254),
            Street = request.Street.Clean(200),
            City = request.City.Clean(120),
            State = request.State.Clean(120),
            PostalCode = request.PostalCode.Clean(30),
            Country = request.Country.Clean(120),
            Description = request.Description.Clean(4000),
            Status = request.Status.Clean(30) is { Length: > 0 } s ? s : "Active",
            OwnerId = request.OwnerId ?? User.GetUserId(),
            TagsJson = Json.Serialize(SanitizeTags(request.Tags)),
            CustomDataJson = await CustomFieldHelper.MergeAsync(db, EntityTypes.Account, request.CustomFields, "{}")
        };

        db.Accounts.Add(account);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = account.Id }, ToListItem(account));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<AccountDetailDto>> Update(Guid id, AccountRequest request)
    {
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Account not found.");
        await EnsureOwner(request.OwnerId);

        var name = request.Name.Clean(200);
        if (name.Length == 0) throw new ApiException(400, "Account name is required.");

        account.Name = name;
        account.Domain = request.Domain.Clean(200);
        account.Website = request.Website.Clean(300);
        account.Industry = request.Industry.Clean(120);
        account.Employees = request.Employees;
        account.AnnualRevenue = request.AnnualRevenue;
        account.Phone = request.Phone.Clean(40);
        account.Email = request.Email.Clean(254);
        account.Street = request.Street.Clean(200);
        account.City = request.City.Clean(120);
        account.State = request.State.Clean(120);
        account.PostalCode = request.PostalCode.Clean(30);
        account.Country = request.Country.Clean(120);
        account.Description = request.Description.Clean(4000);
        account.Status = request.Status.Clean(30) is { Length: > 0 } s ? s : "Active";
        account.OwnerId = request.OwnerId ?? account.OwnerId;
        account.TagsJson = Json.Serialize(SanitizeTags(request.Tags));
        account.CustomDataJson = await CustomFieldHelper.MergeAsync(db, EntityTypes.Account, request.CustomFields, account.CustomDataJson);

        await db.SaveChangesAsync();
        return Ok(await BuildDetail(id));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Account not found.");

        var openDeals = await db.Deals.CountAsync(d => d.AccountId == id && d.Status == DealStatus.Open);
        if (openDeals > 0)
            throw new ApiException(409, "This account has open deals. Close or move them before deleting the account.");

        await db.Contacts.Where(c => c.AccountId == id).ExecuteUpdateAsync(s => s.SetProperty(c => c.AccountId, (Guid?)null));
        await db.Tickets.Where(t => t.AccountId == id).ExecuteUpdateAsync(s => s.SetProperty(t => t.AccountId, (Guid?)null));
        await db.Deals.Where(d => d.AccountId == id).ExecuteUpdateAsync(s => s.SetProperty(d => d.AccountId, (Guid?)null));
        await db.Quotes.Where(q => q.AccountId == id).ExecuteUpdateAsync(s => s.SetProperty(q => q.AccountId, (Guid?)null));

        account.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? search, [FromQuery] Guid? ownerId, [FromQuery] string? status,
        [FromQuery] string? industry, [FromQuery] string? sort, [FromQuery] string? dir)
    {
        var rows = await ApplySort(Filtered(search, ownerId, status, industry), sort, dir)
            .Include(a => a.Owner)
            .Take(10_000)
            .ToListAsync();

        return CsvWriter.Build($"accounts-{DateTime.UtcNow:yyyyMMdd}.csv",
            ["Name", "Domain", "Industry", "Employees", "Annual Revenue", "Phone", "Email", "City", "Country", "Status", "Owner", "Updated"],
            rows.Select(a => new[]
            {
                a.Name, a.Domain, a.Industry, a.Employees?.ToString(), a.AnnualRevenue?.ToString("0.00"),
                a.Phone, a.Email, a.City, a.Country, a.Status, a.Owner?.FullName, a.UpdatedAt.ToString("u")
            }));
    }

    [HttpPost("import")]
    public async Task<ActionResult<ImportResultDto>> Import([FromBody] List<AccountImportRow> rows)
    {
        if (rows == null || rows.Count == 0)
            throw new ApiException(400, "No rows provided for import.");

        var imported = 0;
        var skipped = 0;
        var messages = new List<string>();

        var existingNames = await db.Accounts
            .Select(a => a.Name.ToLower())
            .ToListAsync();
        var existingSet = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);

        var orgId = User.GetOrganizationId();
        var userId = User.GetUserId();

        foreach (var row in rows)
        {
            var name = row.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                skipped++;
                continue;
            }

            if (existingSet.Contains(name))
            {
                skipped++;
                messages.Add($"Skipped '{name}': Account already exists.");
                continue;
            }

            var account = new Account
            {
                OrganizationId = orgId,
                Name = name.Clean(200),
                Domain = row.Domain.Clean(120),
                Industry = row.Industry.Clean(80),
                Phone = row.Phone.Clean(40),
                Email = row.Email.Clean(254),
                City = row.City.Clean(100),
                Country = row.Country.Clean(100),
                Status = string.IsNullOrWhiteSpace(row.Status) ? "Active" : row.Status.Clean(30),
                OwnerId = userId
            };

            db.Accounts.Add(account);
            existingSet.Add(name);
            imported++;
        }

        await db.SaveChangesAsync();
        return Ok(new ImportResultDto(imported, skipped, messages));
    }

    private async Task<AccountDetailDto> BuildDetail(Guid id)
    {
        var result = await Get(id);
        return result.Value ?? (result.Result as ObjectResult)?.Value as AccountDetailDto
            ?? throw new ApiException(404, "Account not found.");
    }

    private static AccountListItemDto ToListItem(Account a) => new(
        a.Id, a.Name, a.Domain, a.Industry, a.Phone, a.City, a.Country, a.Status, 0, 0, 0,
        Json.StringList(a.TagsJson).ToArray(), a.OwnerId, null, null, a.UpdatedAt);

    private async Task EnsureOwner(Guid? ownerId)
    {
        if (ownerId is not null && !await db.Users.AnyAsync(u => u.Id == ownerId))
            throw new ApiException(400, "The selected owner is not part of this workspace.");
    }

    private static string[] SanitizeTags(string[]? tags) =>
        (tags ?? []).Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(10).ToArray();
}
