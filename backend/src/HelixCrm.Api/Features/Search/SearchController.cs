using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Search;

[ApiController]
[Route("api/v1/search")]
public class SearchController(HelixDbContext db) : ControllerBase
{
    public record SearchItem(Guid Id, string Type, string Title, string? Subtitle, string Url);

    [HttpGet]
    public async Task<ActionResult<object>> Search([FromQuery] string? q, [FromQuery] int limit = 5)
    {
        var term = q.Clean(120);
        if (term.Length < 2)
            return Ok(new { query = term, total = 0, groups = Array.Empty<object>() });

        var search = term.ToLower();
        limit = Math.Clamp(limit, 1, 20);

        var accountRows = await db.Accounts.AsNoTracking()
            .Where(a => a.Name.ToLower().Contains(search) || (a.Domain != null && a.Domain.ToLower().Contains(search)))
            .OrderBy(a => a.Name).Take(limit)
            .Select(a => new { a.Id, a.Name, a.Domain, a.Industry })
            .ToListAsync();

        var contactRows = await db.Contacts.AsNoTracking()
            .Where(c => c.FirstName.ToLower().Contains(search) || c.LastName.ToLower().Contains(search)
                || (c.Email != null && c.Email.ToLower().Contains(search)))
            .OrderBy(c => c.FirstName).Take(limit)
            .Select(c => new { c.Id, c.FirstName, c.LastName, c.Email, c.Title })
            .ToListAsync();

        var leadRows = await db.Leads.AsNoTracking()
            .Where(l => l.FirstName.ToLower().Contains(search) || l.LastName.ToLower().Contains(search)
                || (l.Company != null && l.Company.ToLower().Contains(search))
                || (l.Email != null && l.Email.ToLower().Contains(search)))
            .OrderByDescending(l => l.Score).Take(limit)
            .Select(l => new { l.Id, l.FirstName, l.LastName, l.Company, l.Status })
            .ToListAsync();

        var dealRows = await db.Deals.AsNoTracking()
            .Where(d => d.Name.ToLower().Contains(search) || (d.Account != null && d.Account.Name.ToLower().Contains(search)))
            .OrderByDescending(d => d.Amount).Take(limit)
            .Select(d => new { d.Id, d.Name, d.Amount, d.Status, d.Currency })
            .ToListAsync();

        var ticketRows = await db.Tickets.AsNoTracking()
            .Where(t => t.Subject.ToLower().Contains(search) || t.Number.ToLower().Contains(search))
            .OrderByDescending(t => t.CreatedAt).Take(limit)
            .Select(t => new { t.Id, t.Number, t.Subject, t.Status })
            .ToListAsync();

        var groups = new List<object>();
        if (accountRows.Count > 0)
            groups.Add(new
            {
                type = "Account",
                label = "Accounts",
                items = accountRows.Select(a => new SearchItem(a.Id, "Account", a.Name,
                    string.Join(" · ", new[] { a.Industry, a.Domain }.Where(x => !string.IsNullOrWhiteSpace(x))),
                    $"/accounts/{a.Id}")).ToList()
            });
        if (contactRows.Count > 0)
            groups.Add(new
            {
                type = "Contact",
                label = "Contacts",
                items = contactRows.Select(c => new SearchItem(c.Id, "Contact",
                    $"{c.FirstName} {c.LastName}".Trim(), c.Title ?? c.Email, $"/contacts/{c.Id}")).ToList()
            });
        if (leadRows.Count > 0)
            groups.Add(new
            {
                type = "Lead",
                label = "Leads",
                items = leadRows.Select(l => new SearchItem(l.Id, "Lead",
                    $"{l.FirstName} {l.LastName}".Trim(), $"{l.Company} · {l.Status}", $"/leads/{l.Id}")).ToList()
            });
        if (dealRows.Count > 0)
            groups.Add(new
            {
                type = "Deal",
                label = "Deals",
                items = dealRows.Select(d => new SearchItem(d.Id, "Deal", d.Name,
                    $"{d.Currency} {d.Amount:N0} · {d.Status}", $"/deals/{d.Id}")).ToList()
            });
        if (ticketRows.Count > 0)
            groups.Add(new
            {
                type = "Ticket",
                label = "Tickets",
                items = ticketRows.Select(t => new SearchItem(t.Id, "Ticket", t.Subject,
                    $"{t.Number} · {t.Status}", $"/tickets/{t.Id}")).ToList()
            });

        return Ok(new
        {
            query = term,
            total = accountRows.Count + contactRows.Count + leadRows.Count + dealRows.Count + ticketRows.Count,
            groups
        });
    }
}
