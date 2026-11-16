"use client";

import Link from "next/link";
import {
  CalendarClock,
  Check,
  Circle,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
} from "lucide-react";
import { cn, dueLabel, formatDateTime, relativeTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/primitives";
import type { Activity } from "@/lib/types";
import { mutate as apiMutate } from "@/lib/api";
import { useSWRConfig } from "swr";
import { toast } from "sonner";

const typeStyles: Record<string, { icon: React.ReactNode; className: string }> = {
  Call: { icon: <Phone className="size-3.5" />, className: "bg-info-soft text-info border-info/20" },
  Email: { icon: <Mail className="size-3.5" />, className: "bg-warning-soft text-warning border-warning/20" },
  Meeting: { icon: <Users className="size-3.5" />, className: "bg-brand-soft text-brand border-brand/20" },
  Task: { icon: <Check className="size-3.5" />, className: "bg-success-soft text-success border-success/20" },
  Note: { icon: <StickyNote className="size-3.5" />, className: "bg-surface-3 text-muted border-border" },
};

export function activityTypeStyle(type: string) {
  return typeStyles[type] ?? { icon: <MessageSquare className="size-3.5" />, className: "bg-surface-3 text-muted border-border" };
}

export function ActivityIcon({ type, className }: { type: string; className?: string }) {
  const style = activityTypeStyle(type);
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg border",
        style.className,
        className,
      )}
    >
      {style.icon}
    </span>
  );
}

export function ActivityRow({
  activity,
  showRelated = true,
  showComplete = false,
}: {
  activity: Activity;
  showRelated?: boolean;
  showComplete?: boolean;
}) {
  const { mutate } = useSWRConfig();
  const due = dueLabel(activity.dueAt, activity.status === "Completed");

  async function toggle() {
    try {
      await apiMutate(`/activities/${activity.id}/complete`, "PATCH", {
        completed: activity.status !== "Completed",
      });
      await mutate((key) => typeof key === "string" && key.startsWith("/activities"));
      await mutate("/dashboard");
      toast.success(activity.status === "Completed" ? "Task reopened" : "Task completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update task");
    }
  }

  return (
    <div className="group flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2/40">
      {showComplete && activity.type === "Task" ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={activity.status === "Completed" ? "Reopen task" : "Complete task"}
          className={cn(
            "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
            activity.status === "Completed"
              ? "border-success bg-success text-white"
              : "border-border-strong hover:border-success hover:bg-success-soft",
          )}
        >
          {activity.status === "Completed" ? <Check className="size-2.5" /> : null}
        </button>
      ) : (
        <ActivityIcon type={activity.type} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={cn(
                "truncate text-[12.5px] font-medium text-foreground",
                activity.status === "Completed" && activity.type === "Task" && "text-muted line-through",
              )}
            >
              {activity.subject}
            </div>
            {activity.body ? (
              <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">{activity.body}</p>
            ) : null}
          </div>
          {due.tone !== "muted" ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                due.tone === "danger" && "bg-danger-soft text-danger",
                due.tone === "warning" && "bg-warning-soft text-warning",
              )}
            >
              {due.label}
            </span>
          ) : activity.dueAt ? (
            <span className="shrink-0 text-[10px] text-faint">{formatDateTime(activity.dueAt)}</span>
          ) : (
            <span className="shrink-0 text-[10px] text-faint">{relativeTime(activity.createdAt)}</span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-faint">
          <span className="inline-flex items-center gap-1">
            <Avatar name={activity.ownerName} src={activity.ownerAvatarUrl} size="xs" />
            {activity.ownerName ?? "Unassigned"}
          </span>
          <span>·</span>
          <span>{activity.type}</span>
          {showRelated && activity.relatedName ? (
            <>
              <span>·</span>
              <Link
                href={`/${activity.relatedType.toLowerCase()}s/${activity.relatedId}`}
                className="truncate text-muted hover:text-foreground"
                onClick={(event) => event.stopPropagation()}
              >
                {activity.relatedName}
              </Link>
            </>
          ) : null}
          {activity.status === "Open" && activity.dueAt ? (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-2.5" />
                {due.label}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ActivityFeed({
  items,
  showRelated = true,
  showComplete = false,
  emptyLabel = "No activity recorded yet.",
}: {
  items: Activity[];
  showRelated?: boolean;
  showComplete?: boolean;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-8 text-[12px] text-muted">
        <Circle className="size-2.5" />
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="divide-y divide-border">
      {items.map((activity) => (
        <ActivityRow key={activity.id} activity={activity} showRelated={showRelated} showComplete={showComplete} />
      ))}
    </div>
  );
}
