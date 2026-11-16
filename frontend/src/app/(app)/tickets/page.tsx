"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  CheckCircle2,
  Download,
  Inbox,
  LayoutGrid,
  List,
  Plus,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { download, mutate, useTickets } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { NativeSelect, SearchInput } from "@/components/ui/fields";
import { Avatar, Badge, EmptyState, SegmentedControl, Skeleton } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/shared/data-table";
import { PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { TicketDialog } from "@/components/tickets/ticket-dialog";
import type { TicketListItem } from "@/lib/types";

const PAGE_SIZE = 25;
const BOARD_STATUSES = ["Open", "Pending", "Resolved", "Closed"] as const;
const statusAccent: Record<string, string> = {
  Open: "#0b7ec4",
  Pending: "#c98a0a",
  Resolved: "#0f9f6e",
  Closed: "#a1a1aa",
};

export default function TicketsPage() {
  const router = useRouter();
  const { users } = useWorkspace();
  const [view, setView] = useState<"table" | "board">("table");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [channel, setChannel] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, mutate: refresh } = useTickets({
    search,
    status: view === "board" ? "" : status,
    priority,
    channel,
    assigneeId,
    sort: "updatedAt",
    page: view === "board" ? 1 : page,
    pageSize: view === "board" ? 200 : PAGE_SIZE,
  });

  const tickets = data?.items ?? [];
  const summary = useMemo(() => {
    const now = Date.now();
    return {
      open: tickets.filter((ticket) => ticket.status === "Open").length,
      pending: tickets.filter((ticket) => ticket.status === "Pending").length,
      urgent: tickets.filter((ticket) => ticket.priority === "Urgent" && ticket.status !== "Resolved" && ticket.status !== "Closed").length,
      breached: tickets.filter(
        (ticket) =>
          ticket.status !== "Resolved" &&
          ticket.status !== "Closed" &&
          (ticket.slaBreached || (ticket.slaDueAt && new Date(ticket.slaDueAt).getTime() < now)),
      ).length,
    };
  }, [tickets]);

  const columns = useMemo<Column<TicketListItem>[]>(
    () => [
      {
        key: "subject",
        header: "Ticket",
        width: "30%",
        render: (ticket) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-[10.5px] text-faint">{ticket.number}</span>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-medium text-foreground">{ticket.subject}</div>
              <div className="truncate text-[10.5px] text-muted">{ticket.accountName ?? "No account"}{ticket.contactName ? ` · ${ticket.contactName}` : ""}</div>
            </div>
          </div>
        ),
      },
      { key: "status", header: "Status", width: "100px", render: (ticket) => <StatusBadge status={ticket.status} /> },
      { key: "priority", header: "Priority", width: "95px", render: (ticket) => <PriorityBadge priority={ticket.priority} /> },
      { key: "channel", header: "Channel", width: "95px", render: (ticket) => <span className="text-[11.5px] text-muted">{ticket.channel}</span> },
      {
        key: "sla",
        header: "SLA",
        width: "110px",
        render: (ticket) => <SlaLabel ticket={ticket} />,
      },
      {
        key: "assignee",
        header: "Assignee",
        width: "150px",
        render: (ticket) =>
          ticket.assigneeName ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar name={ticket.assigneeName} src={ticket.assigneeAvatarUrl} size="xs" />
              <span className="truncate text-[12px]">{ticket.assigneeName}</span>
            </span>
          ) : (
            <span className="text-faint">Unassigned</span>
          ),
      },
      { key: "updated", header: "Opened", align: "right", width: "105px", render: (ticket) => <span className="text-[11.5px] text-muted">{relativeTime(ticket.createdAt)}</span> },
    ],
    [],
  );

  async function moveTicket(ticket: TicketListItem, nextStatus: string) {
    if (ticket.status === nextStatus) return;
    try {
      await mutate(`/tickets/${ticket.id}/status`, "PATCH", { status: nextStatus });
      await refresh();
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/tickets") || key.startsWith("/dashboard") || key.startsWith("/reports")));
      toast.success(`Ticket marked ${nextStatus.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update ticket");
    }
  }

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Tickets"
        subtitle={data ? `${data.total} conversations · ${summary.open} open · ${summary.urgent} urgent · ${summary.breached} past SLA` : "Every customer conversation in a shared inbox"}
        actions={
          <>
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: "table", label: <><List /> List</> },
                { value: "board", label: <><LayoutGrid /> Board</> },
              ]}
            />
            <Button variant="outline" size="sm" onClick={() => download("/tickets/export")}>
              <Download className="size-3.5" /> Export
            </Button>
            <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3.5" /> New ticket
            </Button>
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Open", value: summary.open, icon: <Inbox className="size-3.5" />, tone: "text-info" },
          { label: "Pending", value: summary.pending, icon: <Timer className="size-3.5" />, tone: "text-warning" },
          { label: "Urgent", value: summary.urgent, icon: <TriangleAlert className="size-3.5" />, tone: "text-danger" },
          { label: "Past SLA", value: summary.breached, icon: <AlarmClock className="size-3.5" />, tone: "text-danger" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
              <span className={item.tone}>{item.icon}</span>
            </div>
            <div className="mt-1.5 text-[19px] font-semibold leading-none tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1.5 text-[11px] text-muted">In current view</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search subject, number, account…" className="w-full sm:w-[260px]" />
        {view === "table" ? (
          <NativeSelect value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[120px] text-[12px]">
            <option value="">All statuses</option>
            {BOARD_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
          </NativeSelect>
        ) : null}
        <NativeSelect value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[120px] text-[12px]">
          <option value="">All priorities</option>
          {["Urgent", "High", "Normal", "Low"].map((option) => <option key={option} value={option}>{option}</option>)}
        </NativeSelect>
        <NativeSelect value={channel} onChange={(event) => { setChannel(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[115px] text-[12px]">
          <option value="">All channels</option>
          {["Email", "Chat", "Phone", "Web", "Social"].map((option) => <option key={option} value={option}>{option}</option>)}
        </NativeSelect>
        <NativeSelect value={assigneeId} onChange={(event) => { setAssigneeId(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[140px] text-[12px]">
          <option value="">All assignees</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
        </NativeSelect>
        <Badge tone="outline" className="ml-auto">{data?.total ?? 0} tickets</Badge>
      </div>

      {view === "table" ? (
        <div className="mt-2.5">
          <DataTable
            columns={columns}
            rows={tickets}
            loading={isLoading}
            onRowClick={(ticket) => router.push(`/tickets/${ticket.id}`)}
            emptyTitle="No tickets found"
            emptyDescription="Adjust your filters, or start a new conversation."
            emptyAction={<Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}><Plus className="size-3.5" /> New ticket</Button>}
            footer={data && data.total > 0 ? <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} /> : null}
          />
        </div>
      ) : (
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_STATUSES.map((statusName) => {
            const items = tickets.filter((ticket) => ticket.status === statusName);
            return (
              <div
                key={statusName}
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={() => setDragOver(statusName)}
                onDragLeave={() => setDragOver((current) => (current === statusName ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(null);
                  const id = event.dataTransfer.getData("text/ticket-id");
                  const ticket = tickets.find((item) => item.id === id);
                  if (ticket) void moveTicket(ticket, statusName);
                }}
                className={cn(
                  "flex min-h-[280px] flex-col rounded-xl border bg-surface-2/40 transition-colors",
                  dragOver === statusName ? "border-brand/50 bg-brand-soft/30" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: statusAccent[statusName] }} />
                    <span className="text-[11.5px] font-semibold">{statusName}</span>
                    <span className="text-[10.5px] text-faint">{items.length}</span>
                  </div>
                  {statusName === "Resolved" ? <CheckCircle2 className="size-3 text-success" /> : null}
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[86px] rounded-lg" />)
                  ) : items.length ? (
                    items.map((ticket) => (
                      <div
                        key={ticket.id}
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData("text/ticket-id", ticket.id)}
                        onClick={() => router.push(`/tickets/${ticket.id}`)}
                        className="cursor-pointer rounded-lg border border-border bg-surface p-2.5 shadow-soft transition-colors hover:border-border-strong"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[10px] text-faint">{ticket.number}</span>
                          <PriorityBadge priority={ticket.priority} />
                        </div>
                        <div className="mt-1 truncate text-[12px] font-medium text-foreground">{ticket.subject}</div>
                        <div className="truncate text-[10.5px] text-muted">{ticket.accountName ?? ticket.contactName ?? "No account"}</div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <SlaLabel ticket={ticket} />
                          <Avatar name={ticket.assigneeName} src={ticket.assigneeAvatarUrl} size="xs" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex h-24 items-center justify-center text-[11px] text-faint">Drop tickets here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(id) => {
          void refresh();
          router.push(`/tickets/${id}`);
        }}
      />
    </div>
  );
}

function SlaLabel({ ticket }: { ticket: TicketListItem }) {
  if (!ticket.slaDueAt) return <span className="text-[10.5px] text-faint">—</span>;
  const done = ticket.status === "Resolved" || ticket.status === "Closed";
  const diff = new Date(ticket.slaDueAt).getTime() - Date.now();
  const breached = !done && (ticket.slaBreached || diff < 0);
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10.5px]", breached ? "font-medium text-danger" : "text-faint")}>
      <AlarmClock className="size-2.5" />
      {done ? formatDate(ticket.slaDueAt) : breached ? `Overdue ${splitDuration(-diff)}` : `Due in ${splitDuration(diff)}`}
      {!done && ticket.escalationLevel > 0 ? (
        <span className="rounded bg-danger-soft px-1 py-px text-[9px] font-semibold text-danger">
          L{ticket.escalationLevel}
        </span>
      ) : null}
    </span>
  );
}

function splitDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
