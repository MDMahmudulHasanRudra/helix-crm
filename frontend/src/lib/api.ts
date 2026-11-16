"use client";

import useSWR, { type SWRConfiguration } from "swr";
import type {
  AccountDetail,
  AccountListItem,
  Activity,
  AutomationRule,
  AutonomousInsights,
  AutonomousSettings,
  Board,
  CalendarEvent,
  CannedResponse,
  ContactDetail,
  ContactListItem,
  CustomField,
  DashboardData,
  DealDetail,
  DealListItem,
  DuplicateCandidate,
  InvoiceDetail,
  InvoiceListItem,
  InvoiceSummary,
  LeadDetail,
  LeadListItem,
  Me,
  NotificationFeed,
  Organization,
  Paged,
  Pipeline,
  Product,
  QuoteDetail,
  QuoteListItem,
  ReportData,
  SearchResult,
  TicketDetail,
  TicketListItem,
  User,
} from "./types";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
  redirectOnUnauthorized?: boolean;
}

let redirectingToLogin = false;

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, redirectOnUnauthorized = true } = options;
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "include",
    signal,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && redirectOnUnauthorized && typeof window !== "undefined") {
    if (!redirectingToLogin) {
      redirectingToLogin = true;
      // Clear the rejected cookie first; otherwise the proxy sees it and bounces /login back here forever.
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
    }
    throw new ApiError("Session expired", 401);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "message" in payload && String(payload.message)) ||
      (typeof payload === "string" && payload) ||
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);

function useResource<T>(path: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, fetcher, config);
}

export function useMe() {
  return useResource<Me>("/auth/me");
}

export function useDashboard() {
  return useResource<DashboardData>("/dashboard");
}

export function useAccounts(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Paged<AccountListItem>>(`/accounts${query(params)}`);
}

export function useAccount(id?: string | null) {
  return useResource<AccountDetail>(id ? `/accounts/${id}` : null);
}

export function useContacts(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Paged<ContactListItem>>(`/contacts${query(params)}`);
}

export function useContact(id?: string | null) {
  return useResource<ContactDetail>(id ? `/contacts/${id}` : null);
}

export function useLeads(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Paged<LeadListItem>>(`/leads${query(params)}`);
}

export function useLead(id?: string | null) {
  return useResource<LeadDetail>(id ? `/leads/${id}` : null);
}

export function useBoard(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Board>(`/deals/board${query(params)}`);
}

export function useDeals(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Paged<DealListItem>>(`/deals${query(params)}`);
}

export function useDeal(id?: string | null) {
  return useResource<DealDetail>(id ? `/deals/${id}` : null);
}

export function useActivities(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Paged<Activity>>(`/activities${query(params)}`);
}

export function useTickets(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Paged<TicketListItem>>(`/tickets${query(params)}`);
}

export function useTicket(id?: string | null) {
  return useResource<TicketDetail>(id ? `/tickets/${id}` : null);
}

export function usePipelines() {
  return useResource<Pipeline[]>("/pipelines");
}

export function useProducts() {
  return useResource<Product[]>("/products");
}

export function useQuotes(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Paged<QuoteListItem>>(`/quotes${query(params)}`);
}

export function useQuote(id?: string | null) {
  return useResource<QuoteDetail>(id ? `/quotes/${id}` : null);
}

export function useInvoices(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Paged<InvoiceListItem>>(`/invoices${query(params)}`);
}

export function useInvoice(id?: string | null) {
  return useResource<InvoiceDetail>(id ? `/invoices/${id}` : null);
}

export function useInvoiceSummary() {
  return useResource<InvoiceSummary>("/invoices/summary");
}

export function useCalendarEvents(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<CalendarEvent[]>(`/activities/calendar${query(params)}`);
}

export function useCannedResponses(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<CannedResponse[]>(`/canned-responses${query(params)}`);
}

export function useAutomations() {
  return useResource<AutomationRule[]>("/automations");
}

export function useCustomFields(entityType?: string) {
  return useResource<CustomField[]>(entityType ? `/custom-fields?entityType=${entityType}` : "/custom-fields");
}

export function useUsers() {
  return useResource<User[]>("/users");
}

export function useAllUsers() {
  return useResource<User[]>("/users?includeInactive=true");
}

export function useOrganization() {
  return useResource<Organization>("/organization");
}

export function useNotifications() {
  return useResource<NotificationFeed>("/notifications", { refreshInterval: 60_000 });
}

export function useSearch(query: string) {
  return useResource<SearchResult>(query.trim().length > 1 ? `/search?q=${encodeURIComponent(query.trim())}` : null);
}

export function useReports() {
  return useResource<ReportData>("/reports/summary");
}

export function useAutonomousInsights() {
  return useResource<AutonomousInsights>("/autonomous/insights", { refreshInterval: 60_000 });
}

export function useAutonomousSettings() {
  return useResource<AutonomousSettings>("/autonomous/settings");
}

export function useDuplicates(params: Record<string, string | number | undefined | null> = {}) {
  return useResource<Paged<DuplicateCandidate>>(
    `/duplicates${query({ status: "Pending", pageSize: 50, ...params })}`,
  );
}

export function query(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : "";
}

export async function mutate<T>(path: string, method: Method, body?: unknown) {
  return api<T>(path, { method, body });
}

export function download(path: string) {
  if (typeof window !== "undefined") window.open(`/api/v1${path}`, "_blank");
}
