namespace HelixCrm.Api.Domain;

public static class Roles
{
    public const string Admin = "Admin";
    public const string Manager = "Manager";
    public const string Rep = "Rep";
    public static readonly string[] All = [Admin, Manager, Rep];
}

public static class LeadStatus
{
    public const string New = "New";
    public const string Contacted = "Contacted";
    public const string Qualified = "Qualified";
    public const string Unqualified = "Unqualified";
    public const string Converted = "Converted";
    public static readonly string[] All = [New, Contacted, Qualified, Unqualified, Converted];
}

public static class DealStatus
{
    public const string Open = "Open";
    public const string Won = "Won";
    public const string Lost = "Lost";
}

public static class ActivityType
{
    public const string Call = "Call";
    public const string Email = "Email";
    public const string Meeting = "Meeting";
    public const string Task = "Task";
    public const string Note = "Note";
    public static readonly string[] All = [Call, Email, Meeting, Task, Note];
}

public static class ActivityStatus
{
    public const string Open = "Open";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";
}

public static class TicketStatus
{
    public const string Open = "Open";
    public const string Pending = "Pending";
    public const string Resolved = "Resolved";
    public const string Closed = "Closed";
    public static readonly string[] All = [Open, Pending, Resolved, Closed];
}

public static class QuoteStatus
{
    public const string Draft = "Draft";
    public const string Sent = "Sent";
    public const string Accepted = "Accepted";
    public const string Declined = "Declined";
    public static readonly string[] All = [Draft, Sent, Accepted, Declined];
}

public static class InvoiceStatus
{
    public const string Draft = "Draft";
    public const string Sent = "Sent";
    public const string Paid = "Paid";
    public const string PartiallyPaid = "PartiallyPaid";
    public const string Overdue = "Overdue";
    public const string Cancelled = "Cancelled";
    public static readonly string[] All = [Draft, Sent, Paid, PartiallyPaid, Overdue, Cancelled];
}

public static class AutomationEvents
{
    public const string LeadCreated = "LeadCreated";
    public const string DealWon = "DealWon";
    public const string TicketCreated = "TicketCreated";
    public const string QuoteAccepted = "QuoteAccepted";
    public static readonly string[] All = [LeadCreated, DealWon, TicketCreated, QuoteAccepted];
}

public static class EntityTypes
{
    public const string Account = "Account";
    public const string Contact = "Contact";
    public const string Lead = "Lead";
    public const string Deal = "Deal";
    public const string Ticket = "Ticket";
    public static readonly string[] All = [Account, Contact, Lead, Deal];
    public static readonly string[] RelationshipAll = [Account, Contact, Lead, Deal, Ticket];
}

public static class DuplicateStatus
{
    public const string Pending = "Pending";
    public const string Merged = "Merged";
    public const string Dismissed = "Dismissed";
    public static readonly string[] All = [Pending, Merged, Dismissed];
}

public static class LeadRoutingState
{
    public const string Unrouted = "Unrouted";
    public const string Assigned = "Assigned";
    public const string AutoRouted = "AutoRouted";
    public const string SdrQueue = "SdrQueue";
}
