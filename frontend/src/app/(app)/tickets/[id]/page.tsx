"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlarmClock,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  Inbox,
  LifeBuoy,
  Lock,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  Send,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useCannedResponses, useTicket } from "@/lib/api";
import { cn, formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import { DetailField } from "@/components/ui/layout";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/overlays";
import { AuditTrail } from "@/components/shared/record-sections";
import { PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { TicketDialog } from "@/components/tickets/ticket-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useWorkspace } from "@/components/shell/workspace-provider";
import type { Activity } from "@/lib/types";

const STATUSES = ["Open", "Pending", "Resolved", "Closed"];

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { me, users } = useWorkspace();
  const { data: ticket, isLoading, mutate: refresh } = useTicket(params.id);
  const { data: cannedResponses } = useCannedResponses();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);

  if (isLoading && !ticket) return <DetailSkeleton />;

  if (!ticket) {
    return (
      <div className="grid place-items-center py-24">
        <EmptyState
          icon={<LifeBuoy />}
          title="Ticket not found"
          description="It may have been deleted, or you may not have access."
          action={<Button variant="primary" size="sm" asChild><Link href="/tickets">Back to tickets</Link></Button>}
        />
      </div>
    );
  }

  async function sendReply() {
    if (!reply.trim()) {
      toast.error("Write a reply first");
      return;
    }
    setSending(true);
    try {
      await mutate("/activities", "POST", {
        type: internal ? "Note" : "Email",
        subject: internal ? "Internal note" : `Re: ${ticket!.subject}`,
        body: reply,
        relatedType: "Ticket",
        relatedId: ticket!.id,
        ownerId: me.user.id,
        priority: "Normal",
      });
      setReply("");
      setInternal(false);
      await refresh();
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/tickets") || key.startsWith("/dashboard") || key.startsWith("/activities")));
      toast.success(internal ? "Internal note added" : "Reply sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send reply");
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: string) {
    setUpdating(true);
    try {
      await mutate(`/tickets/${ticket!.id}/status`, "PATCH", { status });
      await refresh();
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/tickets") || key.startsWith("/dashboard") || key.startsWith("/reports")));
      toast.success(`Ticket marked ${status.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update status");
    } finally {
      setUpdating(false);
    }
  }

  async function assign(assigneeId: string) {
    setUpdating(true);
    try {
      await mutate(`/tickets/${ticket!.id}/assign`, "PATCH", { assigneeId: assigneeId || null });
      await refresh();
      toast.success(assigneeId ? "Ticket reassigned" : "Ticket unassigned");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to assign ticket");
    } finally {
      setUpdating(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await mutate(`/tickets/${ticket!.id}`, "DELETE");
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/tickets") || key.startsWith("/dashboard") || key.startsWith("/reports")));
      toast.success("Ticket deleted");
      router.push("/tickets");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete ticket");
      setDeleting(false);
    }
  }

  const done = ticket.status === "Resolved" || ticket.status === "Closed";
  const slaDiff = ticket.slaDueAt ? new Date(ticket.slaDueAt).getTime() - Date.now() : null;
  const breached = !done && (ticket.slaBreached || (slaDiff !== null && slaDiff < 0));
  const ChannelIcon = channelIcon(ticket.channel);

  return (
    <div className="animate-in-fade">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted">
        <Link href="/tickets" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> Tickets
        </Link>
        <ChevronRight className="size-3 text-faint" />
        <span className="font-mono text-faint">{ticket.number}</span>
        <ChevronRight className="size-3 text-faint" />
        <span className="truncate text-foreground">{ticket.subject}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">
            <ChannelIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground">{ticket.subject}</h1>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              {!done && ticket.escalationLevel > 0 ? (
                <Badge tone="danger" dot>Escalated L{ticket.escalationLevel}</Badge>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span className="font-mono text-[11px] text-faint">{ticket.number}</span>
              <span>via {ticket.channel}</span>
              {ticket.accountId ? <Link href={`/accounts/${ticket.accountId}`} className="hover:text-foreground">{ticket.accountName}</Link> : <span>{ticket.accountName ?? "No account"}</span>}
              {ticket.contactId ? <Link href={`/contacts/${ticket.contactId}`} className="hover:text-foreground">{ticket.contactName}</Link> : null}
              <span className="inline-flex items-center gap-1">
                <Avatar name={ticket.assigneeName} src={ticket.assigneeAvatarUrl} size="xs" />
                {ticket.assigneeName ?? "Unassigned"}
              </span>
              <span className="text-faint">Opened {relativeTime(ticket.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!done ? (
            <Button variant="outline" size="sm" onClick={() => void setStatus("Resolved")} disabled={updating}>
              <CheckCircle2 className="size-3.5" /> Resolve
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void setStatus("Open")} disabled={updating}>
              <Circle className="size-3.5" /> Reopen
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Dropdown>
            <DropdownTrigger asChild>
              <IconButton variant="outline" aria-label="More actions"><MoreHorizontal className="size-4" /></IconButton>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<UserRound />} onSelect={() => void assign(me.user.id)}>
                Assign to me
              </DropdownItem>
              <DropdownItem icon={<UserRound />} onSelect={() => void assign("")}>
                Unassign
              </DropdownItem>
              <DropdownItem icon={<Lock />} onSelect={() => void setStatus("Closed")}>
                Close ticket
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleteOpen(true)}>
                Delete ticket
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Status", value: ticket.status, detail: done ? `Resolved ${formatDate(ticket.resolvedAt)}` : "Awaiting resolution", icon: <Inbox className="size-3.5" /> },
          { label: "Priority", value: ticket.priority, detail: `Channel: ${ticket.channel}`, icon: <AlarmClock className="size-3.5" /> },
          { label: "SLA due", value: ticket.slaDueAt ? formatDate(ticket.slaDueAt) : "—", detail: done ? "Conversation closed" : breached ? "SLA breached" : slaLabel(slaDiff), icon: <AlarmClock className="size-3.5" />, danger: breached },
          { label: "Messages", value: String(ticket.conversation.length + (ticket.description ? 1 : 0)), detail: ticket.firstResponseAt ? `First reply ${relativeTime(ticket.firstResponseAt)}` : "No reply yet", icon: <MessageSquare className="size-3.5" /> },
        ].map((item) => (
          <div key={item.label} className={cn("rounded-xl border bg-surface p-3 shadow-soft", item.danger ? "border-danger/30" : "border-border")}>
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
              <span className={item.danger ? "text-danger" : "text-faint"}>{item.icon}</span>
            </div>
            <div className={cn("mt-1.5 truncate text-[16px] font-semibold leading-none tracking-tight", item.danger ? "text-danger" : "text-foreground")}>{item.value}</div>
            <div className="mt-1.5 truncate text-[11px] text-muted">{item.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader
            title="Conversation"
            subtitle={`${ticket.conversation.length + 1} message${ticket.conversation.length ? "s" : ""} · ${ticket.channel}`}
            icon={<MessageSquare className="size-3.5" />}
          />

          <div className="border-t border-border">
            {ticket.description ? (
              <ChatMessage
                name={ticket.contactName ?? ticket.accountName ?? "Customer"}
                date={ticket.createdAt}
                body={ticket.description}
                kind="customer"
                badge={ticket.channel}
              />
            ) : null}
            {ticket.conversation.map((activity) => (
              <ActivityMessage key={activity.id} activity={activity} />
            ))}
          </div>

          <div className="border-t border-border bg-surface-2/30 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setInternal(false)}
                  className={cn("inline-flex h-6 items-center gap-1 rounded-[6px] px-2 text-[11px] font-medium transition-colors", !internal ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground")}
                >
                  <Mail className="size-3" /> Reply
                </button>
                <button
                  type="button"
                  onClick={() => setInternal(true)}
                  className={cn("inline-flex h-6 items-center gap-1 rounded-[6px] px-2 text-[11px] font-medium transition-colors", internal ? "bg-warning-soft text-warning" : "text-muted hover:text-foreground")}
                >
                  <Lock className="size-3" /> Internal note
                </button>
              </div>
              {cannedResponses && cannedResponses.length > 0 ? (
                <Dropdown>
                  <DropdownTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface px-2 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <Zap className="size-3 text-warning" /> Canned response
                    </button>
                  </DropdownTrigger>
                  <DropdownContent align="start" className="max-h-64 w-64 overflow-y-auto">
                    {cannedResponses.map((item) => (
                      <DropdownItem
                        key={item.id}
                        onSelect={() => {
                          setReply((prev) => (prev ? `${prev}\n\n${item.content}` : item.content));
                          toast.info(`Inserted "${item.title}"`);
                        }}
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-medium text-foreground">{item.title}</span>
                          <span className="font-mono text-[10px] text-faint">{item.shortcut} · {item.category}</span>
                        </div>
                      </DropdownItem>
                    ))}
                  </DropdownContent>
                </Dropdown>
              ) : null}
              <span className="text-[10.5px] text-faint">
                {internal ? "Only visible to your team" : `Sends a reply to ${ticket.contactName ?? ticket.accountName ?? "the customer"}`}
              </span>
            </div>
            <div className={cn("overflow-hidden rounded-lg border bg-surface", internal ? "border-warning/40" : "border-border focus-within:border-brand/50")}>
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder={internal ? "Add context for your teammates…" : "Write a reply…"}
                rows={3}
                className="w-full resize-y bg-transparent px-3 py-2.5 text-[12.5px] text-foreground placeholder:text-faint focus:outline-none"
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void sendReply();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
                <span className="text-[10px] text-faint">⌘↵ to send</span>
                <Button variant={internal ? "secondary" : "primary"} size="xs" loading={sending} onClick={() => void sendReply()}>
                  <Send className="size-3" /> {internal ? "Add note" : "Send reply"}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Status" subtitle="Update the conversation state" />
            <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={updating || ticket.status === status}
                  onClick={() => void setStatus(status)}
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium transition-colors disabled:opacity-100",
                    ticket.status === status
                      ? "border-brand/40 bg-brand-soft text-brand"
                      : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground",
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Assignment" subtitle="Who owns this conversation" />
            <div className="space-y-3 px-4 pb-4">
              <div className="flex items-center gap-2.5">
                <Avatar name={ticket.assigneeName} src={ticket.assigneeAvatarUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-foreground">{ticket.assigneeName ?? "Unassigned"}</div>
                  <div className="text-[10.5px] text-muted">Current assignee</div>
                </div>
                {ticket.assigneeId !== me.user.id ? (
                  <Button size="xs" variant="secondary" onClick={() => void assign(me.user.id)} disabled={updating}>
                    Assign me
                  </Button>
                ) : null}
              </div>
              <select
                value={ticket.assigneeId ?? ""}
                onChange={(event) => void assign(event.target.value)}
                disabled={updating}
                className="w-full cursor-pointer rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground focus:border-brand/60 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
              </select>
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <div className="space-y-3.5 px-4 pb-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Account</div>
                {ticket.accountId ? (
                  <Link href={`/accounts/${ticket.accountId}`} className="mt-1 flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                    {ticket.accountName} <ChevronRight className="size-3" />
                  </Link>
                ) : (
                  <div className="mt-1 text-[12.5px] text-muted">No account linked</div>
                )}
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Contact</div>
                {ticket.contactId ? (
                  <Link href={`/contacts/${ticket.contactId}`} className="mt-1 flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                    {ticket.contactName} <ChevronRight className="size-3" />
                  </Link>
                ) : (
                  <div className="mt-1 text-[12.5px] text-muted">No contact linked</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <DetailField label="Channel">{ticket.channel}</DetailField>
                <DetailField label="Priority">{ticket.priority}</DetailField>
                <DetailField label="Created">{formatDate(ticket.createdAt)}</DetailField>
                <DetailField label="Updated">{formatDateTime(ticket.updatedAt)}</DetailField>
                <DetailField label="First response">{ticket.firstResponseAt ? formatDateTime(ticket.firstResponseAt) : null}</DetailField>
                <DetailField label="Resolved">{ticket.resolvedAt ? formatDate(ticket.resolvedAt) : null}</DetailField>
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Tags</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {ticket.tags.length ? ticket.tags.map((tag) => <Badge key={tag} tone="outline">{tag}</Badge>) : <span className="text-[11.5px] text-faint">None</span>}
                </div>
              </div>
            </div>
          </Card>

          <AuditTrail entries={ticket.audit} />
        </div>
      </div>

      <TicketDialog open={editOpen} onOpenChange={setEditOpen} ticket={ticket} onSaved={() => void refresh()} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${ticket.number}?`}
        description="The conversation will be removed from the shared inbox."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function ChatMessage({
  name,
  date,
  body,
  kind,
  badge,
}: {
  name: string;
  date?: string | null;
  body: string;
  kind: "customer" | "agent" | "internal";
  badge?: string;
}) {
  const isCustomer = kind === "customer";
  return (
    <div className="flex items-start gap-2.5 px-4 py-3">
      <Avatar name={name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-foreground">{name}</span>
          {badge ? <Badge tone="neutral">{badge}</Badge> : null}
          {kind === "internal" ? <Badge tone="warning"><Lock className="size-2.5" /> Internal note</Badge> : null}
          <span className="text-[10.5px] text-faint">{formatDateTime(date)}</span>
        </div>
        <div
          className={cn(
            "mt-1.5 whitespace-pre-line rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed",
            isCustomer ? "border-border bg-surface-2/50 text-foreground" : kind === "internal" ? "border-warning/30 bg-warning-soft/50 text-foreground" : "border-brand/15 bg-brand-soft/40 text-foreground",
          )}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

function ActivityMessage({ activity }: { activity: Activity }) {
  const internal = activity.type === "Note";
  return (
    <ChatMessage
      name={activity.ownerName ?? "Team member"}
      date={activity.createdAt}
      body={activity.body ?? activity.subject}
      kind={internal ? "internal" : "agent"}
      badge={internal ? undefined : activity.type}
    />
  );
}

function channelIcon(channel: string) {
  switch (channel) {
    case "Phone":
      return Phone;
    default:
      return Mail;
  }
}

function slaLabel(diff: number | null) {
  if (diff === null) return "No SLA";
  if (diff < 0) return "SLA breached";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `Due in ${Math.max(1, Math.round(diff / 60_000))} minutes`;
  if (hours < 48) return `Due in ${hours} hours`;
  return `Due in ${Math.round(hours / 24)} days`;
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[84px] rounded-xl" />)}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <Skeleton className="h-[480px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    </div>
  );
}
