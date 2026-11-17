namespace HelixCrm.IntegrationTests;

/// <summary>
/// Runs only when <c>HELIX_TEST_POSTGRES</c> points at a live PostgreSQL instance.
/// Without it the test is reported as skipped rather than silently passing.
/// </summary>
public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("HELIX_TEST_POSTGRES")))
        {
            Skip = "Set HELIX_TEST_POSTGRES to the docker-compose Postgres connection string to run integration tests.";
        }
    }
}
