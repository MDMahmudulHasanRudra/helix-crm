using System.Text.Json;
using HelixCrm.Api.Common;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Data;

public class HelixDbContext(DbContextOptions<HelixDbContext> options, ITenantProvider tenant) : DbContext(options)
{
    private readonly ITenantProvider _tenant = tenant;

    /// <summary>Seeding disables audit logging to keep the initial dataset clean.</summary>
    public bool AuditEnabled { get; set; } = true;

    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Pipeline> Pipelines => Set<Pipeline>();
    public DbSet<Stage> Stages => Set<Stage>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<Deal> Deals => Set<Deal>();
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Quote> Quotes => Set<Quote>();
    public DbSet<QuoteLine> QuoteLines => Set<QuoteLine>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();
    public DbSet<InvoicePayment> InvoicePayments => Set<InvoicePayment>();
    public DbSet<CannedResponse> CannedResponses => Set<CannedResponse>();
    public DbSet<AutomationRule> AutomationRules => Set<AutomationRule>();
    public DbSet<DuplicateCandidate> DuplicateCandidates => Set<DuplicateCandidate>();
    public DbSet<EmailAccount> EmailAccounts => Set<EmailAccount>();
    public DbSet<EmailMessage> EmailMessages => Set<EmailMessage>();
    public DbSet<EmailSuppression> EmailSuppressions => Set<EmailSuppression>();
    public DbSet<CustomFieldDefinition> CustomFieldDefinitions => Set<CustomFieldDefinition>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Notification> Notifications => Set<Notification>();

    /// <summary>
    /// Resolves the workspace for the current request or background scope.
    /// <see cref="Organization"/> is deliberately not an <see cref="OrgEntity"/>, so it has no
    /// global query filter — every lookup must be scoped by the tenant explicitly.
    /// </summary>
    public async Task<Organization> GetCurrentOrganizationAsync(CancellationToken cancellationToken = default)
    {
        if (_tenant.OrganizationId == Guid.Empty)
            throw new ApiException(401, "Workspace context is missing. Please sign in again.");

        return await Organizations
                   .FirstOrDefaultAsync(o => o.Id == _tenant.OrganizationId, cancellationToken)
               ?? throw new ApiException(404, "Workspace not found.");
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Organization>(e =>
        {
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Name).HasMaxLength(160);
        });

        b.Entity<User>(e =>
        {
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => new { x.OrganizationId, x.Role });
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.FirstName).HasMaxLength(100);
            e.Property(x => x.LastName).HasMaxLength(100);
            e.Property(x => x.Role).HasMaxLength(20);
            e.Property(x => x.PasswordHash).HasMaxLength(300);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Pipeline>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(120);
            e.HasMany(x => x.Stages).WithOne(x => x.Pipeline!).HasForeignKey(x => x.PipelineId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Stage>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Color).HasMaxLength(16);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Account>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Status).HasMaxLength(30);
            e.Property(x => x.AnnualRevenue).HasPrecision(18, 2);
            e.HasIndex(x => new { x.OrganizationId, x.Name });
            e.HasIndex(x => x.OwnerId);
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Contact>(e =>
        {
            e.Property(x => x.FirstName).HasMaxLength(100);
            e.Property(x => x.LastName).HasMaxLength(100);
            e.Property(x => x.Email).HasMaxLength(254);
            e.HasIndex(x => new { x.OrganizationId, x.LastName });
            e.HasIndex(x => x.AccountId);
            e.HasIndex(x => new { x.OrganizationId, x.IsStale });
            e.HasOne(x => x.Account).WithMany(x => x.Contacts).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Lead>(e =>
        {
            e.Property(x => x.FirstName).HasMaxLength(100);
            e.Property(x => x.LastName).HasMaxLength(100);
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.Status).HasMaxLength(30);
            e.Property(x => x.Source).HasMaxLength(60);
            e.Property(x => x.EstimatedValue).HasPrecision(18, 2);
            e.HasIndex(x => new { x.OrganizationId, x.Status });
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Deal>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Status).HasMaxLength(20);
            e.Property(x => x.Currency).HasMaxLength(8);
            e.Property(x => x.LostReason).HasMaxLength(60);
            e.HasIndex(x => new { x.OrganizationId, x.StageId });
            e.HasIndex(x => x.OwnerId);
            e.HasIndex(x => x.ExpectedCloseDate);
            e.HasIndex(x => new { x.OrganizationId, x.IsStalled });
            e.HasOne(x => x.Account).WithMany(x => x.Deals).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.PrimaryContact).WithMany().HasForeignKey(x => x.PrimaryContactId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Pipeline).WithMany().HasForeignKey(x => x.PipelineId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Stage).WithMany().HasForeignKey(x => x.StageId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Activity>(e =>
        {
            e.Property(x => x.Subject).HasMaxLength(240);
            e.Property(x => x.Type).HasMaxLength(20);
            e.Property(x => x.Status).HasMaxLength(20);
            e.HasIndex(x => new { x.OrganizationId, x.RelatedType, x.RelatedId });
            e.HasIndex(x => new { x.OrganizationId, x.OwnerId, x.Status });
            e.HasIndex(x => new { x.OrganizationId, x.EmailMessageId });
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Ticket>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(24);
            e.Property(x => x.Subject).HasMaxLength(240);
            e.HasIndex(x => new { x.OrganizationId, x.Number }).IsUnique();
            e.HasIndex(x => new { x.OrganizationId, x.Status });
            e.HasIndex(x => new { x.OrganizationId, x.SlaBreached });
            e.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Contact).WithMany().HasForeignKey(x => x.ContactId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Assignee).WithMany().HasForeignKey(x => x.AssigneeId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Product>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.Property(x => x.TaxRate).HasPrecision(5, 2);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Quote>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(24);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.Total).HasPrecision(18, 2);
            e.HasIndex(x => new { x.OrganizationId, x.Number }).IsUnique();
            e.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Deal).WithMany().HasForeignKey(x => x.DealId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Contact).WithMany().HasForeignKey(x => x.ContactId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(x => x.Lines).WithOne(x => x.Quote!).HasForeignKey(x => x.QuoteId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<QuoteLine>(e =>
        {
            e.Property(x => x.Description).HasMaxLength(300);
            e.Property(x => x.Quantity).HasPrecision(18, 2);
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<CustomFieldDefinition>(e =>
        {
            e.Property(x => x.EntityType).HasMaxLength(40);
            e.Property(x => x.Key).HasMaxLength(60);
            e.Property(x => x.Label).HasMaxLength(120);
            // Soft-deleted fields release their key so a workspace can recreate one later.
            e.HasIndex(x => new { x.OrganizationId, x.EntityType, x.Key }).IsUnique()
                .HasFilter("\"IsDeleted\" = false");
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<AuditLog>(e =>
        {
            e.Property(x => x.EntityType).HasMaxLength(60);
            e.HasIndex(x => new { x.OrganizationId, x.EntityType, x.EntityId });
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Notification>(e =>
        {
            e.HasIndex(x => new { x.OrganizationId, x.UserId, x.IsRead });
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<Invoice>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(24);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.Total).HasPrecision(18, 2);
            e.Property(x => x.AmountPaid).HasPrecision(18, 2);
            e.Property(x => x.BalanceDue).HasPrecision(18, 2);
            e.HasIndex(x => new { x.OrganizationId, x.Number }).IsUnique();
            e.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Deal).WithMany().HasForeignKey(x => x.DealId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Quote).WithMany().HasForeignKey(x => x.QuoteId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Contact).WithMany().HasForeignKey(x => x.ContactId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(x => x.Lines).WithOne(x => x.Invoice!).HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Payments).WithOne(x => x.Invoice!).HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<InvoiceLine>(e =>
        {
            e.Property(x => x.Description).HasMaxLength(300);
            e.Property(x => x.Quantity).HasPrecision(18, 2);
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<InvoicePayment>(e =>
        {
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.PaymentMethod).HasMaxLength(50);
            e.Property(x => x.Reference).HasMaxLength(100);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<CannedResponse>(e =>
        {
            e.Property(x => x.Title).HasMaxLength(120);
            e.Property(x => x.Shortcut).HasMaxLength(40);
            e.Property(x => x.Category).HasMaxLength(60);
            e.HasIndex(x => new { x.OrganizationId, x.Shortcut });
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<AutomationRule>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(150);
            e.Property(x => x.EventType).HasMaxLength(50);
            e.Property(x => x.ActionType).HasMaxLength(50);
            e.HasIndex(x => new { x.OrganizationId, x.EventType, x.IsActive });
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<DuplicateCandidate>(e =>
        {
            e.Property(x => x.EntityType).HasMaxLength(40);
            e.Property(x => x.Status).HasMaxLength(20);
            e.Property(x => x.Reason).HasMaxLength(240);
            e.HasIndex(x => new { x.OrganizationId, x.Status });
            e.HasIndex(x => new { x.OrganizationId, x.EntityType, x.PrimaryId, x.DuplicateId });
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<EmailAccount>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.FromName).HasMaxLength(120);
            e.Property(x => x.FromAddress).HasMaxLength(254);
            e.Property(x => x.ReplyToAddress).HasMaxLength(254);
            e.Property(x => x.SmtpHost).HasMaxLength(200);
            e.Property(x => x.SmtpUsername).HasMaxLength(254);
            e.Property(x => x.SmtpSecurity).HasMaxLength(20);
            e.Property(x => x.SmtpPasswordCipher).HasMaxLength(2000);
            e.Property(x => x.ImapHost).HasMaxLength(200);
            e.Property(x => x.ImapUsername).HasMaxLength(254);
            e.Property(x => x.ImapSecurity).HasMaxLength(20);
            e.Property(x => x.ImapPasswordCipher).HasMaxLength(2000);
            e.Property(x => x.ImapFolder).HasMaxLength(200);
            e.Property(x => x.LastError).HasMaxLength(1000);
            e.HasIndex(x => new { x.OrganizationId, x.IsActive });
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<EmailMessage>(e =>
        {
            e.Property(x => x.Direction).HasMaxLength(12);
            e.Property(x => x.Status).HasMaxLength(20);
            e.Property(x => x.FromAddress).HasMaxLength(254);
            e.Property(x => x.FromName).HasMaxLength(120);
            e.Property(x => x.ToAddress).HasMaxLength(254);
            e.Property(x => x.ToName).HasMaxLength(120);
            e.Property(x => x.Cc).HasMaxLength(1000);
            e.Property(x => x.Bcc).HasMaxLength(1000);
            e.Property(x => x.Subject).HasMaxLength(400);
            e.Property(x => x.MessageId).HasMaxLength(400);
            e.Property(x => x.InReplyTo).HasMaxLength(400);
            e.Property(x => x.References).HasMaxLength(4000);
            e.Property(x => x.RelatedType).HasMaxLength(30);
            e.Property(x => x.FailureReason).HasMaxLength(1000);
            e.Property(x => x.ImapFolder).HasMaxLength(200);
            e.Property(x => x.ImapUid).HasMaxLength(40);
            e.HasIndex(x => new { x.OrganizationId, x.Direction, x.Status });
            e.HasIndex(x => new { x.OrganizationId, x.RelatedType, x.RelatedId });
            e.HasIndex(x => new { x.OrganizationId, x.NextAttemptAt });
            e.HasIndex(x => new { x.OrganizationId, x.MessageId }).IsUnique()
                .HasFilter("\"MessageId\" IS NOT NULL");
            e.HasIndex(x => new { x.OrganizationId, x.EmailAccountId, x.ImapFolder, x.ImapUid }).IsUnique()
                .HasFilter("\"ImapUid\" IS NOT NULL");
            e.HasOne(x => x.EmailAccount).WithMany().HasForeignKey(x => x.EmailAccountId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });

        b.Entity<EmailSuppression>(e =>
        {
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.Reason).HasMaxLength(30);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasIndex(x => new { x.OrganizationId, x.Email }).IsUnique();
            e.HasQueryFilter(x => x.OrganizationId == _tenant.OrganizationId && !x.IsDeleted);
        });
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        => SaveChangesCoreAsync(cancellationToken);

    private async Task<int> SaveChangesCoreAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var actorId = _tenant.UserId;

        foreach (var entry in ChangeTracker.Entries<OrgEntity>().Where(e => e.State is EntityState.Added or EntityState.Modified))
        {
            if (entry.State == EntityState.Modified || entry.Entity.UpdatedAt == default)
                entry.Entity.UpdatedAt = now;
            if (entry.State == EntityState.Added)
            {
                if (entry.Entity.CreatedAt == default) entry.Entity.CreatedAt = now;
                entry.Entity.CreatedById ??= actorId;
            }
            entry.Entity.UpdatedById = actorId;
        }

        var auditEntries = AuditEnabled
            ? ChangeTracker.Entries<OrgEntity>()
                .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
                .Where(e => e.Entity is not AuditLog and not Notification and not QuoteLine and not Stage
                    and not DuplicateCandidate and not EmailMessage)
                .Select(e => BuildAudit(e, now))
                .Where(x => x is not null)
                .Cast<AuditLog>()
                .ToList()
            : [];

        if (auditEntries.Count > 0) AuditLogs.AddRange(auditEntries);

        return await base.SaveChangesAsync(ct);
    }

    private AuditLog? BuildAudit(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry<OrgEntity> entry, DateTime now)
    {
        var entity = entry.Entity;
        var changes = new Dictionary<string, object?>();
        var action = entry.State switch
        {
            EntityState.Added => "created",
            EntityState.Deleted => "deleted",
            _ => "updated"
        };

        if (action == "deleted") action = "deleted";
        if (entry.State == EntityState.Modified && entity.IsDeleted) action = "deleted";

        if (entry.State == EntityState.Modified)
        {
            foreach (var prop in entry.Properties.Where(p => p.IsModified))
            {
                if (prop.Metadata.Name is "UpdatedAt" or "UpdatedById" or "IsDeleted" or "PasswordHash" or "CustomDataJson" or "TagsJson"
                    or "SmtpPasswordCipher" or "ImapPasswordCipher") continue;
                changes[prop.Metadata.Name] = new[] { prop.OriginalValue?.ToString(), prop.CurrentValue?.ToString() };
            }
            // A soft delete only flips IsDeleted, so give the entry a readable subject.
            if (action == "deleted") changes["Name"] = Display(entity);
            if (changes.Count == 0) return null;
        }
        else
        {
            changes["Name"] = Display(entity);
        }

        var json = JsonSerializer.Serialize(changes);
        if (json.Length > 4000) json = json[..4000];

        return new AuditLog
        {
            OrganizationId = entity.OrganizationId == Guid.Empty ? _tenant.OrganizationId : entity.OrganizationId,
            EntityType = entity.GetType().Name,
            EntityId = entity.Id,
            Action = action,
            ChangesJson = json,
            ActorName = _tenant.UserName,
            CreatedAt = now,
            UpdatedAt = now,
            CreatedById = _tenant.UserId
        };
    }

    private static object? Display(OrgEntity entity) => entity switch
    {
        Account a => a.Name,
        Contact c => c.FullName,
        Lead l => l.FullName,
        Deal d => d.Name,
        Ticket t => t.Subject,
        Quote q => q.Number,
        Activity a => a.Subject,
        CustomFieldDefinition f => f.Label,
        User u => u.FullName,
        EmailAccount e => e.Name,
        EmailSuppression s => s.Email,
        _ => entity.GetType().Name
    };
}
