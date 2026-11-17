using System.Text;
using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using HelixCrm.Api.Features.Config;
using HelixCrm.Api.Features.Email;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Revenue;

[ApiController]
[Route("api/v1/quotes")]
public class QuotesController(HelixDbContext db, IAutomationEngine automation, EmailOutbox outbox) : ControllerBase
{
    public record QuoteLineRequest(Guid? ProductId, string? Description, decimal? Quantity, decimal? UnitPrice, decimal? DiscountPercent);

    public record QuoteRequest(
        Guid? AccountId, Guid? DealId, Guid? ContactId, string? Status, DateTime? IssueDate,
        DateTime? ExpiryDate, string? Currency, decimal? DiscountPercent, decimal? TaxPercent,
        string? Notes, Guid? OwnerId, List<QuoteLineRequest>? Lines);

    public record SendQuoteRequest(string? To, string? Message);

    public record QuoteLineDto(Guid Id, Guid? ProductId, string? ProductName, string Description,
        decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal LineTotal);

    public record QuoteListDto(Guid Id, string Number, string Status, decimal Total, string Currency,
        Guid? AccountId, string? AccountName, Guid? DealId, string? DealName, DateTime IssueDate,
        DateTime? ExpiryDate, Guid? OwnerId, string? OwnerName, DateTime UpdatedAt);

    public record QuoteDetailDto(Guid Id, string Number, string Status, Guid? AccountId, string? AccountName,
        Guid? DealId, string? DealName, Guid? ContactId, string? ContactName, DateTime IssueDate,
        DateTime? ExpiryDate, string Currency, decimal DiscountPercent, decimal TaxPercent, decimal Subtotal,
        decimal TaxTotal, decimal Total, string? Notes, Guid? OwnerId, string? OwnerName,
        string? OwnerAvatarUrl, DateTime CreatedAt, DateTime UpdatedAt, List<QuoteLineDto> Lines,
        List<AuditDto> Audit);

    private IQueryable<Quote> Filtered(string? search, string? status, Guid? accountId, Guid? dealId)
    {
        var query = db.Quotes.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(x => x.Number.ToLower().Contains(q)
                || (x.Account != null && x.Account.Name.ToLower().Contains(q))
                || (x.Notes != null && x.Notes.ToLower().Contains(q)));
        }
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.Status == status);
        if (accountId is not null) query = query.Where(x => x.AccountId == accountId);
        if (dealId is not null) query = query.Where(x => x.DealId == dealId);
        return query;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<QuoteListDto>>> List(
        [FromQuery] string? search, [FromQuery] string? status, [FromQuery] Guid? accountId,
        [FromQuery] Guid? dealId, [FromQuery] string? sort, [FromQuery] string? dir,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = Filtered(search, status, accountId, dealId);
        var total = await query.CountAsync();

        var desc = !string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
        query = sort switch
        {
            "number" => desc ? query.OrderByDescending(q => q.Number) : query.OrderBy(q => q.Number),
            "total" => desc ? query.OrderByDescending(q => q.Total) : query.OrderBy(q => q.Total),
            "issueDate" => desc ? query.OrderByDescending(q => q.IssueDate) : query.OrderBy(q => q.IssueDate),
            _ => desc ? query.OrderByDescending(q => q.UpdatedAt) : query.OrderBy(q => q.UpdatedAt)
        };

        var rows = await query.Page(page, pageSize)
            .Select(q => new QuoteListDto(q.Id, q.Number, q.Status, q.Total, q.Currency, q.AccountId,
                q.Account != null ? q.Account.Name : null, q.DealId, q.Deal != null ? q.Deal.Name : null,
                q.IssueDate, q.ExpiryDate, q.OwnerId,
                q.Owner != null ? q.Owner.FullName : null, q.UpdatedAt))
            .ToListAsync();

        return Ok(new PagedResult<QuoteListDto>(rows, total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<QuoteDetailDto>> Get(Guid id)
    {
        var quote = await db.Quotes.AsNoTracking()
            .Include(q => q.Account).Include(q => q.Deal).Include(q => q.Contact).Include(q => q.Owner)
            .Include(q => q.Lines).ThenInclude(l => l.Product)
            .FirstOrDefaultAsync(q => q.Id == id)
            ?? throw new ApiException(404, "Quote not found.");

        var audit = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == nameof(Quote) && a.EntityId == id)
            .OrderByDescending(a => a.CreatedAt).Take(30).ToListAsync();

        var lines = quote.Lines.OrderBy(l => l.CreatedAt).Select(l => new QuoteLineDto(
            l.Id, l.ProductId, l.Product?.Name, l.Description, l.Quantity, l.UnitPrice,
            l.DiscountPercent, l.LineTotal)).ToList();

        return Ok(new QuoteDetailDto(quote.Id, quote.Number, quote.Status, quote.AccountId,
            quote.Account?.Name, quote.DealId, quote.Deal?.Name, quote.ContactId, quote.Contact?.FullName,
            quote.IssueDate, quote.ExpiryDate, quote.Currency, quote.DiscountPercent, quote.TaxPercent,
            quote.Subtotal, quote.TaxTotal, quote.Total, quote.Notes, quote.OwnerId, quote.Owner?.FullName,
            quote.Owner?.AvatarUrl, quote.CreatedAt, quote.UpdatedAt, lines, audit.Select(SharedMapper.Audit).ToList()));
    }

    [HttpPost("{id:guid}/send")]
    public async Task<ActionResult> Send(Guid id, SendQuoteRequest request)
    {
        var quote = await db.Quotes
            .Include(q => q.Account).Include(q => q.Contact)
            .Include(q => q.Lines).ThenInclude(l => l.Product)
            .FirstOrDefaultAsync(q => q.Id == id)
            ?? throw new ApiException(404, "Quote not found.");

        var organization = await db.GetCurrentOrganizationAsync();
        var to = EmailAddresses.Normalize(request.To)
            ?? EmailAddresses.Normalize(quote.Contact?.Email)
            ?? EmailAddresses.Normalize(quote.Account?.Email);
        if (to is null)
            throw new ApiException(400, "Add a contact email or supply a recipient before sending.");

        var message = await outbox.EnqueueAsync(new NewEmail(
            to,
            quote.Contact?.FullName ?? quote.Account?.Name,
            $"Quote {quote.Number} from {organization.Name}",
            BuildQuoteEmail(quote, organization.Name, request.Message),
            RelatedType: "Quote", RelatedId: quote.Id, ContactId: quote.ContactId),
            HttpContext.RequestAborted);

        if (quote.Status == QuoteStatus.Draft) quote.Status = QuoteStatus.Sent;
        await db.SaveChangesAsync();

        return Accepted(new { id = message.Id, status = message.Status, messageId = message.MessageId });
    }

    private static string BuildQuoteEmail(Quote quote, string organizationName, string? message)
    {
        var body = new StringBuilder();
        var firstName = quote.Contact?.FirstName;
        body.AppendLine(string.IsNullOrWhiteSpace(firstName) ? "Hello," : $"Hi {firstName},");
        body.AppendLine();
        if (!string.IsNullOrWhiteSpace(message))
        {
            body.AppendLine(message.Trim());
            body.AppendLine();
        }

        body.AppendLine($"Quote {quote.Number} from {organizationName}");
        var validity = quote.ExpiryDate is null ? "" : $" · valid until {quote.ExpiryDate:yyyy-MM-dd}";
        body.AppendLine($"Issued {quote.IssueDate:yyyy-MM-dd}{validity}");
        body.AppendLine();

        foreach (var line in quote.Lines.OrderBy(l => l.CreatedAt))
            body.AppendLine($"- {line.Description}  x{line.Quantity:0.##}  {Money(line.LineTotal, quote.Currency)}");

        body.AppendLine();
        body.AppendLine($"Subtotal: {Money(quote.Subtotal, quote.Currency)}");
        if (quote.DiscountPercent > 0) body.AppendLine($"Discount: {quote.DiscountPercent:0.##}%");
        if (quote.TaxPercent > 0) body.AppendLine($"Tax: {quote.TaxPercent:0.##}% ({Money(quote.TaxTotal, quote.Currency)})");
        body.AppendLine($"Total: {Money(quote.Total, quote.Currency)}");
        body.AppendLine();

        if (!string.IsNullOrWhiteSpace(quote.Notes))
        {
            body.AppendLine(quote.Notes.Trim());
            body.AppendLine();
        }
        body.AppendLine("Reply to this email if you have any questions.");

        return body.ToString();
    }

    private static string Money(decimal value, string currency) => $"{currency} {value:N2}";

    [HttpPost]
    public async Task<ActionResult<QuoteDetailDto>> Create(QuoteRequest request)
    {
        await ValidateRelations(request);
        var organizationId = User.GetOrganizationId();
        var count = await db.Quotes.IgnoreQueryFilters().CountAsync(q => q.OrganizationId == organizationId);
        var (resolvedAccount, resolvedContact) = await ResolveLinks(request);

        var quote = new Quote
        {
            OrganizationId = organizationId,
            Number = $"Q-{1001 + count}",
            AccountId = resolvedAccount,
            DealId = request.DealId,
            ContactId = resolvedContact,
            Status = QuoteStatus.All.Contains(request.Status) ? request.Status! : QuoteStatus.Draft,
            IssueDate = request.IssueDate ?? DateTime.UtcNow,
            ExpiryDate = request.ExpiryDate,
            Currency = request.Currency.Clean(8) is { Length: > 0 } c ? c : "USD",
            DiscountPercent = Math.Clamp(request.DiscountPercent ?? 0, 0, 100),
            TaxPercent = Math.Clamp(request.TaxPercent ?? 0, 0, 100),
            Notes = request.Notes.Clean(4000),
            OwnerId = request.OwnerId ?? User.GetUserId()
        };

        AddLines(quote, request.Lines);
        Recalculate(quote);
        db.Quotes.Add(quote);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = quote.Id }, await BuildDetail(quote.Id));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<QuoteDetailDto>> Update(Guid id, QuoteRequest request)
    {
        var quote = await db.Quotes.Include(q => q.Lines).FirstOrDefaultAsync(q => q.Id == id)
            ?? throw new ApiException(404, "Quote not found.");
        await ValidateRelations(request);
        var (resolvedAccount, resolvedContact) = await ResolveLinks(request);

        quote.AccountId = resolvedAccount;
        quote.DealId = request.DealId;
        quote.ContactId = resolvedContact;
        if (QuoteStatus.All.Contains(request.Status)) quote.Status = request.Status!;
        quote.IssueDate = request.IssueDate ?? quote.IssueDate;
        quote.ExpiryDate = request.ExpiryDate;
        quote.Currency = request.Currency.Clean(8) is { Length: > 0 } c ? c : quote.Currency;
        quote.DiscountPercent = Math.Clamp(request.DiscountPercent ?? quote.DiscountPercent, 0, 100);
        quote.TaxPercent = Math.Clamp(request.TaxPercent ?? quote.TaxPercent, 0, 100);
        quote.Notes = request.Notes.Clean(4000);
        quote.OwnerId = request.OwnerId ?? quote.OwnerId;

        db.QuoteLines.RemoveRange(quote.Lines);
        quote.Lines.Clear();
        AddLines(quote, request.Lines);
        Recalculate(quote);

        await db.SaveChangesAsync();
        return Ok(await BuildDetail(id));
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<QuoteListDto>> SetStatus(Guid id, [FromBody] Dictionary<string, string?> body)
    {
        var quote = await db.Quotes.FirstOrDefaultAsync(q => q.Id == id)
            ?? throw new ApiException(404, "Quote not found.");
        var status = body.GetValueOrDefault("status")?.Clean(20);
        if (!QuoteStatus.All.Contains(status)) throw new ApiException(400, "Unknown quote status.");
        quote.Status = status!;
        await db.SaveChangesAsync();

        if (status == QuoteStatus.Accepted)
        {
            await automation.TriggerAsync(AutomationEvents.QuoteAccepted, "Quote", quote.Id, $"Quote {quote.Number}", quote.OwnerId);
        }

        var row = await db.Quotes.AsNoTracking().Where(q => q.Id == id)
            .Select(q => new QuoteListDto(q.Id, q.Number, q.Status, q.Total, q.Currency, q.AccountId,
                q.Account != null ? q.Account.Name : null, q.DealId, q.Deal != null ? q.Deal.Name : null,
                q.IssueDate, q.ExpiryDate, q.OwnerId, q.Owner != null ? q.Owner.FullName : null, q.UpdatedAt))
            .FirstAsync();
        return Ok(row);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var quote = await db.Quotes.FirstOrDefaultAsync(q => q.Id == id)
            ?? throw new ApiException(404, "Quote not found.");
        quote.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? search, [FromQuery] string? status, [FromQuery] Guid? accountId, [FromQuery] Guid? dealId)
    {
        var rows = await Filtered(search, status, accountId, dealId)
            .Include(q => q.Account).Include(q => q.Deal).Include(q => q.Owner)
            .OrderByDescending(q => q.IssueDate).Take(10_000).ToListAsync();

        return CsvWriter.Build($"quotes-{DateTime.UtcNow:yyyyMMdd}.csv",
            ["Number", "Account", "Deal", "Status", "Issue Date", "Expiry", "Subtotal", "Tax", "Total", "Currency", "Owner"],
            rows.Select(q => new[]
            {
                q.Number, q.Account?.Name, q.Deal?.Name, q.Status, q.IssueDate.ToString("yyyy-MM-dd"),
                q.ExpiryDate?.ToString("yyyy-MM-dd"), q.Subtotal.ToString("0.00"), q.TaxTotal.ToString("0.00"),
                q.Total.ToString("0.00"), q.Currency, q.Owner?.FullName
            }));
    }

    private static void AddLines(Quote quote, List<QuoteLineRequest>? lines)
    {
        foreach (var line in lines ?? [])
        {
            var quantity = Math.Max(0, line.Quantity ?? 1);
            var unitPrice = Math.Max(0, line.UnitPrice ?? 0);
            var discount = Math.Clamp(line.DiscountPercent ?? 0, 0, 100);
            quote.Lines.Add(new QuoteLine
            {
                OrganizationId = quote.OrganizationId,
                ProductId = line.ProductId,
                Description = line.Description.Clean(300),
                Quantity = quantity,
                UnitPrice = unitPrice,
                DiscountPercent = discount,
                LineTotal = Math.Round(quantity * unitPrice * (1 - discount / 100m), 2)
            });
        }
    }

    private static void Recalculate(Quote quote)
    {
        quote.Subtotal = Math.Round(quote.Lines.Sum(l => l.LineTotal), 2);
        var afterDiscount = quote.Subtotal * (1 - quote.DiscountPercent / 100m);
        quote.TaxTotal = Math.Round(afterDiscount * quote.TaxPercent / 100m, 2);
        quote.Total = Math.Round(afterDiscount + quote.TaxTotal, 2);
    }

    private async Task<(Guid? AccountId, Guid? ContactId)> ResolveLinks(QuoteRequest request)
    {
        var accountId = request.AccountId;
        var contactId = request.ContactId;

        if (request.DealId is not null)
        {
            var deal = await db.Deals.AsNoTracking().FirstOrDefaultAsync(d => d.Id == request.DealId)
                ?? throw new ApiException(400, "The selected deal does not exist.");
            accountId ??= deal.AccountId;
            contactId ??= deal.PrimaryContactId;
        }
        if (contactId is not null && accountId is null)
        {
            accountId = await db.Contacts.Where(c => c.Id == contactId).Select(c => c.AccountId).FirstOrDefaultAsync();
        }
        return (accountId, contactId);
    }

    private async Task ValidateRelations(QuoteRequest request)
    {
        if (request.AccountId is not null && !await db.Accounts.AnyAsync(a => a.Id == request.AccountId))
            throw new ApiException(400, "The selected account does not exist.");
        if (request.DealId is not null && !await db.Deals.AnyAsync(d => d.Id == request.DealId))
            throw new ApiException(400, "The selected deal does not exist.");
        if (request.ContactId is not null && !await db.Contacts.AnyAsync(c => c.Id == request.ContactId))
            throw new ApiException(400, "The selected contact does not exist.");
        if (request.OwnerId is not null && !await db.Users.AnyAsync(u => u.Id == request.OwnerId))
            throw new ApiException(400, "The selected owner is not part of this workspace.");
        await Task.CompletedTask;
    }

    private async Task<QuoteDetailDto> BuildDetail(Guid id)
    {
        var result = await Get(id);
        return result.Value ?? (result.Result as ObjectResult)?.Value as QuoteDetailDto
            ?? throw new ApiException(404, "Quote not found.");
    }
}
