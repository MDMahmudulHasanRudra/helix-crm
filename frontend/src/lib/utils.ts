import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  INR: "₹",
  JPY: "¥",
};

export function money(value?: number | null, currency = "USD", opts?: { compact?: boolean; decimals?: boolean }) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (opts?.compact) {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    const symbol = currencySymbols[currency] ?? `${currency} `;
    if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000)}M`;
    if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}k`;
    return `${sign}${symbol}${trim(abs)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: opts?.decimals ? 2 : 0,
  }).format(value);
}

function trim(value: number) {
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, "");
}

export function number(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function percent(value?: number | null, digits = 0) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDate(value?: string | null, style: "short" | "long" | "month" = "short") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (style === "month") return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  if (style === "long") return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return `${days}d ago`;
  if (Math.abs(days) < 30) return `${Math.round(days / 7)}w ago`;
  return formatDate(value);
}

export function dueLabel(value?: string | null, completed?: boolean) {
  if (!value) return { label: "No due date", tone: "muted" as const };
  const date = new Date(value);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (completed) return { label: formatDate(value), tone: "muted" as const };
  if (diff < 0) return { label: diff === -1 ? "Yesterday" : `${Math.abs(diff)}d overdue`, tone: "danger" as const };
  if (diff === 0) return { label: "Today", tone: "warning" as const };
  if (diff === 1) return { label: "Tomorrow", tone: "warning" as const };
  return { label: formatDate(value, "short"), tone: "muted" as const };
}

export function toDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function fromDateInput(value: string) {
  if (!value) return null;
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

export function compactNumber(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function stageTone(color?: string | null) {
  return { backgroundColor: `${color ?? "#94a3b8"}18`, color: color ?? "#94a3b8", borderColor: `${color ?? "#94a3b8"}35` };
}

export function stripHtml(value?: string | null) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, "").trim();
}

export function pluralize(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function groupByDay<T>(items: T[], getDate: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const date = new Date(getDate(item));
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, value]) => ({ key, items: value }));
}
