"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  List,
  Pencil,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useActivities } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { cn, dueLabel, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button, IconButton } from "@/components/ui/button";
import { NativeSelect, SearchInput } from "@/components/ui/fields";
import { Avatar, Badge, EmptyState, SegmentedControl, Skeleton } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/shared/data-table";
import { ActivityIcon } from "@/components/shared/activity-feed";
import { PriorityBadge } from "@/components/shared/badges";
import { ActivityDialog } from "@/components/shared/activity-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Activity } from "@/lib/types";

const PAGE_SIZE = 25;
const TYPES = ["Task", "Call", "Email", "Meeting", "Note"];

export default function ActivitiesPage() {
  const { users } = useWorkspace();
  const [view, setView] = useState<"grouped" | "table">("grouped");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [due, setDue] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, mutate: refresh } = useActivities({
    search,
    type,
    status,
    due,
    ownerId,
    sort: "dueAt",
    dir: "asc",
    page: view === "grouped" ? 1 : page,
    pageSize: view === "grouped" ? 200 : PAGE_SIZE,
  });

  const activities = data?.items ?? [];

  const summary = useMemo(() => {
    const now = Date.now();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      open: activities.filter((item) => item.status === "Open").length,
      overdue: activities.filter((item) => item.status === "Open" && item.dueAt && new Date(item.dueAt).getTime() < now).length,
      today: activities.filter((item) => item.dueAt && new Date(item.dueAt) >= start && new Date(item.dueAt) < end).length,
      completed: activities.filter((item) => item.status === "Completed").length,
    };
  }, [activities]);

  const groups = useMemo(() => groupActivities(activities), [activities]);

  const columns = useMemo<Column<Activity>[]>(
    () => [
      {
        key: "subject",
        header: "Activity",
        width: "30%",
        render: (activity) => (
          <div className="flex min-w-0 items-center gap-2">
            <ActivityIcon type={activity.type} />
            <div className="min-w-0">
              <div className={cn("truncate text-[12.5px] font-medium text-foreground", activity.status === "Completed" && activity.type === "Task" && "line-through text-muted")}>
                {activity.subject}
              </div>
              <div className="truncate text-[10.5px] text-muted">{activity.type}{activity.relatedName ? ` · ${activity.relatedName}` : ""}</div>
            </div>
          </div>
        ),
      },
      {
        key: "related",
        header: "Related to",
        width: "18%",
        render: (activity) =>
          activity.relatedName ? (
            <Link href={`/${activity.relatedType.toLowerCase()}s/${activity.relatedId}`} className="truncate text-[12px] text-muted hover:text-foreground">
              {activity.relatedName}
            </Link>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      { key: "priority", header: "Priority", width: "95px", render: (activity) => <PriorityBadge priority={activity.priority} /> },
      {
        key: "due",
        header: "Due",
        width: "120px",
        render: (activity) => <DueLabel activity={activity} />,
      },
      {
        key: "owner",
        header: "Owner",
        width: "150px",
        render: (activity) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={activity.ownerName} src={activity.ownerAvatarUrl} size="xs" />
            <span className="truncate text-[12px]">{activity.ownerName ?? "Unassigned"}</span>
          </span>
        ),
      },
      { key: "status", header: "Status", width: "95px", render: (activity) => <Badge tone={activity.status === "Completed" ? "success" : activity.status === "Cancelled" ? "neutral" : "info"} dot>{activity.status}</Badge> },
    ],
    [],
  );

  async function toggle(activity: Activity) {
    try {
      await mutate(`/activities/${activity.id}/complete`, "PATCH", { completed: activity.status !== "Completed" });
      await refresh();
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/dashboard") || key.startsWith("/activities")));
      toast.success(activity.status === "Completed" ? "Task reopened" : "Task completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update activity");
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mutate(`/activities/${deleteTarget.id}`, "DELETE");
      await refresh();
      toast.success("Activity deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete activity");
    } finally {
      setDeleting(false);
    }
  }

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(activity: Activity) {
    setEditing(activity);
    setDialogOpen(true);
  }

  const hasFilters = Boolean(search || type || status || due || ownerId);

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Activities"
        subtitle={data ? `${data.total} total · ${summary.open} open · ${summary.overdue} overdue · ${summary.today} due today` : "Calls, emails, meetings, tasks and notes across the workspace"}
        actions={
          <>
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: "grouped", label: <><Rows3 /> Timeline</> },
                { value: "table", label: <><List /> Table</> },
              ]}
            />
            <Button variant="primary" size="sm" onClick={openNew}>
              <Plus className="size-3.5" /> Log activity
            </Button>
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Open", value: summary.open, icon: <Circle className="size-3.5" />, tone: "text-info" },
          { label: "Overdue", value: summary.overdue, icon: <AlarmClock className="size-3.5" />, tone: "text-danger" },
          { label: "Due today", value: summary.today, icon: <CalendarClock className="size-3.5" />, tone: "text-warning" },
          { label: "Completed", value: summary.completed, icon: <CheckCircle2 className="size-3.5" />, tone: "text-success" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
              <span className={item.tone}>{item.icon}</span>
            </div>
            <div className="mt-1.5 text-[19px] font-semibold leading-none tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1.5 text-[11px] text-muted">{item.label === "Completed" ? "All time in view" : "Needs attention"}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search activities…" className="w-full sm:w-[240px]" />
        <NativeSelect value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[120px] text-[12px]">
          <option value="">All types</option>
          {TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
        </NativeSelect>
        <NativeSelect value={due} onChange={(event) => { setDue(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[130px] text-[12px]">
          <option value="">Any date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Today</option>
          <option value="week">Next 7 days</option>
          <option value="upcoming">Upcoming</option>
        </NativeSelect>
        <NativeSelect value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[125px] text-[12px]">
          <option value="">Any status</option>
          <option value="Open">Open</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </NativeSelect>
        <NativeSelect value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[140px] text-[12px]">
          <option value="">All owners</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
        </NativeSelect>
        <Badge tone="outline" className="ml-auto">{data?.total ?? 0} activities</Badge>
      </div>

      {view === "table" ? (
        <div className="mt-2.5">
          <DataTable
            columns={columns}
            rows={activities}
            loading={isLoading}
            onRowClick={openEdit}
            emptyTitle="No activities found"
            emptyDescription="Try different filters, or log your first activity."
            emptyAction={<Button variant="primary" size="sm" onClick={openNew}><Plus className="size-3.5" /> Log activity</Button>}
            footer={data && data.total > 0 ? <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} /> : null}
          />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-[62px] rounded-xl" />)}
            </div>
          ) : groups.length ? (
            groups.map((group) => (
              <section key={group.key}>
                <div className="mb-1.5 flex items-center gap-2">
                  <h2 className={cn("text-[11px] font-semibold uppercase tracking-[0.06em]", group.tone)}>{group.label}</h2>
                  <span className="text-[10.5px] text-faint">{group.items.length}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
                  <div className="divide-y divide-border">
                    {group.items.map((activity) => (
                      <ActivityListRow
                        key={activity.id}
                        activity={activity}
                        onEdit={() => openEdit(activity)}
                        onToggle={() => void toggle(activity)}
                        onDelete={() => setDeleteTarget(activity)}
                      />
                    ))}
                  </div>
                </div>
              </section>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border">
              <EmptyState
                icon={<ActivityIconType />}
                title={hasFilters ? "No activities match these filters" : "Nothing scheduled yet"}
                description={hasFilters ? "Try widening your date range or clearing filters." : "Log a call, email or meeting against any account, contact, lead, deal or ticket."}
                action={<Button variant="primary" size="sm" onClick={openNew}><Plus className="size-3.5" /> Log activity</Button>}
              />
            </div>
          )}
        </div>
      )}

      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        activity={editing}
        onSaved={() => void refresh()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.subject}"?` : "Delete activity?"}
        description="This removes the activity from timelines and reporting."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function ActivityIconType() {
  return <Check className="size-4" />;
}

function ActivityListRow({
  activity,
  onEdit,
  onToggle,
  onDelete,
}: {
  activity: Activity;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const completed = activity.status === "Completed";
  return (
    <div
      onClick={onEdit}
      className="group flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2/40"
    >
      {activity.type === "Task" ? (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggle(); }}
          aria-label={completed ? "Reopen task" : "Complete task"}
          className={cn(
            "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
            completed ? "border-success bg-success text-white" : "border-border-strong hover:border-success hover:bg-success-soft",
          )}
        >
          {completed ? <Check className="size-2.5" /> : null}
        </button>
      ) : (
        <ActivityIcon type={activity.type} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={cn("truncate text-[12.5px] font-medium text-foreground", completed && activity.type === "Task" && "text-muted line-through")}>
              {activity.subject}
            </div>
            {activity.body ? <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted">{activity.body}</p> : null}
          </div>
          <DueLabel activity={activity} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-faint">
          <span className="inline-flex items-center gap-1">
            <Avatar name={activity.ownerName} src={activity.ownerAvatarUrl} size="xs" />
            {activity.ownerName ?? "Unassigned"}
          </span>
          <span>·</span>
          <span>{activity.type}</span>
          <PriorityBadge priority={activity.priority} />
          {activity.relatedName ? (
            <>
              <span>·</span>
              <Link
                href={`/${activity.relatedType.toLowerCase()}s/${activity.relatedId}`}
                onClick={(event) => event.stopPropagation()}
                className="truncate text-muted hover:text-foreground"
              >
                {activity.relatedName}
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton size="icon-sm" variant="ghost" aria-label="Edit activity" onClick={(event) => { event.stopPropagation(); onEdit(); }}>
          <Pencil className="size-3.5" />
        </IconButton>
        <IconButton size="icon-sm" variant="ghost" aria-label="Delete activity" onClick={(event) => { event.stopPropagation(); onDelete(); }}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

function DueLabel({ activity }: { activity: Activity }) {
  if (activity.status === "Completed") {
    return <span className="shrink-0 text-[10px] text-faint">{activity.completedAt ? relativeTime(activity.completedAt) : "Done"}</span>;
  }
  const due = dueLabel(activity.dueAt);
  if (!activity.dueAt) {
    return <span className="shrink-0 text-[10px] text-faint">{relativeTime(activity.createdAt)}</span>;
  }
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        due.tone === "danger" && "bg-danger-soft text-danger",
        due.tone === "warning" && "bg-warning-soft text-warning",
        due.tone === "muted" && "text-faint",
      )}
    >
      {due.label}
    </span>
  );
}

function groupActivities(items: Activity[]) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(start);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(start);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const buckets: { key: string; label: string; tone: string; items: Activity[] }[] = [
    { key: "overdue", label: "Overdue", tone: "text-danger", items: [] },
    { key: "today", label: "Today", tone: "text-warning", items: [] },
    { key: "tomorrow", label: "Tomorrow", tone: "text-foreground", items: [] },
    { key: "week", label: "This week", tone: "text-foreground", items: [] },
    { key: "later", label: "Later", tone: "text-muted", items: [] },
    { key: "none", label: "No due date", tone: "text-muted", items: [] },
    { key: "completed", label: "Completed", tone: "text-success", items: [] },
  ];

  for (const activity of items) {
    if (activity.status === "Completed") {
      buckets[6].items.push(activity);
      continue;
    }
    if (!activity.dueAt) {
      buckets[5].items.push(activity);
      continue;
    }
    const due = new Date(activity.dueAt);
    if (due < now) buckets[0].items.push(activity);
    else if (due < tomorrow) buckets[1].items.push(activity);
    else if (due < new Date(tomorrow.getTime() + 86_400_000)) buckets[2].items.push(activity);
    else if (due < weekEnd) buckets[3].items.push(activity);
    else buckets[4].items.push(activity);
  }

  return buckets.filter((bucket) => bucket.items.length > 0);
}
