namespace HelixCrm.Api.Common;

public record UserRefDto(Guid Id, string FullName, string? AvatarUrl, string? Email = null);
public record ContactRefDto(Guid Id, string FullName, string? Email, string? Title, Guid? AccountId, string? AccountName);
public record DealRefDto(Guid Id, string Name, decimal Amount, string Currency, string StageName, string StageColor, string Status, DateTime? ExpectedCloseDate);
public record TicketRefDto(Guid Id, string Number, string Subject, string Status, string Priority, DateTime CreatedAt);
public record QuoteRefDto(Guid Id, string Number, string Status, decimal Total, string Currency, DateTime IssueDate);

public record ActivityDto(
    Guid Id,
    string Type,
    string Subject,
    string? Body,
    DateTime? DueAt,
    DateTime? CompletedAt,
    string Status,
    string Priority,
    string RelatedType,
    Guid RelatedId,
    Guid? OwnerId,
    string? OwnerName,
    string? OwnerAvatarUrl,
    int? DurationMinutes,
    string? Outcome,
    DateTime CreatedAt,
    string? RelatedName = null,
    string? EmailStatus = null);

public record AuditDto(Guid Id, string Action, string EntityType, Guid EntityId, string ActorName, string ChangesJson, DateTime CreatedAt);

public record CustomFieldValueDto(string Key, string Label, string FieldType, string? Value, string[] Options, bool IsRequired, string? Placeholder, string? HelpText);

public static class SharedMapper
{
    public static ActivityDto Activity(Domain.Activity a, Domain.User? owner, string? relatedName = null, string? emailStatus = null) => new(
        a.Id, a.Type, a.Subject, a.Body, a.DueAt, a.CompletedAt, a.Status, a.Priority,
        a.RelatedType, a.RelatedId, a.OwnerId, owner?.FullName, owner?.AvatarUrl,
        a.DurationMinutes, a.Outcome, a.CreatedAt, relatedName, emailStatus);

    public static AuditDto Audit(Domain.AuditLog log) => new(
        log.Id, log.Action, log.EntityType, log.EntityId,
        log.ActorName ?? "System", log.ChangesJson, log.CreatedAt);
}
