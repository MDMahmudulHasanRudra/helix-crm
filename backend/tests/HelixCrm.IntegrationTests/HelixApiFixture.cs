using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Net.Http.Json;

namespace HelixCrm.IntegrationTests;

/// <summary>
/// Spins the API up against the PostgreSQL container from <c>docker-compose.yml</c>.
/// Point <c>HELIX_TEST_POSTGRES</c> at it to enable the suite; otherwise every test
/// returns immediately so a machine without a database engine still gets a green build.
/// </summary>
public sealed class HelixApiFixture : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string AdminEmail = "avery@helixcrm.dev";
    private const string AdminPassword = "Admin@123";

    private readonly string? _databaseName;
    private HttpClient? _client;

    public HelixApiFixture()
    {
        var baseConnection = Environment.GetEnvironmentVariable("HELIX_TEST_POSTGRES");
        if (string.IsNullOrWhiteSpace(baseConnection)) return;

        var builder = new NpgsqlConnectionStringBuilder(baseConnection);
        _databaseName = $"helix_it_{Guid.NewGuid():N}";
        builder.Database = _databaseName;
        ConnectionString = builder.ConnectionString;

        // Program reads configuration before the test server rewrites it, so the
        // environment is the one place these values are guaranteed to be visible.
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", ConnectionString);
        Environment.SetEnvironmentVariable("Autonomous__DaemonEnabled", "false");
        Environment.SetEnvironmentVariable("Email__DispatcherEnabled", "false");
        Environment.SetEnvironmentVariable("Email__InboundEnabled", "false");
        Environment.SetEnvironmentVariable("Cookie__Secure", "false");
    }

    public bool Enabled => ConnectionString is not null;

    public string? ConnectionString { get; }

    public HttpClient Client => _client ??= CreateClient();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
    }

    public Task InitializeAsync()
    {
        if (Enabled) _ = Client;
        return Task.CompletedTask;
    }

    public async Task<Organization> GetSeededOrganizationAsync()
    {
        await using var db = CreateDbContext(Guid.Empty);
        return await db.Organizations.SingleAsync(o => o.Slug == "northstar-labs");
    }

    public HelixDbContext CreateDbContext(Guid organizationId)
    {
        if (!Enabled) throw new InvalidOperationException("HELIX_TEST_POSTGRES is not configured.");

        return new HelixDbContext(
            new DbContextOptionsBuilder<HelixDbContext>().UseNpgsql(ConnectionString).Options,
            new FixedTenant(organizationId));
    }

    public async Task<HttpClient> LoginAsAdminAsync()
    {
        var response = await Client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = AdminEmail,
            password = AdminPassword
        });
        response.EnsureSuccessStatusCode();
        return Client;
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        _client?.Dispose();
        await base.DisposeAsync();
        await DropDatabaseAsync();
    }

    private async Task DropDatabaseAsync()
    {
        if (!Enabled || _databaseName is null) return;

        var builder = new NpgsqlConnectionStringBuilder(ConnectionString) { Database = "postgres" };
        await using var connection = new NpgsqlConnection(builder.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)", connection);
        await command.ExecuteNonQueryAsync();
    }

    private sealed class FixedTenant(Guid organizationId) : ITenantProvider
    {
        public Guid OrganizationId { get; } = organizationId;
        public Guid? UserId => null;
        public string? UserName => "Integration Test";
        public string? Role => Roles.Admin;
    }
}

[CollectionDefinition("postgres")]
public class PostgresCollection : ICollectionFixture<HelixApiFixture>;
