using HelixCrm.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Email;

/// <summary>Runs the outbox for every organisation outside the HTTP request path.</summary>
public class EmailDispatcher(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<EmailDispatcher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Email:DispatcherEnabled", true))
        {
            logger.LogInformation("Email dispatcher is disabled by configuration.");
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Max(5, configuration.GetValue("Email:DispatchIntervalSeconds", 15)));
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                List<Guid> organizations;
                using (var discovery = scopeFactory.CreateScope())
                {
                    var db = discovery.ServiceProvider.GetRequiredService<HelixDbContext>();
                    organizations = await db.Organizations.AsNoTracking()
                        .Select(o => o.Id)
                        .ToListAsync(stoppingToken);
                }

                foreach (var organizationId in organizations)
                {
                    if (stoppingToken.IsCancellationRequested) break;
                    try
                    {
                        using var scope = scopeFactory.CreateScope();
                        scope.ServiceProvider.GetRequiredService<TenantContext>().OrganizationId = organizationId;
                        var service = scope.ServiceProvider.GetRequiredService<EmailDispatchService>();
                        await service.DispatchAsync(stoppingToken);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        logger.LogError(ex, "Email dispatch failed for organisation {OrganizationId}.", organizationId);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Email dispatcher tick failed.");
            }

            try
            {
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
