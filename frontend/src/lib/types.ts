export type Role = "Admin" | "Manager" | "Rep";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timeZone: string;
  logoUrl?: string | null;
}

export interface Me {
  user: User;
  organization: Organization;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface CustomFieldValue {
  key: string;
  label: string;
  fieldType: string;
  value?: string | null;
  options: string[];
  isRequired: boolean;
  placeholder?: string | null;
  helpText?: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  changesJson: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  type: string;
  subject: string;
  body?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  status: string;
  priority: string;
  relatedType: string;
  relatedId: string;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  durationMinutes?: number | null;
  outcome?: string | null;
  createdAt: string;
  relatedName?: string | null;
}

export interface AccountListItem {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  status: string;
  contactCount: number;
  openDealCount: number;
  openPipelineValue: number;
  tags: string[];
  ownerId?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  updatedAt: string;
}

export interface ContactRef {
  id: string;
  fullName: string;
  email?: string | null;
  title?: string | null;
  accountId?: string | null;
  accountName?: string | null;
}

export interface DealRef {
  id: string;
  name: string;
  amount: number;
  currency: string;
  stageName: string;
  stageColor: string;
  status: string;
  expectedCloseDate?: string | null;
}

export interface TicketRef {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface QuoteRef {
  id: string;
  number: string;
  status: string;
  total: number;
  currency: string;
  issueDate: string;
}

export interface AccountDetail {
  id: string;
  name: string;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  employees?: number | null;
  annualRevenue?: number | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  description?: string | null;
  status: string;
  tags: string[];
  ownerId?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  contacts: ContactRef[];
  deals: DealRef[];
  activities: Activity[];
  tickets: TicketRef[];
  quotes: QuoteRef[];
  customFields: CustomFieldValue[];
  audit: AuditEntry[];
}

export interface ContactListItem {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  tags: string[];
  isPrimary: boolean;
  updatedAt: string;
}

export interface ContactDetail {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  title?: string | null;
  department?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  linkedInUrl?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  isPrimary: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deals: DealRef[];
  activities: Activity[];
  tickets: TicketRef[];
  customFields: CustomFieldValue[];
  audit: AuditEntry[];
}

export interface LeadListItem {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  source: string;
  status: string;
  score: number;
  estimatedValue?: number | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  tags: string[];
  updatedAt: string;
  routingState: string;
}

export interface LeadDetail extends LeadListItem {
  website?: string | null;
  notes?: string | null;
  convertedAccountId?: string | null;
  convertedAccountName?: string | null;
  convertedContactId?: string | null;
  convertedContactName?: string | null;
  convertedDealId?: string | null;
  convertedDealName?: string | null;
  convertedAt?: string | null;
  createdAt: string;
  activities: Activity[];
  customFields: CustomFieldValue[];
  audit: AuditEntry[];
  scoreBreakdownJson: string;
}

export interface LeadScoreFactor {
  key: string;
  label: string;
  points: number;
  max: number;
}

export interface LeadScoreBreakdown {
  total: number;
  factors: LeadScoreFactor[];
}

export interface DealListItem {
  id: string;
  name: string;
  amount: number;
  currency: string;
  accountId?: string | null;
  accountName?: string | null;
  stageId: string;
  stageName: string;
  stageColor: string;
  pipelineId: string;
  status: string;
  probability: number;
  expectedCloseDate?: string | null;
  nextStep?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  tags: string[];
  updatedAt: string;
  isStalled: boolean;
  healthIndex: number;
}

export interface DealDetail extends DealListItem {
  primaryContactId?: string | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  pipelineName: string;
  closedAt?: string | null;
  source?: string | null;
  description?: string | null;
  createdAt: string;
  activities: Activity[];
  quotes: QuoteRef[];
  customFields: CustomFieldValue[];
  audit: AuditEntry[];
  lastStageMovedAt?: string | null;
  lostReason?: string | null;
}

export interface Stage {
  id: string;
  name: string;
  sortOrder: number;
  probability: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
  dealCount: number;
  dealValue: number;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  openDealCount: number;
  openValue: number;
  stages: Stage[];
}

export interface BoardStage {
  id: string;
  name: string;
  color: string;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  count: number;
  value: number;
  deals: DealListItem[];
}

export interface Board {
  pipeline: { id: string; name: string; isDefault: boolean };
  pipelines: { id: string; name: string; isDefault: boolean }[];
  stages: BoardStage[];
  totals: { count: number; value: number; weighted: number };
}

export interface TicketListItem {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  channel: string;
  accountId?: string | null;
  accountName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeAvatarUrl?: string | null;
  slaDueAt?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  tags: string[];
  slaBreached: boolean;
  escalationLevel: number;
}

export interface TicketDetail extends TicketListItem {
  description?: string | null;
  firstResponseAt?: string | null;
  updatedAt: string;
  conversation: Activity[];
  audit: AuditEntry[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description?: string | null;
  unitPrice: number;
  currency: string;
  taxRate: number;
  category?: string | null;
  isActive: boolean;
}

export interface QuoteLine {
  id: string;
  productId?: string | null;
  productName?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
}

export interface QuoteListItem {
  id: string;
  number: string;
  status: string;
  total: number;
  currency: string;
  accountId?: string | null;
  accountName?: string | null;
  dealId?: string | null;
  dealName?: string | null;
  issueDate: string;
  expiryDate?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  updatedAt: string;
}

export interface QuoteDetail extends QuoteListItem {
  contactId?: string | null;
  contactName?: string | null;
  discountPercent: number;
  taxPercent: number;
  subtotal: number;
  taxTotal: number;
  notes?: string | null;
  ownerAvatarUrl?: string | null;
  createdAt: string;
  lines: QuoteLine[];
  audit: AuditEntry[];
}

export interface CustomField {
  id: string;
  entityType: string;
  key: string;
  label: string;
  fieldType: string;
  options: string[];
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  placeholder?: string | null;
  helpText?: string | null;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationFeed {
  items: Notification[];
  unread: number;
}

export interface SearchGroup {
  type: string;
  label: string;
  items: { id: string; type: string; title: string; subtitle: string; url: string }[];
}

export interface SearchResult {
  query: string;
  total: number;
  groups: SearchGroup[];
}

export interface DashboardData {
  kpis: {
    openPipelineValue: number;
    weightedPipelineValue: number;
    wonThisMonth: number;
    winRate: number;
    newLeads30: number;
    openLeads: number;
    conversionRate: number;
    activeAccounts: number;
    contacts: number;
    openTickets: number;
    avgDealSize: number;
    openDeals: number;
    tasksDue: number;
    overdueTasks: number;
  };
  pipelineByStage: { id: string; name: string; color: string; probability: number; count: number; value: number }[];
  pipelineName?: string | null;
  revenueTrend: { month: string; key: string; value: number; count: number }[];
  leadsBySource: { source: string; count: number; value: number }[];
  leaderboard: {
    user: { id: string; fullName: string; avatarUrl?: string | null; role: string };
    openValue: number;
    openCount: number;
    wonValue: number;
    wonCount: number;
  }[];
  topDeals: {
    id: string;
    name: string;
    amount: number;
    probability: number;
    accountName?: string | null;
    stageName: string;
    stageColor: string;
    ownerName?: string | null;
    ownerAvatarUrl?: string | null;
  }[];
  myTasks: Activity[];
  recentActivity: Activity[];
  tickets: {
    total: number;
    open: number;
    pending: number;
    resolved: number;
    urgent: number;
    byStatus: { status: string; count: number }[];
    byPriority: { priority: string; count: number }[];
  };
  generatedAt: string;
}

export interface ReportData {
  range: { from: string; to: string };
  kpis: {
    wonValue: number;
    lostValue: number;
    openPipeline: number;
    weightedPipeline: number;
    wonCount: number;
    lostCount: number;
    winRate: number;
    avgDealSize: number;
    newLeads: number;
    conversionRate: number;
    avgTicketResolutionHours: number;
    ticketsResolved: number;
  };
  months: { key: string; month: string; wonValue: number; wonCount: number; lostCount: number; pipelineCreated: number }[];
  pipelineByStage: { id: string; name: string; color: string; count: number; value: number }[];
  dealsByOwner: {
    ownerId: string;
    name: string;
    avatarUrl?: string | null;
    openValue: number;
    openCount: number;
    wonValue: number;
    wonCount: number;
    winRate: number;
  }[];
  topAccounts: {
    accountId: string;
    name: string;
    industry?: string | null;
    openValue: number;
    wonValue: number;
    dealCount: number;
  }[];
  leadsBySource: { source: string; count: number; value: number }[];
  leadFunnel: { status: string; count: number }[];
  ticketsByStatus: { status: string; count: number }[];
  ticketsByChannel: { channel: string; count: number }[];
  activityByType: { type: string; count: number }[];
}

export interface InvoicePayment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface InvoiceLine {
  id: string;
  productId?: string | null;
  productName?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
}

export interface InvoiceListItem {
  id: string;
  number: string;
  status: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  currency: string;
  accountId?: string | null;
  accountName?: string | null;
  dealId?: string | null;
  dealName?: string | null;
  issueDate: string;
  dueDate?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  updatedAt: string;
}

export interface InvoiceDetail extends InvoiceListItem {
  quoteId?: string | null;
  quoteNumber?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  discountPercent: number;
  taxPercent: number;
  subtotal: number;
  taxTotal: number;
  notes?: string | null;
  paymentTerms?: string | null;
  ownerAvatarUrl?: string | null;
  createdAt: string;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  audit: AuditEntry[];
}

export interface InvoiceSummary {
  totalInvoiced: number;
  totalPaid: number;
  balanceDue: number;
  overdueCount: number;
  invoiceCount: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  status: string;
  priority: string;
  relatedType: string;
  relatedId: string;
  relatedName?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  color: string;
}

export interface CannedResponse {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  eventType: string;
  actionType: string;
  actionConfigJson: string;
  isActive: boolean;
  executionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  messages: string[];
}

export interface AutonomousInsightItem {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  url: string;
  severity: string;
}

export interface AutonomousInsights {
  enabled: boolean;
  stalledDeals: number;
  stalledDealValue: number;
  slaBreaches: number;
  escalations: number;
  staleContacts: number;
  duplicateCandidates: number;
  highScoreLeads: number;
  items: AutonomousInsightItem[];
  generatedAt: string;
}

export interface AutonomousSettings {
  autonomousEnabled: boolean;
  autoRouteLeads: boolean;
  staleDealDays: number;
  staleDealProbabilityPenalty: number;
  dataFreshnessDays: number;
  leadScoreRoutingThreshold: number;
}

export interface AutonomousRunResult {
  dealsReviewed: number;
  dealsFlaggedStalled: number;
  ticketsReviewed: number;
  ticketsEscalated: number;
  contactsReviewed: number;
  contactsFlaggedStale: number;
  leadsRouted: number;
  duplicatesCreated: number;
  ranAt: string;
}

export interface DuplicateCandidate {
  id: string;
  entityType: string;
  primaryId: string;
  primaryName: string;
  duplicateId: string;
  duplicateName: string;
  similarity: number;
  status: string;
  reason: string;
  createdAt: string;
}

export interface DuplicateScanResult {
  accountsScanned: number;
  contactsScanned: number;
  candidatesCreated: number;
  pairsCreated: number;
}

export interface MergeResult {
  primaryId: string;
  primaryName: string;
  relinkedRecords: number;
  message: string;
}
