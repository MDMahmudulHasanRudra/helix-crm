using System.Net.Http.Json;
using System.Text.Json;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.IntegrationTests;

[Collection("postgres")]
public class LeadConversionIntegrationTests(HelixApiFixture fixture)
{
    [PostgresFact]
    public async Task Convert_CreatesAccountContactAndDeal_InsideTheTenant()
    {
        var organization = await fixture.GetSeededOrganizationAsync();
        var client = await fixture.LoginAsAdminAsync();

        var email = $"grace-{Guid.NewGuid():N}@example.test";
        var createResponse = await client.PostAsJsonAsync("/api/v1/leads", new
        {
            firstName = "Grace",
            lastName = "Hopper",
            company = "Naval Systems Integration",
            email,
            phone = "+1 555 0100",
            source = "Website",
            estimatedValue = 12_500
        });
        createResponse.EnsureSuccessStatusCode();

        using var created = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var leadId = created.RootElement.GetProperty("id").GetGuid();

        var convertResponse = await client.PostAsJsonAsync($"/api/v1/leads/{leadId}/convert", new { });
        convertResponse.EnsureSuccessStatusCode();

        using var converted = JsonDocument.Parse(await convertResponse.Content.ReadAsStringAsync());
        var accountId = converted.RootElement.GetProperty("accountId").GetGuid();
        var contactId = converted.RootElement.GetProperty("contactId").GetGuid();
        var dealId = converted.RootElement.GetProperty("dealId").GetGuid();

        Assert.NotEqual(Guid.Empty, accountId);
        Assert.NotEqual(Guid.Empty, contactId);
        Assert.NotEqual(Guid.Empty, dealId);

        await using var db = fixture.CreateDbContext(organization.Id);
        var lead = await db.Leads.SingleAsync(l => l.Id == leadId);
        Assert.Equal(LeadStatus.Converted, lead.Status);
        Assert.Equal(accountId, lead.ConvertedAccountId);
        Assert.Equal(contactId, lead.ConvertedContactId);
        Assert.Equal(dealId, lead.ConvertedDealId);

        Assert.Equal(organization.Id, (await db.Accounts.SingleAsync(a => a.Id == accountId)).OrganizationId);
        Assert.Equal(organization.Id, (await db.Contacts.SingleAsync(c => c.Id == contactId)).OrganizationId);
        Assert.Equal(organization.Id, (await db.Deals.SingleAsync(d => d.Id == dealId)).OrganizationId);

        var activity = await db.Activities.SingleAsync(a =>
            a.RelatedType == EntityTypes.Account && a.RelatedId == accountId && a.Subject == "Lead converted");
        Assert.Equal(organization.Id, activity.OrganizationId);
    }

    [PostgresFact]
    public async Task Convert_RejectsLeadsFromAnotherWorkspace()
    {
        var otherOrganization = new Organization
        {
            Name = "Other Workspace",
            Slug = $"other-{Guid.NewGuid():N}"
        };
        Guid foreignLeadId;

        await using (var db = fixture.CreateDbContext(otherOrganization.Id))
        {
            db.Organizations.Add(otherOrganization);
            var lead = new Lead
            {
                OrganizationId = otherOrganization.Id,
                FirstName = "Foreign",
                LastName = "Lead",
                Company = "Elsewhere",
                Status = LeadStatus.New
            };
            db.Leads.Add(lead);
            await db.SaveChangesAsync();
            foreignLeadId = lead.Id;
        }

        var client = await fixture.LoginAsAdminAsync();
        var response = await client.PostAsJsonAsync($"/api/v1/leads/{foreignLeadId}/convert", new { });

        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);

        await using var verify = fixture.CreateDbContext(otherOrganization.Id);
        Assert.Equal(LeadStatus.New, (await verify.Leads.SingleAsync(l => l.Id == foreignLeadId)).Status);
    }
}
