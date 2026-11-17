using HelixCrm.Api.Domain;
using HelixCrm.Api.Features.Autonomous;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.IntegrationTests;

[Collection("postgres")]
public class DuplicateMergeIntegrationTests(HelixApiFixture fixture)
{
    [PostgresFact]
    public async Task Merge_RelinksContactsAndDeals_AndSoftDeletesTheDuplicate()
    {
        var organization = await fixture.GetSeededOrganizationAsync();
        Guid primaryId;
        Guid duplicateId;
        Guid contactId;
        Guid dealId;

        await using (var db = fixture.CreateDbContext(organization.Id))
        {
            var pipeline = await db.Pipelines.Include(p => p.Stages)
                .FirstAsync(p => p.IsDefault);
            var stage = pipeline.Stages.OrderBy(s => s.SortOrder).First();

            var primary = new Account
            {
                OrganizationId = organization.Id,
                Name = "Contoso Holdings",
                Domain = $"contoso-{Guid.NewGuid():N}.test",
                Status = "Active",
                CreatedAt = DateTime.UtcNow.AddMinutes(-10),
                UpdatedAt = DateTime.UtcNow.AddMinutes(-10)
            };
            var duplicate = new Account
            {
                OrganizationId = organization.Id,
                Name = "Contoso Holdings Incorporated",
                Domain = primary.Domain,
                Status = "Active",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.Accounts.AddRange(primary, duplicate);

            var contact = new Contact
            {
                OrganizationId = organization.Id,
                FirstName = "Ada",
                LastName = "Lovelace",
                Email = $"ada-{Guid.NewGuid():N}@contoso.test",
                AccountId = duplicate.Id
            };
            db.Contacts.Add(contact);

            var deal = new Deal
            {
                OrganizationId = organization.Id,
                Name = "Contoso renewal",
                AccountId = duplicate.Id,
                Amount = 5_000m,
                PipelineId = pipeline.Id,
                StageId = stage.Id,
                Probability = stage.Probability,
                Status = DealStatus.Open
            };
            db.Deals.Add(deal);

            await db.SaveChangesAsync();

            primaryId = primary.Id;
            duplicateId = duplicate.Id;
            contactId = contact.Id;
            dealId = deal.Id;
        }

        await using (var db = fixture.CreateDbContext(organization.Id))
        {
            var tenant = new FixedTenant(organization.Id);
            var service = new DuplicateDetectionService(db, tenant);

            var scan = await service.ScanAsync();
            Assert.True(scan.CandidatesCreated > 0);

            var candidate = await db.DuplicateCandidates.SingleAsync(c =>
                c.EntityType == EntityTypes.Account &&
                ((c.PrimaryId == primaryId && c.DuplicateId == duplicateId) ||
                 (c.PrimaryId == duplicateId && c.DuplicateId == primaryId)));

            var result = await service.MergeAsync(candidate.Id);

            Assert.Equal(primaryId, result.PrimaryId);
            Assert.True(result.RelinkedRecords >= 2);
        }

        await using (var db = fixture.CreateDbContext(organization.Id))
        {
            Assert.False(await db.Accounts.AnyAsync(a => a.Id == duplicateId));
            Assert.Equal(primaryId, (await db.Contacts.SingleAsync(c => c.Id == contactId)).AccountId);
            Assert.Equal(primaryId, (await db.Deals.SingleAsync(d => d.Id == dealId)).AccountId);
            Assert.Equal(DuplicateStatus.Merged,
                (await db.DuplicateCandidates.SingleAsync(c => c.DuplicateId == duplicateId)).Status);

            var deleted = await db.Accounts.IgnoreQueryFilters().SingleAsync(a => a.Id == duplicateId);
            Assert.True(deleted.IsDeleted);
        }
    }

    private sealed class FixedTenant(Guid organizationId) : HelixCrm.Api.Data.ITenantProvider
    {
        public Guid OrganizationId { get; } = organizationId;
        public Guid? UserId => null;
        public string? UserName => "Integration Test";
        public string? Role => Roles.Admin;
    }
}
