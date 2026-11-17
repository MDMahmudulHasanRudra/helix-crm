using HelixCrm.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Email;

/// <summary>Polls IMAP mailboxes on a fixed interval, per organisation scope.</summary>
public class InboundEmailDaemon(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<InboundEmailDaemon> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Email:InboundEnabled", true))
        {
            logger.LogInformation("Inbound email polling is disabled by configuration.");
            return;
        }

        var interval = TimeSpan.FromMinutes(Math.Max(1, configuration.GetValue("Email:InboundIntervalMinutes", 2)));
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

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
                        var service = scope.ServiceProvider.GetRequiredService<InboundEmailService>();
                        await service.PollAsync(stoppingToken);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        logger.LogError(ex, "Inbound polling failed for organisation {OrganizationId}.", organizationId);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Inbound email tick failed.");
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
