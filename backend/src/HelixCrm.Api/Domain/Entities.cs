namespace HelixCrm.Api.Domain;

/// <summary>Every tenant-owned record derives from this. Global query filters enforce
/// organization isolation and soft deletes in one place.</summary>
public abstract class OrgEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrganizationId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public Guid? CreatedById { get; set; }
    public Guid? UpdatedById { get; set; }
    public bool IsDeleted { get; set; }
}

public class Organization
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Currency { get; set; } = "USD";
    public string TimeZone { get; set; } = "UTC";
    public string? LogoUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Autonomous engine configuration (per workspace).
    public bool AutonomousEnabled { get; set; } = true;
    public bool AutoRouteLeads { get; set; } = true;
    public int StaleDealDays { get; set; } = 14;
    public int StaleDealProbabilityPenalty { get; set; } = 15;
    public int DataFreshnessDays { get; set; } = 180;
    public int LeadScoreRoutingThreshold { get; set; } = 75;
}

public class User : OrgEntity
{
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string? Title { get; set; }
    public string? Phone { get; set; }
    public string? AvatarUrl { get; set; }
    public string Role { get; set; } = Roles.Rep;
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }

    public string FullName => $"{FirstName} {LastName}".Trim();
}

public class Pipeline : OrgEntity
{
    public string Name { get; set; } = "";
    public bool IsDefault { get; set; }
    public List<Stage> Stages { get; set; } = [];
}

public class Stage : OrgEntity
{
    public Guid PipelineId { get; set; }
    public Pipeline? Pipeline { get; set; }
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
    public int Probability { get; set; }
    public string Color { get; set; } = "#6366f1";
    public bool IsWon { get; set; }
    public bool IsLost { get; set; }
}

public class Account : OrgEntity
{
    public string Name { get; set; } = "";
    public string? Domain { get; set; }
    public string? Website { get; set; }
    public string? Industry { get; set; }
    public int? Employees { get; set; }
    public decimal? AnnualRevenue { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Street { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? PostalCode { get; set; }
    public string? Country { get; set; }
    public string? Description { get; set; }
    public string Status { get; set; } = "Active";
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    public string TagsJson { get; set; } = "[]";
    public string CustomDataJson { get; set; } = "{}";

    // Autonomous data hygiene.
    public string EnrichmentDataJson { get; set; } = "{}";
    public int DataFreshnessScore { get; set; } = 100;
    public bool IsDuplicateCandidate { get; set; }

    public List<Contact> Contacts { get; set; } = [];
    public List<Deal> Deals { get; set; } = [];
}

public class Contact : OrgEntity
{
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Title { get; set; }
    public string? Department { get; set; }
    public Guid? AccountId { get; set; }
    public Account? Account { get; set; }
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? City { get; set; }
    public string? Country { get; set; }
    public string? Notes { get; set; }
    public bool IsPrimary { get; set; }
    public string TagsJson { get; set; } = "[]";
    public string CustomDataJson { get; set; } = "{}";

    // Autonomous data hygiene.
    public int DataFreshnessScore { get; set; } = 100;
    public bool IsStale { get; set; }
    public bool IsDuplicateCandidate { get; set; }

    public string FullName => $"{FirstName} {LastName}".Trim();
}

public class Lead : OrgEntity
{
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string? Company { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Title { get; set; }
    public string? Website { get; set; }
    public string Source { get; set; } = "Website";
    public string Status { get; set; } = LeadStatus.New;
    public int Score { get; set; }
    public decimal? EstimatedValue { get; set; }
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    public string? Notes { get; set; }
    public Guid? ConvertedAccountId { get; set; }
    public Guid? ConvertedContactId { get; set; }
    public Guid? ConvertedDealId { get; set; }
    public DateTime? ConvertedAt { get; set; }
    public string TagsJson { get; set; } = "[]";
    public string CustomDataJson { get; set; } = "{}";

    // Autonomous lead scoring & routing.
    public string ScoreBreakdownJson { get; set; } = "{}";
    public DateTime? ScoreUpdatedAt { get; set; }
    public string RoutingState { get; set; } = "Unrouted";

    public string FullName => $"{FirstName} {LastName}".Trim();
}

public class Deal : OrgEntity
{
    public string Name { get; set; } = "";
    public Guid? AccountId { get; set; }
    public Account? Account { get; set; }
    public Guid? PrimaryContactId { get; set; }
    public Contact? PrimaryContact { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public Guid PipelineId { get; set; }
    public Pipeline? Pipeline { get; set; }
    public Guid StageId { get; set; }
    public Stage? Stage { get; set; }
    public int Probability { get; set; }
    public DateTime? ExpectedCloseDate { get; set; }
    public DateTime? ClosedAt { get; set; }
    public string Status { get; set; } = DealStatus.Open;
    public string? Source { get; set; }
    public string? Description { get; set; }
    public string? NextStep { get; set; }
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    public string TagsJson { get; set; } = "[]";
    public string CustomDataJson { get; set; } = "{}";

    // Autonomous pipeline velocity.
    public DateTime? LastStageMovedAt { get; set; }
    public bool IsStalled { get; set; }
    public int HealthIndex { get; set; } = 100;
    public string? LostReason { get; set; }
}

public class Activity : OrgEntity
{
    public string Type { get; set; } = ActivityType.Task;
    public string Subject { get; set; } = "";
    public string? Body { get; set; }
    public DateTime? DueAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string Status { get; set; } = ActivityStatus.Open;
    public string Priority { get; set; } = "Normal";
    public string RelatedType { get; set; } = "Account";
    public Guid RelatedId { get; set; }
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    public int? DurationMinutes { get; set; }
    public string? Outcome { get; set; }
}

public class Ticket : OrgEntity
{
    public string Number { get; set; } = "";
    public string Subject { get; set; } = "";
    public string? Description { get; set; }
    public string Status { get; set; } = TicketStatus.Open;
    public string Priority { get; set; } = "Normal";
    public string Channel { get; set; } = "Email";
    public Guid? AccountId { get; set; }
    public Account? Account { get; set; }
    public Guid? ContactId { get; set; }
    public Contact? Contact { get; set; }
    public Guid? AssigneeId { get; set; }
    public User? Assignee { get; set; }
    public DateTime? FirstResponseAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime? SlaDueAt { get; set; }
    public string TagsJson { get; set; } = "[]";

    // Autonomous SLA escalation.
    public bool SlaBreached { get; set; }
    public int EscalationLevel { get; set; }
    public DateTime? SlaWarnedAt { get; set; }
}

public class Product : OrgEntity
{
    public string Name { get; set; } = "";
    public string? Sku { get; set; }
    public string? Description { get; set; }
    public decimal UnitPrice { get; set; }
    public string Currency { get; set; } = "USD";
    public decimal TaxRate { get; set; }
    public string? Category { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Quote : OrgEntity
{
    public string Number { get; set; } = "";
    public Guid? AccountId { get; set; }
    public Account? Account { get; set; }
    public Guid? DealId { get; set; }
    public Deal? Deal { get; set; }
    public Guid? ContactId { get; set; }
    public Contact? Contact { get; set; }
    public string Status { get; set; } = QuoteStatus.Draft;
    public DateTime IssueDate { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiryDate { get; set; }
    public string Currency { get; set; } = "USD";
    public decimal DiscountPercent { get; set; }
    public decimal TaxPercent { get; set; }
    public decimal Subtotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal Total { get; set; }
    public string? Notes { get; set; }
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    public List<QuoteLine> Lines { get; set; } = [];
}

public class QuoteLine : OrgEntity
{
    public Guid QuoteId { get; set; }
    public Quote? Quote { get; set; }
    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }
    public string Description { get; set; } = "";
    public decimal Quantity { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal LineTotal { get; set; }
}

public class CustomFieldDefinition : OrgEntity
{
    public string EntityType { get; set; } = "";
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public string FieldType { get; set; } = "text";
    public string OptionsJson { get; set; } = "[]";
    public bool IsRequired { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Placeholder { get; set; }
    public string? HelpText { get; set; }
}

public class AuditLog : OrgEntity
{
    public string EntityType { get; set; } = "";
    public Guid EntityId { get; set; }
    public string Action { get; set; } = "";
    public string ChangesJson { get; set; } = "{}";
    public string? ActorName { get; set; }
}

public class Notification : OrgEntity
{
    public Guid UserId { get; set; }
    public string Title { get; set; } = "";
    public string? Body { get; set; }
    public string? Link { get; set; }
    public string Type { get; set; } = "info";
    public bool IsRead { get; set; }
}

public class Invoice : OrgEntity
{
    public string Number { get; set; } = "";
    public Guid? AccountId { get; set; }
    public Account? Account { get; set; }
    public Guid? DealId { get; set; }
    public Deal? Deal { get; set; }
    public Guid? QuoteId { get; set; }
    public Quote? Quote { get; set; }
    public Guid? ContactId { get; set; }
    public Contact? Contact { get; set; }
    public string Status { get; set; } = InvoiceStatus.Draft;
    public DateTime IssueDate { get; set; } = DateTime.UtcNow;
    public DateTime? DueDate { get; set; }
    public string Currency { get; set; } = "USD";
    public decimal DiscountPercent { get; set; }
    public decimal TaxPercent { get; set; }
    public decimal Subtotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal Total { get; set; }
    public decimal AmountPaid { get; set; }
    public decimal BalanceDue { get; set; }
    public string? Notes { get; set; }
    public string? PaymentTerms { get; set; }
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    public List<InvoiceLine> Lines { get; set; } = [];
    public List<InvoicePayment> Payments { get; set; } = [];
}

public class InvoiceLine : OrgEntity
{
    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }
    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }
    public string Description { get; set; } = "";
    public decimal Quantity { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal LineTotal { get; set; }
}

public class InvoicePayment : OrgEntity
{
    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }
    public decimal Amount { get; set; }
    public DateTime PaymentDate { get; set; } = DateTime.UtcNow;
    public string PaymentMethod { get; set; } = "Bank Transfer";
    public string? Reference { get; set; }
    public string? Notes { get; set; }
}

public class CannedResponse : OrgEntity
{
    public string Title { get; set; } = "";
    public string Shortcut { get; set; } = "";
    public string Content { get; set; } = "";
    public string? Category { get; set; } = "General";
}

public class AutomationRule : OrgEntity
{
    public string Name { get; set; } = "";
    public string EventType { get; set; } = "LeadCreated";
    public string ActionType { get; set; } = "CreateTask";
    public string ActionConfigJson { get; set; } = "{}";
    public bool IsActive { get; set; } = true;
    public int ExecutionCount { get; set; }
}

/// <summary>
/// A fuzzy-match suggestion produced by the self-healing data hygiene worker.
/// Pending candidates surface on the dashboard for a one-click merge.
/// </summary>
public class DuplicateCandidate : OrgEntity
{
    public string EntityType { get; set; } = EntityTypes.Account;
    public Guid PrimaryId { get; set; }
    public Guid DuplicateId { get; set; }
    public double Similarity { get; set; }
    public string Status { get; set; } = DuplicateStatus.Pending;
    public string Reason { get; set; } = "";
}
