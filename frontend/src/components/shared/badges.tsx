"use client";

import { cn, initials } from "@/lib/utils";
import { Avatar, Badge } from "@/components/ui/primitives";

const accountColors = [
  "from-indigo-500 to-violet-600",
  "from-teal-500 to-emerald-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
  "from-lime-500 to-green-600",
];

export function EntityMark({
  name,
  size = "md",
  className,
}: {
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-6 rounded-md text-[10px]",
    md: "size-8 rounded-lg text-[11px]",
    lg: "size-10 rounded-xl text-[13px]",
  };
  const color = accountColors[(name ? [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) : 0) % accountColors.length];

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br font-semibold text-white shadow-soft",
        color,
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "outline";

const statusTones: Record<string, Tone> = {
  Active: "success",
  Prospect: "info",
  Churned: "danger",
  Inactive: "neutral",
  New: "info",
  Contacted: "brand",
  Qualified: "success",
  Converted: "success",
  Unqualified: "neutral",
  Open: "info",
  Won: "success",
  Lost: "danger",
  Pending: "warning",
  Resolved: "success",
  Closed: "neutral",
  Draft: "neutral",
  Sent: "info",
  Accepted: "success",
  Declined: "danger",
  Expired: "warning",
  Paid: "success",
  PartiallyPaid: "brand",
  Overdue: "danger",
  Completed: "success",
  Cancelled: "neutral",
};

export function StatusBadge({
  status,
  className,
  dot = true,
}: {
  status?: string | null;
  className?: string;
  dot?: boolean;
}) {
  if (!status) return null;
  return (
    <Badge tone={statusTones[status] ?? "neutral"} dot={dot} className={className}>
      {status}
    </Badge>
  );
}

const priorityTones: Record<string, Tone> = {
  Urgent: "danger",
  High: "warning",
  Normal: "info",
  Low: "neutral",
};

export function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority || priority === "Normal") return <span className="text-[11.5px] text-muted">Normal</span>;
  return <Badge tone={priorityTones[priority] ?? "neutral"}>{priority}</Badge>;
}

export function OwnerCell({
  name,
  avatarUrl,
  size = "sm",
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: "xs" | "sm";
}) {
  if (!name) return <span className="text-[11.5px] text-faint">Unassigned</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar name={name} src={avatarUrl} size={size} />
      <span className="truncate text-[12px] text-foreground">{name}</span>
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? "success" : score >= 60 ? "info" : score >= 40 ? "warning" : "neutral";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-3">
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "success" && "bg-success",
            tone === "info" && "bg-info",
            tone === "warning" && "bg-warning",
            tone === "neutral" && "bg-faint",
          )}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </span>
      <span className="tabular-nums text-[11.5px] text-muted">{score}</span>
    </span>
  );
}
