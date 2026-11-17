using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.IntegrationTests;

[Collection("postgres")]
public class TenancyIntegrationTests(HelixApiFixture fixture)
{
    [PostgresFact]
    public async Task OrganizationLookup_ResolvesTheSignedInTenant_NotTheFirstRow()
    {
        var firstOrganization = await fixture.GetSeededOrganizationAsync();
        var secondOrganization = new Organization
        {
            Name = "Second Workspace",
            Slug = $"second-{Guid.NewGuid():N}"
        };

        await using (var db = fixture.CreateDbContext(secondOrganization.Id))
        {
            db.Organizations.Add(secondOrganization);
            db.Accounts.Add(new Account
            {
                OrganizationId = secondOrganization.Id,
                Name = "Second Workspace Account",
                Status = "Active"
            });
            await db.SaveChangesAsync();
        }

        // The first organization was seeded earlier, so the old
        // `Organizations.FirstAsync()` implementation returned it regardless of tenant.
        await using (var db = fixture.CreateDbContext(secondOrganization.Id))
        {
            var resolved = await db.GetCurrentOrganizationAsync();

            Assert.Equal(secondOrganization.Id, resolved.Id);
            Assert.NotEqual(firstOrganization.Id, resolved.Id);
            Assert.True(await db.Accounts.AnyAsync(a => a.Name == "Second Workspace Account"));
            Assert.False(await db.Accounts.AnyAsync(a => a.OrganizationId == firstOrganization.Id));
        }
    }

    [PostgresFact]
    public async Task AccountApi_DoesNotLeakRowsFromAnotherWorkspace()
    {
        var secret = $"Secret Account {Guid.NewGuid():N}";
        var otherOrganization = new Organization
        {
            Name = "Isolated Workspace",
            Slug = $"isolated-{Guid.NewGuid():N}"
        };

        await using (var db = fixture.CreateDbContext(otherOrganization.Id))
        {
            db.Organizations.Add(otherOrganization);
            db.Accounts.Add(new Account
            {
                OrganizationId = otherOrganization.Id,
                Name = secret,
                Status = "Active"
            });
            await db.SaveChangesAsync();
        }

        var client = await fixture.LoginAsAdminAsync();
        var response = await client.GetAsync("/api/v1/accounts?pageSize=200");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync();

        Assert.DoesNotContain(secret, body);
        Assert.Contains("\"total\"", body);
    }
}
