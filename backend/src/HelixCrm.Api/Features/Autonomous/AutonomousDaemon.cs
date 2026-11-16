using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Autonomous;

/// <summary>
/// Continuous background daemon (outbox-style hosted service) that runs the
/// autonomous workers outside the HTTP request path. Each organisation gets its
/// own scope and ambient tenant override so row-level isolation still holds.
/// </summary>
public class AutonomousDaemon(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AutonomousDaemon> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Autonomous:DaemonEnabled", true))
        {
            logger.LogInformation("Autonomous daemon is disabled by configuration.");
            return;
        }

        // Let migrations and seeding finish before the first pass.
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        var slaInterval = TimeSpan.FromMinutes(Math.Max(1, configuration.GetValue("Autonomous:SlaIntervalMinutes", 5)));
        var hygieneInterval = TimeSpan.FromMinutes(Math.Max(1, configuration.GetValue("Autonomous:HygieneIntervalMinutes", 60)));
        var duplicateInterval = TimeSpan.FromMinutes(Math.Max(5, configuration.GetValue("Autonomous:DuplicateIntervalMinutes", 360)));

        var now = DateTime.UtcNow;
        var nextSla = now;
        var nextHygiene = now.AddSeconds(20);
        var nextDuplicates = now.AddSeconds(40);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var current = DateTime.UtcNow;

                if (current >= nextSla)
                {
                    await RunForAllOrganizationsAsync(async (monitor, organization) =>
                    {
                        await monitor.RunSlaEscalationAsync(organization);
                    }, stoppingToken);
                    nextSla = current.Add(slaInterval);
                }

                if (current >= nextHygiene)
                {
                    await RunForAllOrganizationsAsync(async (monitor, organization) =>
                    {
                        await monitor.RunDealStagnationAsync(organization);
                        await monitor.RunLeadRoutingAsync(organization);
                        await monitor.RunFreshnessAsync(organization);
                    }, stoppingToken);
                    nextHygiene = current.Add(hygieneInterval);
                }

                if (current >= nextDuplicates)
                {
                    await RunForAllOrganizationsAsync(async (_, _) => { }, stoppingToken,
                        async (services, _) => await services.GetRequiredService<DuplicateDetectionService>().ScanAsync());
                    nextDuplicates = current.Add(duplicateInterval);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Autonomous daemon tick failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunForAllOrganizationsAsync(
        Func<AutonomousMonitor, Organization, Task> monitorAction,
        CancellationToken stoppingToken,
        Func<IServiceProvider, Organization, Task>? serviceAction = null)
    {
        List<Organization> organizations;
        using (var discoveryScope = scopeFactory.CreateScope())
        {
            var discoveryDb = discoveryScope.ServiceProvider.GetRequiredService<HelixDbContext>();
            organizations = await discoveryDb.Organizations.AsNoTracking()
                .Where(o => o.AutonomousEnabled)
                .ToListAsync(stoppingToken);
        }

        foreach (var organization in organizations)
        {
            if (stoppingToken.IsCancellationRequested) break;
            try
            {
                using var scope = scopeFactory.CreateScope();
                scope.ServiceProvider.GetRequiredService<TenantContext>().OrganizationId = organization.Id;
                if (serviceAction is not null)
                {
                    await serviceAction(scope.ServiceProvider, organization);
                }
                else
                {
                    var monitor = scope.ServiceProvider.GetRequiredService<AutonomousMonitor>();
                    await monitorAction(monitor, organization);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Autonomous worker failed for organisation {OrganizationId}.", organization.Id);
            }
        }
    }
}
