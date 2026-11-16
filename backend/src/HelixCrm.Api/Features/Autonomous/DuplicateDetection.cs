using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Autonomous;

public record DuplicateCandidateDto(
    Guid Id,
    string EntityType,
    Guid PrimaryId,
    string PrimaryName,
    Guid DuplicateId,
    string DuplicateName,
    double Similarity,
    string Status,
    string Reason,
    DateTime CreatedAt);

public record DuplicateScanResult(int AccountsScanned, int ContactsScanned, int CandidatesCreated, int PairsCreated);

public record MergeResult(Guid PrimaryId, string PrimaryName, int RelinkedRecords, string Message);

/// <summary>
/// Self-healing data hygiene worker. Finds likely duplicates with normalised,
/// fuzzy matching and performs survivorship merges that relink every dependent
/// record instead of deleting history.
/// </summary>
public class DuplicateDetectionService(HelixDbContext db, ITenantProvider tenant)
{
    private const double AutoFlagThreshold = 0.92;
    private const double DomainAssistThreshold = 0.85;
    private const int MaxScanRecords = 5_000;

    public async Task<DuplicateScanResult> ScanAsync()
    {
        var organizationId = tenant.OrganizationId;
        var existing = await db.DuplicateCandidates
            .Where(c => c.Status == DuplicateStatus.Pending)
            .Select(c => new { c.EntityType, c.PrimaryId, c.DuplicateId })
            .ToListAsync();
        var seen = new HashSet<string>(existing.Select(x => PairKey(x.EntityType, x.PrimaryId, x.DuplicateId)));

        var accounts = await db.Accounts.OrderBy(a => a.CreatedAt).Take(MaxScanRecords).ToListAsync();
        var contacts = await db.Contacts.OrderBy(c => c.CreatedAt).Take(MaxScanRecords).ToListAsync();

        var created = 0;
        var pairs = 0;

        // ---- Accounts: domain match or fuzzy legal-name match ----
        // Compare only within cheap blocking buckets (same short name prefix or
        // same domain) so a large book of business does not turn into an O(n²)
        // similarity sweep on a request thread.
        var buckets = new Dictionary<string, List<Account>>(StringComparer.Ordinal);
        void Bucket(string key, Account account)
        {
            if (!buckets.TryGetValue(key, out var list)) buckets[key] = list = [];
            list.Add(account);
        }
        foreach (var account in accounts)
        {
            var name = Similarity.NormalizeCompany(account.Name);
            Bucket("n:" + (name.Length <= 3 ? name : name[..3]), account);
            var domain = NormalizeDomain(account.Domain);
            if (domain.Length > 0) Bucket("d:" + domain, account);
        }

        var compared = new HashSet<string>(StringComparer.Ordinal);
        foreach (var bucket in buckets.Values)
        {
            for (var i = 0; i < bucket.Count; i++)
            {
                for (var j = i + 1; j < bucket.Count; j++)
                {
                    var a = bucket[i];
                    var b = bucket[j];
                    if (!compared.Add(PairKey(EntityTypes.Account, a.Id, b.Id))) continue;

                    var nameScore = Similarity.CompanySimilarity(a.Name, b.Name);
                    var sameDomain = !string.IsNullOrWhiteSpace(a.Domain)
                        && string.Equals(NormalizeDomain(a.Domain), NormalizeDomain(b.Domain), StringComparison.OrdinalIgnoreCase)
                        && !string.Equals(NormalizeDomain(a.Domain), "", StringComparison.Ordinal);

                    string? reason = null;
                    var score = nameScore;
                    if (sameDomain)
                    {
                        reason = "Identical company domain";
                        score = Math.Max(score, 0.97);
                    }
                    else if (nameScore >= AutoFlagThreshold)
                    {
                        reason = "Similar company name";
                    }
                    else if (nameScore >= DomainAssistThreshold && SameLocation(a, b))
                    {
                        reason = "Similar name in the same location";
                    }

                    if (reason is null || score < DomainAssistThreshold) continue;
                    if (!seen.Add(PairKey(EntityTypes.Account, a.Id, b.Id))) continue;

                    AddCandidate(EntityTypes.Account, a, b, a.CreatedAt, score, reason, organizationId);
                    a.IsDuplicateCandidate = true;
                    b.IsDuplicateCandidate = true;
                    created++;
                    pairs++;
                }
            }
        }

        // ---- Contacts: exact email, exact phone, or name + account ----
        var emailGroups = contacts
            .Where(c => !string.IsNullOrWhiteSpace(c.Email))
            .GroupBy(c => Similarity.NormalizeEmail(c.Email))
            .Where(g => g.Count() > 1);
        var phoneGroups = contacts
            .Where(c => Similarity.NormalizePhoneDigits(c.Phone).Length == 10)
            .GroupBy(c => Similarity.NormalizePhoneDigits(c.Phone))
            .Where(g => g.Count() > 1);
        var accountNameGroups = contacts
            .Where(c => c.AccountId is not null && !string.IsNullOrWhiteSpace(c.LastName))
            .GroupBy(c => $"{c.AccountId}|{Similarity.Normalize(c.LastName)}")
            .Where(g => g.Count() > 1);

        foreach (var group in emailGroups)
        {
            created += CreateContactPairs(group.ToList(), 1.0, "Identical email address", seen, organizationId, ref pairs);
        }
        foreach (var group in phoneGroups)
        {
            created += CreateContactPairs(group.ToList(), 0.98, "Identical phone number", seen, organizationId, ref pairs);
        }
        foreach (var group in accountNameGroups)
        {
            var list = group.ToList();
            for (var i = 0; i < list.Count; i++)
            {
                for (var j = i + 1; j < list.Count; j++)
                {
                    var a = list[i];
                    var b = list[j];
                    var firstScore = Similarity.JaroWinkler(Similarity.Normalize(a.FirstName), Similarity.Normalize(b.FirstName));
                    if (firstScore < 0.85) continue;
                    if (!seen.Add(PairKey(EntityTypes.Contact, a.Id, b.Id))) continue;
                    AddCandidate(EntityTypes.Contact, a, b, a.CreatedAt, 0.9 + firstScore * 0.05,
                        "Same last name and account", organizationId);
                    a.IsDuplicateCandidate = true;
                    b.IsDuplicateCandidate = true;
                    created++;
                    pairs++;
                }
            }
        }

        if (created > 0) await db.SaveChangesAsync();
        return new DuplicateScanResult(accounts.Count, contacts.Count, created, pairs);
    }

    public async Task<PagedResult<DuplicateCandidateDto>> ListAsync(
        string? entityType, string? status, int page, int pageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = db.DuplicateCandidates.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(c => c.EntityType == entityType);
        var effectiveStatus = string.IsNullOrWhiteSpace(status) ? DuplicateStatus.Pending : status;
        query = query.Where(c => c.Status == effectiveStatus);

        var total = await query.CountAsync();
        var rows = await query.OrderByDescending(c => c.Similarity).ThenByDescending(c => c.CreatedAt)
            .Page(page, pageSize).ToListAsync();

        var accountNames = await db.Accounts.AsNoTracking()
            .Select(a => new { a.Id, a.Name }).ToDictionaryAsync(a => a.Id, a => a.Name);
        var contactNames = await db.Contacts.AsNoTracking()
            .Select(c => new { c.Id, c.FirstName, c.LastName })
            .ToDictionaryAsync(c => c.Id, c => $"{c.FirstName} {c.LastName}".Trim());

        string NameFor(string type, Guid id) => type == EntityTypes.Account
            ? accountNames.GetValueOrDefault(id, "Deleted account")
            : contactNames.GetValueOrDefault(id, "Deleted contact");

        var items = rows.Select(c => new DuplicateCandidateDto(
            c.Id, c.EntityType, c.PrimaryId, NameFor(c.EntityType, c.PrimaryId),
            c.DuplicateId, NameFor(c.EntityType, c.DuplicateId),
            Math.Round(c.Similarity, 3), c.Status, c.Reason, c.CreatedAt)).ToList();

        return new PagedResult<DuplicateCandidateDto>(items, total, page, pageSize);
    }

    public async Task<MergeResult> MergeAsync(Guid candidateId)
    {
        var candidate = await db.DuplicateCandidates.FirstOrDefaultAsync(c => c.Id == candidateId)
            ?? throw new ApiException(404, "Duplicate candidate not found.");
        if (candidate.Status != DuplicateStatus.Pending)
            throw new ApiException(409, "This candidate has already been reviewed.");

        return candidate.EntityType switch
        {
            EntityTypes.Account => await MergeAccountsAsync(candidate),
            EntityTypes.Contact => await MergeContactsAsync(candidate),
            _ => throw new ApiException(400, "Unsupported entity type for merge.")
        };
    }

    public async Task DismissAsync(Guid candidateId)
    {
        var candidate = await db.DuplicateCandidates.FirstOrDefaultAsync(c => c.Id == candidateId)
            ?? throw new ApiException(404, "Duplicate candidate not found.");
        if (candidate.Status != DuplicateStatus.Pending)
            throw new ApiException(409, "This candidate has already been reviewed.");

        candidate.Status = DuplicateStatus.Dismissed;
        await ClearDuplicateFlagsAsync(candidate);
        await db.SaveChangesAsync();
    }

    private async Task<MergeResult> MergeAccountsAsync(DuplicateCandidate candidate)
    {
        var primary = await db.Accounts.FirstOrDefaultAsync(a => a.Id == candidate.PrimaryId)
            ?? throw new ApiException(404, "The surviving account no longer exists.");
        var duplicate = await db.Accounts.FirstOrDefaultAsync(a => a.Id == candidate.DuplicateId)
            ?? throw new ApiException(404, "The duplicate account no longer exists.");

        var relinked = 0;
        foreach (var contact in await db.Contacts.Where(c => c.AccountId == duplicate.Id).ToListAsync())
        {
            contact.AccountId = primary.Id;
            relinked++;
        }
        foreach (var deal in await db.Deals.Where(d => d.AccountId == duplicate.Id).ToListAsync())
        {
            deal.AccountId = primary.Id;
            relinked++;
        }
        foreach (var ticket in await db.Tickets.Where(t => t.AccountId == duplicate.Id).ToListAsync())
        {
            ticket.AccountId = primary.Id;
            relinked++;
        }
        foreach (var quote in await db.Quotes.Where(q => q.AccountId == duplicate.Id).ToListAsync())
        {
            quote.AccountId = primary.Id;
            relinked++;
        }
        foreach (var invoice in await db.Invoices.Where(i => i.AccountId == duplicate.Id).ToListAsync())
        {
            invoice.AccountId = primary.Id;
            relinked++;
        }
        foreach (var lead in await db.Leads.Where(l => l.ConvertedAccountId == duplicate.Id).ToListAsync())
        {
            lead.ConvertedAccountId = primary.Id;
            relinked++;
        }
        foreach (var activity in await db.Activities
            .Where(a => a.RelatedType == EntityTypes.Account && a.RelatedId == duplicate.Id).ToListAsync())
        {
            activity.RelatedId = primary.Id;
            relinked++;
        }

        Fill(primary, duplicate);
        primary.TagsJson = Json.Serialize(Json.StringList(primary.TagsJson)
            .Concat(Json.StringList(duplicate.TagsJson))
            .Distinct(StringComparer.OrdinalIgnoreCase));
        primary.CustomDataJson = MergeMaps(primary.CustomDataJson, duplicate.CustomDataJson);
        primary.EnrichmentDataJson = MergeMaps(primary.EnrichmentDataJson, duplicate.EnrichmentDataJson);
        primary.DataFreshnessScore = Math.Max(primary.DataFreshnessScore, duplicate.DataFreshnessScore);
        primary.IsDuplicateCandidate = false;

        duplicate.IsDeleted = true;
        candidate.Status = DuplicateStatus.Merged;
        await MergeOtherCandidatesAsync(candidate.EntityType, duplicate.Id);

        db.Activities.Add(new Activity
        {
            OrganizationId = primary.OrganizationId,
            Type = ActivityType.Note,
            Subject = "Duplicate account merged",
            Body = $"“{duplicate.Name}” was merged into this account by the autonomous hygiene worker. {relinked} related records were relinked.",
            Status = ActivityStatus.Completed,
            RelatedType = EntityTypes.Account,
            RelatedId = primary.Id
        });

        await db.SaveChangesAsync();
        return new MergeResult(primary.Id, primary.Name, relinked,
            $"Merged “{duplicate.Name}” into “{primary.Name}” and relinked {relinked} records.");
    }

    private async Task<MergeResult> MergeContactsAsync(DuplicateCandidate candidate)
    {
        var primary = await db.Contacts.FirstOrDefaultAsync(c => c.Id == candidate.PrimaryId)
            ?? throw new ApiException(404, "The surviving contact no longer exists.");
        var duplicate = await db.Contacts.FirstOrDefaultAsync(c => c.Id == candidate.DuplicateId)
            ?? throw new ApiException(404, "The duplicate contact no longer exists.");

        var relinked = 0;
        foreach (var deal in await db.Deals.Where(d => d.PrimaryContactId == duplicate.Id).ToListAsync())
        {
            deal.PrimaryContactId = primary.Id;
            relinked++;
        }
        foreach (var ticket in await db.Tickets.Where(t => t.ContactId == duplicate.Id).ToListAsync())
        {
            ticket.ContactId = primary.Id;
            relinked++;
        }
        foreach (var quote in await db.Quotes.Where(q => q.ContactId == duplicate.Id).ToListAsync())
        {
            quote.ContactId = primary.Id;
            relinked++;
        }
        foreach (var invoice in await db.Invoices.Where(i => i.ContactId == duplicate.Id).ToListAsync())
        {
            invoice.ContactId = primary.Id;
            relinked++;
        }
        foreach (var lead in await db.Leads.Where(l => l.ConvertedContactId == duplicate.Id).ToListAsync())
        {
            lead.ConvertedContactId = primary.Id;
            relinked++;
        }

        Fill(primary, duplicate);
        if (string.IsNullOrWhiteSpace(primary.Notes) && !string.IsNullOrWhiteSpace(duplicate.Notes))
            primary.Notes = duplicate.Notes;
        else if (!string.IsNullOrWhiteSpace(duplicate.Notes)
            && primary.Notes?.Contains(duplicate.Notes, StringComparison.Ordinal) == false)
            primary.Notes = $"{primary.Notes}\n\n{duplicate.Notes}".Trim();

        primary.IsPrimary |= duplicate.IsPrimary;
        primary.TagsJson = Json.Serialize(Json.StringList(primary.TagsJson)
            .Concat(Json.StringList(duplicate.TagsJson))
            .Distinct(StringComparer.OrdinalIgnoreCase));
        primary.CustomDataJson = MergeMaps(primary.CustomDataJson, duplicate.CustomDataJson);
        primary.DataFreshnessScore = Math.Max(primary.DataFreshnessScore, duplicate.DataFreshnessScore);
        primary.IsStale = primary.IsStale && duplicate.IsStale;
        primary.IsDuplicateCandidate = false;

        // Move the conversation stream so the survivor keeps full history.
        foreach (var activity in await db.Activities
            .Where(a => a.RelatedType == EntityTypes.Contact && a.RelatedId == duplicate.Id).ToListAsync())
        {
            activity.RelatedId = primary.Id;
        }

        duplicate.IsDeleted = true;
        candidate.Status = DuplicateStatus.Merged;
        await MergeOtherCandidatesAsync(candidate.EntityType, duplicate.Id);

        db.Activities.Add(new Activity
        {
            OrganizationId = primary.OrganizationId,
            Type = ActivityType.Note,
            Subject = "Duplicate contact merged",
            Body = $"“{duplicate.FullName}” was merged into this contact by the autonomous hygiene worker.",
            Status = ActivityStatus.Completed,
            RelatedType = EntityTypes.Contact,
            RelatedId = primary.Id
        });

        await db.SaveChangesAsync();
        return new MergeResult(primary.Id, primary.FullName, relinked,
            $"Merged “{duplicate.FullName}” into “{primary.FullName}” and relinked {relinked} records.");
    }

    private async Task MergeOtherCandidatesAsync(string entityType, Guid duplicateId)
    {
        var others = await db.DuplicateCandidates
            .Where(c => c.Status == DuplicateStatus.Pending
                && c.EntityType == entityType
                && (c.PrimaryId == duplicateId || c.DuplicateId == duplicateId))
            .ToListAsync();
        foreach (var other in others) other.Status = DuplicateStatus.Merged;

        // Survivors on the other side of those pairs may now have no open
        // suggestions, so their review flag should drop.
        var resurrected = others
            .Select(c => c.PrimaryId == duplicateId ? c.DuplicateId : c.PrimaryId)
            .Where(id => id != duplicateId)
            .Distinct()
            .ToList();
        var handledIds = others.Select(c => c.Id).ToHashSet();
        foreach (var id in resurrected)
        {
            var stillPending = await db.DuplicateCandidates.AnyAsync(c =>
                c.Status == DuplicateStatus.Pending
                && !handledIds.Contains(c.Id)
                && c.EntityType == entityType
                && (c.PrimaryId == id || c.DuplicateId == id));
            if (stillPending) continue;

            if (entityType == EntityTypes.Account)
            {
                var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id);
                if (account is not null) account.IsDuplicateCandidate = false;
            }
            else if (entityType == EntityTypes.Contact)
            {
                var contact = await db.Contacts.FirstOrDefaultAsync(c => c.Id == id);
                if (contact is not null) contact.IsDuplicateCandidate = false;
            }
        }
    }

    private async Task ClearDuplicateFlagsAsync(DuplicateCandidate candidate)
    {
        var ids = new[] { candidate.PrimaryId, candidate.DuplicateId };
        var remaining = await db.DuplicateCandidates.CountAsync(c =>
            c.Id != candidate.Id
            && c.Status == DuplicateStatus.Pending
            && c.EntityType == candidate.EntityType
            && (ids.Contains(c.PrimaryId) || ids.Contains(c.DuplicateId)));
        if (remaining > 0) return;

        if (candidate.EntityType == EntityTypes.Account)
        {
            var accounts = await db.Accounts.Where(a => ids.Contains(a.Id)).ToListAsync();
            foreach (var account in accounts) account.IsDuplicateCandidate = false;
        }
        else if (candidate.EntityType == EntityTypes.Contact)
        {
            var contacts = await db.Contacts.Where(c => ids.Contains(c.Id)).ToListAsync();
            foreach (var contact in contacts) contact.IsDuplicateCandidate = false;
        }
    }

    private void AddCandidate(
        string entityType, OrgEntity a, OrgEntity b, DateTime createdAtA,
        double similarity, string reason, Guid organizationId)
    {
        var (primary, duplicate) = a.CreatedAt <= b.CreatedAt ? (a, b) : (b, a);
        db.DuplicateCandidates.Add(new DuplicateCandidate
        {
            OrganizationId = organizationId,
            EntityType = entityType,
            PrimaryId = primary.Id,
            DuplicateId = duplicate.Id,
            Similarity = Math.Round(Math.Clamp(similarity, 0, 1), 3),
            Reason = reason,
            Status = DuplicateStatus.Pending
        });
    }

    private int CreateContactPairs(
        List<Contact> list, double similarity, string reason,
        HashSet<string> seen, Guid organizationId, ref int pairs)
    {
        var created = 0;
        for (var i = 0; i < list.Count; i++)
        {
            for (var j = i + 1; j < list.Count; j++)
            {
                var a = list[i];
                var b = list[j];
                if (!seen.Add(PairKey(EntityTypes.Contact, a.Id, b.Id))) continue;
                AddCandidate(EntityTypes.Contact, a, b, a.CreatedAt, similarity, reason, organizationId);
                a.IsDuplicateCandidate = true;
                b.IsDuplicateCandidate = true;
                created++;
                pairs++;
            }
        }
        return created;
    }

    private static void Fill(Account primary, Account duplicate)
    {
        primary.Domain ??= duplicate.Domain;
        primary.Website ??= duplicate.Website;
        primary.Industry ??= duplicate.Industry;
        primary.Employees ??= duplicate.Employees;
        primary.AnnualRevenue ??= duplicate.AnnualRevenue;
        primary.Phone ??= duplicate.Phone;
        primary.Email ??= duplicate.Email;
        primary.Street ??= duplicate.Street;
        primary.City ??= duplicate.City;
        primary.State ??= duplicate.State;
        primary.PostalCode ??= duplicate.PostalCode;
        primary.Country ??= duplicate.Country;
        primary.Description ??= duplicate.Description;
        primary.OwnerId ??= duplicate.OwnerId;
    }

    private static void Fill(Contact primary, Contact duplicate)
    {
        primary.Email ??= duplicate.Email;
        primary.Phone ??= duplicate.Phone;
        primary.Mobile ??= duplicate.Mobile;
        primary.Title ??= duplicate.Title;
        primary.Department ??= duplicate.Department;
        primary.AccountId ??= duplicate.AccountId;
        primary.OwnerId ??= duplicate.OwnerId;
        primary.LinkedInUrl ??= duplicate.LinkedInUrl;
        primary.City ??= duplicate.City;
        primary.Country ??= duplicate.Country;
    }

    private static string MergeMaps(string primaryJson, string duplicateJson)
    {
        var primary = Json.Map(primaryJson);
        foreach (var (key, value) in Json.Map(duplicateJson))
        {
            if (!primary.ContainsKey(key) || string.IsNullOrWhiteSpace(primary[key])) primary[key] = value;
        }
        return Json.Serialize(primary);
    }

    private static bool SameLocation(Account a, Account b)
    {
        if (string.IsNullOrWhiteSpace(a.Country) || string.IsNullOrWhiteSpace(b.Country)) return true;
        return string.Equals(Similarity.Normalize(a.Country), Similarity.Normalize(b.Country), StringComparison.Ordinal);
    }

    private static string NormalizeDomain(string? domain)
    {
        var value = (domain ?? "").Trim().ToLowerInvariant();
        if (value.StartsWith("http://", StringComparison.Ordinal)) value = value[7..];
        if (value.StartsWith("https://", StringComparison.Ordinal)) value = value[8..];
        var slash = value.IndexOf('/');
        if (slash >= 0) value = value[..slash];
        if (value.StartsWith("www.", StringComparison.Ordinal)) value = value[4..];
        return value;
    }

    private static string PairKey(string entityType, Guid a, Guid b)
    {
        var first = a.CompareTo(b) <= 0 ? a : b;
        var second = a.CompareTo(b) <= 0 ? b : a;
        return $"{entityType}|{first}|{second}";
    }
}
