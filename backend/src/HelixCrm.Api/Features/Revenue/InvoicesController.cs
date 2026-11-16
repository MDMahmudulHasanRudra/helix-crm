using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Revenue;

[ApiController]
[Route("api/v1/invoices")]
public class InvoicesController(HelixDbContext db, ITenantProvider tenant) : ControllerBase
{
    public record InvoiceLineRequest(Guid? ProductId, string? Description, decimal? Quantity, decimal? UnitPrice, decimal? DiscountPercent);

    public record PaymentRequest(decimal Amount, DateTime? PaymentDate, string? PaymentMethod, string? Reference, string? Notes);

    public record StatusRequest(string? Status);

    public record InvoiceRequest(
        Guid? AccountId, Guid? DealId, Guid? QuoteId, Guid? ContactId, string? Status, DateTime? IssueDate,
        DateTime? DueDate, string? Currency, decimal? DiscountPercent, decimal? TaxPercent,
        string? Notes, string? PaymentTerms, Guid? OwnerId, List<InvoiceLineRequest>? Lines);

    public record InvoiceLineDto(Guid Id, Guid? ProductId, string? ProductName, string Description,
        decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal LineTotal);

    public record InvoicePaymentDto(Guid Id, decimal Amount, DateTime PaymentDate, string PaymentMethod, string? Reference, string? Notes, DateTime CreatedAt);

    public record InvoiceListDto(Guid Id, string Number, string Status, decimal Total, decimal AmountPaid, decimal BalanceDue, string Currency,
        Guid? AccountId, string? AccountName, Guid? DealId, string? DealName, DateTime IssueDate,
        DateTime? DueDate, Guid? OwnerId, string? OwnerName, DateTime UpdatedAt);

    public record InvoiceDetailDto(Guid Id, string Number, string Status, Guid? AccountId, string? AccountName,
        Guid? DealId, string? DealName, Guid? QuoteId, string? QuoteNumber, Guid? ContactId, string? ContactName,
        DateTime IssueDate, DateTime? DueDate, string Currency, decimal DiscountPercent, decimal TaxPercent,
        decimal Subtotal, decimal TaxTotal, decimal Total, decimal AmountPaid, decimal BalanceDue,
        string? Notes, string? PaymentTerms, Guid? OwnerId, string? OwnerName, string? OwnerAvatarUrl,
        DateTime CreatedAt, DateTime UpdatedAt, List<InvoiceLineDto> Lines, List<InvoicePaymentDto> Payments, List<AuditDto> Audit);

    public record InvoiceSummaryDto(decimal TotalInvoiced, decimal TotalPaid, decimal BalanceDue, int OverdueCount, int InvoiceCount);

    private IQueryable<Invoice> Filtered(string? search, string? status, Guid? accountId, Guid? dealId)
    {
        var query = db.Invoices.AsNoTracking().AsQueryable();
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

    [HttpGet("summary")]
    public async Task<ActionResult<InvoiceSummaryDto>> GetSummary()
    {
        var now = DateTime.UtcNow;
        var invoices = await db.Invoices.AsNoTracking().ToListAsync();

        var totalInvoiced = invoices.Sum(i => i.Total);
        var totalPaid = invoices.Sum(i => i.AmountPaid);
        var balanceDue = invoices.Sum(i => i.BalanceDue);
        var overdueCount = invoices.Count(i => i.Status != InvoiceStatus.Paid && i.Status != InvoiceStatus.Cancelled && i.DueDate.HasValue && i.DueDate.Value < now);

        return Ok(new InvoiceSummaryDto(totalInvoiced, totalPaid, balanceDue, overdueCount, invoices.Count));
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<InvoiceListDto>>> List(
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
            "number" => desc ? query.OrderByDescending(x => x.Number) : query.OrderBy(x => x.Number),
            "total" => desc ? query.OrderByDescending(x => x.Total) : query.OrderBy(x => x.Total),
            "issueDate" => desc ? query.OrderByDescending(x => x.IssueDate) : query.OrderBy(x => x.IssueDate),
            "dueDate" => desc ? query.OrderByDescending(x => x.DueDate) : query.OrderBy(x => x.DueDate),
            _ => desc ? query.OrderByDescending(x => x.UpdatedAt) : query.OrderBy(x => x.UpdatedAt)
        };

        var items = await query.Page(page, pageSize)
            .Select(x => new InvoiceListDto(
                x.Id,
                x.Number,
                x.Status,
                x.Total,
                x.AmountPaid,
                x.BalanceDue,
                x.Currency,
                x.AccountId,
                x.Account != null ? x.Account.Name : null,
                x.DealId,
                x.Deal != null ? x.Deal.Name : null,
                x.IssueDate,
                x.DueDate,
                x.OwnerId,
                x.Owner != null ? x.Owner.FullName : null,
                x.UpdatedAt))
            .ToListAsync();

        return Ok(new PagedResult<InvoiceListDto>(items, total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<InvoiceDetailDto>> Get(Guid id)
    {
        var inv = await db.Invoices.AsNoTracking()
            .Include(x => x.Account)
            .Include(x => x.Deal)
            .Include(x => x.Quote)
            .Include(x => x.Contact)
            .Include(x => x.Owner)
            .Include(x => x.Lines).ThenInclude(l => l.Product)
            .Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new ApiException(404, "Invoice not found.");

        var audits = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == nameof(Invoice) && a.EntityId == id)
            .OrderByDescending(a => a.CreatedAt)
            .Take(50)
            .Select(a => new AuditDto(a.Id, a.Action, a.EntityType, a.EntityId, a.ActorName ?? "System", a.ChangesJson, a.CreatedAt))
            .ToListAsync();

        var lines = inv.Lines.OrderBy(l => l.CreatedAt).Select(l => new InvoiceLineDto(
            l.Id, l.ProductId, l.Product?.Name, l.Description, l.Quantity, l.UnitPrice, l.DiscountPercent, l.LineTotal)).ToList();

        var payments = inv.Payments.OrderByDescending(p => p.PaymentDate).Select(p => new InvoicePaymentDto(
            p.Id, p.Amount, p.PaymentDate, p.PaymentMethod, p.Reference, p.Notes, p.CreatedAt)).ToList();

        return Ok(new InvoiceDetailDto(
            inv.Id, inv.Number, inv.Status, inv.AccountId, inv.Account?.Name,
            inv.DealId, inv.Deal?.Name, inv.QuoteId, inv.Quote?.Number, inv.ContactId, inv.Contact?.FullName,
            inv.IssueDate, inv.DueDate, inv.Currency, inv.DiscountPercent, inv.TaxPercent,
            inv.Subtotal, inv.TaxTotal, inv.Total, inv.AmountPaid, inv.BalanceDue,
            inv.Notes, inv.PaymentTerms, inv.OwnerId, inv.Owner?.FullName, inv.Owner?.AvatarUrl,
            inv.CreatedAt, inv.UpdatedAt, lines, payments, audits));
    }

    [HttpPost]
    public async Task<ActionResult<InvoiceDetailDto>> Create(InvoiceRequest request)
    {
        var (accountId, contactId) = await ResolveLinks(request);
        await ValidateRelations(request);

        var count = await db.Invoices.CountAsync() + 1;
        var number = $"INV-{DateTime.UtcNow:yyyy}-{count:D4}";

        var invoice = new Invoice
        {
            OrganizationId = tenant.OrganizationId,
            Number = number,
            AccountId = accountId,
            DealId = request.DealId,
            QuoteId = request.QuoteId,
            ContactId = contactId,
            Status = InvoiceStatus.All.Contains(request.Status) ? request.Status! : InvoiceStatus.Draft,
            IssueDate = request.IssueDate ?? DateTime.UtcNow,
            DueDate = request.DueDate ?? DateTime.UtcNow.AddDays(30),
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim(),
            DiscountPercent = Math.Clamp(request.DiscountPercent ?? 0, 0, 100),
            TaxPercent = Math.Clamp(request.TaxPercent ?? 0, 0, 100),
            Notes = request.Notes.Clean(2000),
            PaymentTerms = request.PaymentTerms.Clean(50) ?? "Net 30",
            OwnerId = request.OwnerId ?? tenant.UserId
        };

        AddLines(invoice, request.Lines);
        Recalculate(invoice);

        db.Invoices.Add(invoice);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = invoice.Id }, await BuildDetail(invoice.Id));
    }

    [HttpPost("from-quote/{quoteId:guid}")]
    public async Task<ActionResult<InvoiceDetailDto>> FromQuote(Guid quoteId)
    {
        var quote = await db.Quotes.Include(q => q.Lines)
            .FirstOrDefaultAsync(q => q.Id == quoteId)
            ?? throw new ApiException(404, "Quote not found.");

        var count = await db.Invoices.CountAsync() + 1;
        var number = $"INV-{DateTime.UtcNow:yyyy}-{count:D4}";

        var invoice = new Invoice
        {
            OrganizationId = tenant.OrganizationId,
            Number = number,
            AccountId = quote.AccountId,
            DealId = quote.DealId,
            QuoteId = quote.Id,
            ContactId = quote.ContactId,
            Status = InvoiceStatus.Draft,
            IssueDate = DateTime.UtcNow,
            DueDate = DateTime.UtcNow.AddDays(30),
            Currency = quote.Currency,
            DiscountPercent = quote.DiscountPercent,
            TaxPercent = quote.TaxPercent,
            Subtotal = quote.Subtotal,
            TaxTotal = quote.TaxTotal,
            Total = quote.Total,
            AmountPaid = 0,
            BalanceDue = quote.Total,
            Notes = quote.Notes,
            PaymentTerms = "Net 30",
            OwnerId = quote.OwnerId ?? tenant.UserId
        };

        foreach (var ql in quote.Lines)
        {
            invoice.Lines.Add(new InvoiceLine
            {
                OrganizationId = tenant.OrganizationId,
                ProductId = ql.ProductId,
                Description = ql.Description,
                Quantity = ql.Quantity,
                UnitPrice = ql.UnitPrice,
                DiscountPercent = ql.DiscountPercent,
                LineTotal = ql.LineTotal
            });
        }

        db.Invoices.Add(invoice);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = invoice.Id }, await BuildDetail(invoice.Id));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<InvoiceDetailDto>> Update(Guid id, InvoiceRequest request)
    {
        var invoice = await db.Invoices.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new ApiException(404, "Invoice not found.");

        var (accountId, contactId) = await ResolveLinks(request);
        await ValidateRelations(request);

        invoice.AccountId = accountId;
        invoice.DealId = request.DealId;
        invoice.QuoteId = request.QuoteId;
        invoice.ContactId = contactId;
        if (InvoiceStatus.All.Contains(request.Status)) invoice.Status = request.Status!;
        if (request.IssueDate.HasValue) invoice.IssueDate = request.IssueDate.Value;
        if (request.DueDate.HasValue) invoice.DueDate = request.DueDate.Value;
        if (!string.IsNullOrWhiteSpace(request.Currency)) invoice.Currency = request.Currency.Trim();
        invoice.DiscountPercent = Math.Clamp(request.DiscountPercent ?? 0, 0, 100);
        invoice.TaxPercent = Math.Clamp(request.TaxPercent ?? 0, 0, 100);
        invoice.Notes = request.Notes.Clean(2000);
        if (!string.IsNullOrWhiteSpace(request.PaymentTerms)) invoice.PaymentTerms = request.PaymentTerms.Clean(50);
        if (request.OwnerId.HasValue) invoice.OwnerId = request.OwnerId;

        if (request.Lines is not null)
        {
            db.InvoiceLines.RemoveRange(invoice.Lines);
            invoice.Lines.Clear();
            AddLines(invoice, request.Lines);
        }

        Recalculate(invoice);
        await db.SaveChangesAsync();

        return Ok(await BuildDetail(id));
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<InvoiceDetailDto>> SetStatus(Guid id, [FromBody] StatusRequest request)
    {
        var status = request.Status?.Trim();
        if (!InvoiceStatus.All.Contains(status))
            throw new ApiException(400, "Unknown invoice status.");

        var invoice = await db.Invoices.FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new ApiException(404, "Invoice not found.");

        invoice.Status = status!;
        await db.SaveChangesAsync();
        return Ok(await BuildDetail(id));
    }

    [HttpPost("{id:guid}/payments")]
    public async Task<ActionResult<InvoiceDetailDto>> RecordPayment(Guid id, PaymentRequest request)
    {
        if (request.Amount <= 0)
            throw new ApiException(400, "Payment amount must be greater than zero.");

        var invoice = await db.Invoices.Include(x => x.Payments).FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new ApiException(404, "Invoice not found.");

        var payment = new InvoicePayment
        {
            OrganizationId = tenant.OrganizationId,
            InvoiceId = invoice.Id,
            Amount = Math.Round(request.Amount, 2),
            PaymentDate = request.PaymentDate ?? DateTime.UtcNow,
            PaymentMethod = string.IsNullOrWhiteSpace(request.PaymentMethod) ? "Bank Transfer" : request.PaymentMethod.Trim(),
            Reference = request.Reference.Clean(100),
            Notes = request.Notes.Clean(500)
        };

        db.InvoicePayments.Add(payment);
        invoice.Payments.Add(payment);

        invoice.AmountPaid = Math.Round(invoice.Payments.Sum(p => p.Amount), 2);
        invoice.BalanceDue = Math.Max(0, invoice.Total - invoice.AmountPaid);

        if (invoice.BalanceDue <= 0)
        {
            invoice.Status = InvoiceStatus.Paid;
        }
        else if (invoice.AmountPaid > 0)
        {
            invoice.Status = InvoiceStatus.PartiallyPaid;
        }

        await db.SaveChangesAsync();
        return Ok(await BuildDetail(id));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var invoice = await db.Invoices.FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new ApiException(404, "Invoice not found.");
        invoice.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? search, [FromQuery] string? status, [FromQuery] Guid? accountId, [FromQuery] Guid? dealId)
    {
        var rows = await Filtered(search, status, accountId, dealId)
            .Include(i => i.Account).Include(i => i.Deal).Include(i => i.Owner)
            .OrderByDescending(i => i.IssueDate).Take(10_000).ToListAsync();

        return CsvWriter.Build($"invoices-{DateTime.UtcNow:yyyyMMdd}.csv",
            ["Number", "Account", "Deal", "Status", "Issue Date", "Due Date", "Subtotal", "Tax", "Total", "Paid", "Balance Due", "Currency", "Owner"],
            rows.Select(i => new[]
            {
                i.Number, i.Account?.Name, i.Deal?.Name, i.Status, i.IssueDate.ToString("yyyy-MM-dd"),
                i.DueDate?.ToString("yyyy-MM-dd"), i.Subtotal.ToString("0.00"), i.TaxTotal.ToString("0.00"),
                i.Total.ToString("0.00"), i.AmountPaid.ToString("0.00"), i.BalanceDue.ToString("0.00"),
                i.Currency, i.Owner?.FullName
            }));
    }

    private static void AddLines(Invoice invoice, List<InvoiceLineRequest>? lines)
    {
        foreach (var line in lines ?? [])
        {
            var quantity = Math.Max(0, line.Quantity ?? 1);
            var unitPrice = Math.Max(0, line.UnitPrice ?? 0);
            var discount = Math.Clamp(line.DiscountPercent ?? 0, 0, 100);
            invoice.Lines.Add(new InvoiceLine
            {
                OrganizationId = invoice.OrganizationId,
                ProductId = line.ProductId,
                Description = line.Description.Clean(300),
                Quantity = quantity,
                UnitPrice = unitPrice,
                DiscountPercent = discount,
                LineTotal = Math.Round(quantity * unitPrice * (1 - discount / 100m), 2)
            });
        }
    }

    private static void Recalculate(Invoice invoice)
    {
        invoice.Subtotal = Math.Round(invoice.Lines.Sum(l => l.LineTotal), 2);
        var afterDiscount = invoice.Subtotal * (1 - invoice.DiscountPercent / 100m);
        invoice.TaxTotal = Math.Round(afterDiscount * invoice.TaxPercent / 100m, 2);
        invoice.Total = Math.Round(afterDiscount + invoice.TaxTotal, 2);
        invoice.BalanceDue = Math.Max(0, invoice.Total - invoice.AmountPaid);
    }

    private async Task<(Guid? AccountId, Guid? ContactId)> ResolveLinks(InvoiceRequest request)
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

    private async Task ValidateRelations(InvoiceRequest request)
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

    private async Task<InvoiceDetailDto> BuildDetail(Guid id)
    {
        var result = await Get(id);
        return result.Value ?? (result.Result as ObjectResult)?.Value as InvoiceDetailDto
            ?? throw new ApiException(404, "Invoice not found.");
    }
}
