using System.Security.Claims;
using HelixCrm.Api.Common;
using HelixCrm.Api.Domain;

namespace HelixCrm.Api.Data;

public interface ITenantProvider
{
    Guid OrganizationId { get; }
    Guid? UserId { get; }
    string? UserName { get; }
    string? Role { get; }
}

public class HttpTenantProvider(IHttpContextAccessor accessor, TenantContext overrideContext) : ITenantProvider
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    // Background workers set an ambient override; HTTP requests never do.
    private bool HasOverride => overrideContext.OrganizationId is not null;

    public Guid OrganizationId => HasOverride
        ? overrideContext.OrganizationId!.Value
        : Principal?.GetOrganizationId() ?? Guid.Empty;

    public Guid? UserId
    {
        get
        {
            if (HasOverride) return overrideContext.UserId;
            var id = Principal?.GetUserId() ?? Guid.Empty;
            return id == Guid.Empty ? null : id;
        }
    }

    public string? UserName => HasOverride ? overrideContext.UserName : Principal?.GetDisplayName();

    public string? Role => HasOverride ? overrideContext.Role : Principal?.GetRole();
}
