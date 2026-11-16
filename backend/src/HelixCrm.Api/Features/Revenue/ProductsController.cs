using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Revenue;

[ApiController]
[Route("api/v1/products")]
public class ProductsController(HelixDbContext db) : ControllerBase
{
    public record ProductDto(Guid Id, string Name, string? Sku, string? Description, decimal UnitPrice,
        string Currency, decimal TaxRate, string? Category, bool IsActive);

    public record ProductRequest(string? Name, string? Sku, string? Description, decimal? UnitPrice,
        string? Currency, decimal? TaxRate, string? Category, bool? IsActive);

    [HttpGet]
    public async Task<ActionResult<List<ProductDto>>> List([FromQuery] string? search, [FromQuery] bool? active)
    {
        var query = db.Products.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(p => p.Name.ToLower().Contains(q)
                || (p.Sku != null && p.Sku.ToLower().Contains(q))
                || (p.Category != null && p.Category.ToLower().Contains(q)));
        }
        if (active is not null) query = query.Where(p => p.IsActive == active);
        var products = await query.OrderBy(p => p.Name).ToListAsync();
        return Ok(products.Select(ToDto).ToList());
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<ProductDto>> Create(ProductRequest request)
    {
        var name = request.Name.Clean(200);
        if (name.Length == 0) throw new ApiException(400, "Product name is required.");
        if (request.UnitPrice is < 0) throw new ApiException(400, "Unit price cannot be negative.");

        var product = new Product
        {
            OrganizationId = User.GetOrganizationId(),
            Name = name,
            Sku = request.Sku.Clean(60),
            Description = request.Description.Clean(2000),
            UnitPrice = request.UnitPrice ?? 0,
            Currency = request.Currency.Clean(8) is { Length: > 0 } c ? c : "USD",
            TaxRate = Math.Clamp(request.TaxRate ?? 0, 0, 100),
            Category = request.Category.Clean(120),
            IsActive = request.IsActive ?? true
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return Ok(ToDto(product));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<ProductDto>> Update(Guid id, ProductRequest request)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id)
            ?? throw new ApiException(404, "Product not found.");
        var name = request.Name.Clean(200);
        if (name.Length == 0) throw new ApiException(400, "Product name is required.");
        if (request.UnitPrice is < 0) throw new ApiException(400, "Unit price cannot be negative.");

        product.Name = name;
        product.Sku = request.Sku.Clean(60);
        product.Description = request.Description.Clean(2000);
        product.UnitPrice = request.UnitPrice ?? product.UnitPrice;
        product.Currency = request.Currency.Clean(8) is { Length: > 0 } c ? c : product.Currency;
        product.TaxRate = Math.Clamp(request.TaxRate ?? product.TaxRate, 0, 100);
        product.Category = request.Category.Clean(120);
        product.IsActive = request.IsActive ?? product.IsActive;
        await db.SaveChangesAsync();
        return Ok(ToDto(product));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id)
            ?? throw new ApiException(404, "Product not found.");
        product.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static ProductDto ToDto(Product p) => new(
        p.Id, p.Name, p.Sku, p.Description, p.UnitPrice, p.Currency, p.TaxRate, p.Category, p.IsActive);
}
