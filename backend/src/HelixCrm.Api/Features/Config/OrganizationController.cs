using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Config;

[ApiController]
[Route("api/v1/organization")]
public class OrganizationController(HelixDbContext db) : ControllerBase
{
    public record OrganizationRequest(string? Name, string? Currency, string? TimeZone, string? LogoUrl);

    [HttpGet]
    public async Task<ActionResult<OrganizationDto>> Get()
    {
        var organization = await db.Organizations.FindAsync(User.GetOrganizationId())
            ?? throw new ApiException(404, "Workspace not found.");
        return Ok(DtoMapper.Organization(organization));
    }

    [HttpPut]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<OrganizationDto>> Update(OrganizationRequest request)
    {
        var organization = await db.Organizations.FindAsync(User.GetOrganizationId())
            ?? throw new ApiException(404, "Workspace not found.");

        var name = request.Name.Clean(160);
        if (name.Length == 0) throw new ApiException(400, "Workspace name is required.");

        organization.Name = name;
        organization.Currency = request.Currency.Clean(8) is { Length: > 0 } c ? c : organization.Currency;
        organization.TimeZone = request.TimeZone.Clean(60) is { Length: > 0 } tz ? tz : organization.TimeZone;
        organization.LogoUrl = request.LogoUrl.Clean(300);
        await db.SaveChangesAsync();

        return Ok(DtoMapper.Organization(organization));
    }
}
