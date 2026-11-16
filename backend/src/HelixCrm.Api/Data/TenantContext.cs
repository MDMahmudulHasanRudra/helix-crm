using HelixCrm.Api.Domain;

namespace HelixCrm.Api.Data;

/// <summary>
/// Ambient tenant override for work that runs outside an HTTP request (background
/// daemons). Request scopes leave every override null, so normal isolation is
/// unchanged. A background scope sets these fields before resolving the
/// <see cref="HelixDbContext"/> so global query filters still apply to one org.
/// </summary>
public class TenantContext
{
    public Guid? OrganizationId { get; set; }
    public Guid? UserId { get; set; }
    public string? UserName { get; set; }
    public string? Role { get; set; }

    public static TenantContext ForAutonomousWorker(Guid organizationId) => new()
    {
        OrganizationId = organizationId,
        UserName = "Autonomous Engine",
        Role = Roles.Admin
    };
}
