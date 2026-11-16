using HelixCrm.Api.Common;
using HelixCrm.Api.Features.Autonomous;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HelixCrm.Api.Features.Autonomous;

[ApiController]
[Route("api/v1/duplicates")]
public class DuplicatesController(DuplicateDetectionService duplicates) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<DuplicateCandidateDto>>> List(
        [FromQuery] string? entityType, [FromQuery] string? status,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
        => Ok(await duplicates.ListAsync(entityType, status, page, pageSize));

    [HttpPost("scan")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<DuplicateScanResult>> Scan()
        => Ok(await duplicates.ScanAsync());

    [HttpPost("{id:guid}/merge")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<MergeResult>> Merge(Guid id)
        => Ok(await duplicates.MergeAsync(id));

    [HttpPost("{id:guid}/dismiss")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<object>> Dismiss(Guid id)
    {
        await duplicates.DismissAsync(id);
        return Ok(new { message = "Duplicate suggestion dismissed." });
    }
}
