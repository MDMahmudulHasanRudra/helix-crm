"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Inbox,
  Link2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import {
  mutate,
  useEmailAccounts,
  useEmailOutbox,
  useEmailStatus,
  useEmailSuppressions,
  useInboundEmail,
  useTickets,
} from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Field, Input, NativeSelect, SearchInput, Textarea } from "@/components/ui/fields";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDateTime, relativeTime } from "@/lib/utils";
import type { EmailAccount, EmailMessage } from "@/lib/types";

const refreshEmail = () => globalMutate((key) => typeof key === "string" && key.startsWith("/email"));

const TABS = [
  { value: "mailboxes", label: "Mailboxes", icon: Server },
  { value: "outbox", label: "Outbox", icon: Send },
  { value: "review", label: "Review queue", icon: Inbox },
  { value: "suppressions", label: "Suppressions", icon: ShieldAlert },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export function EmailSettings() {
  const [tab, setTab] = useState<TabValue>("mailboxes");
  const { data: status } = useEmailStatus();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="Mailboxes" value={status ? String(status.accounts) : "—"} detail={status?.defaultAddress ?? "None configured"} />
        <Stat label="Sent today" value={status ? `${status.sentToday}/${status.dailyLimit}` : "—"} detail="Daily safety cap" />
        <Stat label="In queue" value={status ? String(status.queued) : "—"} detail={status?.failed ? `${status.failed} failed` : "No failures"} danger={Boolean(status?.failed)} />
        <Stat label="Needs review" value={status ? String(status.review) : "—"} detail={status?.lastSyncAt ? `Polled ${relativeTime(status.lastSyncAt)}` : "IMAP not synced yet"} />
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors " +
                (selected ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground")
              }
            >
              <Icon className="size-3" /> {item.label}
              {item.value === "review" && status?.review ? <Badge tone="warning">{status.review}</Badge> : null}
            </button>
          );
        })}
      </div>

      {tab === "mailboxes" ? <Mailboxes /> : null}
      {tab === "outbox" ? <Outbox /> : null}
      {tab === "review" ? <ReviewQueue /> : null}
      {tab === "suppressions" ? <Suppressions /> : null}
    </div>
  );
}

function Stat({ label, value, detail, danger }: { label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <div className={"rounded-xl border bg-surface p-3 shadow-soft " + (danger ? "border-danger/30" : "border-border")}>
      <div className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{label}</div>
      <div className={"mt-1.5 truncate text-[18px] font-semibold leading-none tracking-tight " + (danger ? "text-danger" : "text-foreground")}>{value}</div>
      <div className="mt-1.5 truncate text-[11px] text-muted">{detail}</div>
    </div>
  );
}

function Mailboxes() {
  const { me } = useWorkspace();
  const canManage = me.user.role === "Admin" || me.user.role === "Manager";
  const { data: accounts, isLoading } = useEmailAccounts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmailAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  async function test(account: EmailAccount) {
    setTesting(account.id);
    try {
      const result = await mutate<{ check: { smtpOk: boolean; imapOk: boolean } }>(`/email/accounts/${account.id}/test`, "POST");
      await refreshEmail();
      if (result.check.smtpOk && (!account.imapEnabled || result.check.imapOk)) {
        toast.success("SMTP and IMAP connections succeeded");
      } else if (result.check.smtpOk) {
        toast.warning("SMTP works, but IMAP failed. Check the host, port and password.");
      } else {
        toast.error("SMTP connection failed. Check the host, port, security mode and password.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to test the mailbox");
    } finally {
      setTesting(null);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mutate(`/email/accounts/${deleteTarget.id}`, "DELETE");
      await refreshEmail();
      toast.success("Mailbox removed");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove the mailbox");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Mailboxes</h2>
          <p className="text-[11.5px] text-muted">
            Outbound mail sends through SMTP. Replies are polled from IMAP and matched to tickets by headers, then by the [#TCK-…] subject token.
          </p>
        </div>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="size-3.5" /> Add mailbox
          </Button>
        ) : null}
      </div>

      {isLoading && !accounts ? (
        <Card className="space-y-1.5 p-3">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)}</Card>
      ) : accounts && accounts.length ? (
        accounts.map((account) => (
          <Card key={account.id}>
            <CardHeader
              title={account.name || account.fromAddress}
              subtitle={`${account.fromName ? `${account.fromName} · ` : ""}${account.fromAddress}`}
              icon={<Mail className="size-3.5" />}
              action={
                <div className="flex items-center gap-1">
                  {account.isDefault ? <Badge tone="brand">Default</Badge> : null}
                  {!account.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                  <Badge tone={account.imapEnabled ? "info" : "outline"}>IMAP {account.imapEnabled ? "on" : "off"}</Badge>
                </div>
              }
            />
            <div className="grid gap-3 border-t border-border px-4 py-3 text-[11.5px] sm:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint">SMTP</div>
                <div className="mt-0.5 text-foreground">{account.smtpHost}:{account.smtpPort} · {account.smtpSecurity}</div>
                <div className="text-faint">{account.smtpUsername || "No auth"} · {account.hasSmtpPassword ? "password saved" : "no password"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint">IMAP</div>
                <div className="mt-0.5 text-foreground">{account.imapHost || "Not configured"}{account.imapHost ? `:${account.imapPort} · ${account.imapSecurity}` : ""}</div>
                <div className="text-faint">{account.imapFolder || "INBOX"} · {account.lastImapSyncAt ? `synced ${relativeTime(account.lastImapSyncAt)}` : "never synced"}</div>
              </div>
              {account.lastError ? (
                <div className="sm:col-span-2">
                  <div className="flex items-start gap-1.5 rounded-md border border-danger/25 bg-danger-soft/40 px-2 py-1.5 text-[11px] text-danger">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    <span className="break-words">{account.lastError}</span>
                  </div>
                </div>
              ) : null}
              <div className="text-[10.5px] text-faint sm:col-span-2">
                {account.lastVerifiedAt ? `Last verified ${formatDateTime(account.lastVerifiedAt)}` : "Not verified yet"}
              </div>
            </div>
            {canManage ? (
              <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-border px-3 py-2">
                <Button size="xs" variant="secondary" loading={testing === account.id} onClick={() => void test(account)}>
                  <RefreshCw className="size-3" /> Test connection
                </Button>
                <Button size="xs" variant="ghost" onClick={() => { setEditing(account); setDialogOpen(true); }}>
                  <Pencil className="size-3" /> Edit
                </Button>
                <IconButton size="icon-sm" variant="ghost" aria-label="Remove mailbox" onClick={() => setDeleteTarget(account)}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            ) : null}
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState
            icon={<Mail />}
            title="No mailbox configured"
            description="Until a mailbox is added, ticket replies and quote emails stay queued and nothing is sent."
            compact
            action={canManage ? <Button variant="primary" size="xs" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="size-3" /> Add mailbox</Button> : undefined}
          />
        </Card>
      )}

      <MailboxDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Remove ${deleteTarget.name || deleteTarget.fromAddress}?` : "Remove mailbox?"}
        description="Queued mail that has not been sent will fail. History is kept."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function MailboxDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (open: boolean) => void; account: EmailAccount | null }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    fromName: "",
    fromAddress: "",
    replyToAddress: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecurity: "StartTls",
    smtpUsername: "",
    smtpPassword: "",
    imapHost: "",
    imapPort: "993",
    imapSecurity: "SslOnConnect",
    imapUsername: "",
    imapPassword: "",
    imapFolder: "INBOX",
    imapEnabled: true,
    isActive: true,
    isDefault: false,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: account?.name ?? "",
      fromName: account?.fromName ?? "",
      fromAddress: account?.fromAddress ?? "",
      replyToAddress: account?.replyToAddress ?? "",
      smtpHost: account?.smtpHost ?? "",
      smtpPort: String(account?.smtpPort ?? 587),
      smtpSecurity: account?.smtpSecurity ?? "StartTls",
      smtpUsername: account?.smtpUsername ?? "",
      smtpPassword: "",
      imapHost: account?.imapHost ?? "",
      imapPort: String(account?.imapPort ?? 993),
      imapSecurity: account?.imapSecurity ?? "SslOnConnect",
      imapUsername: account?.imapUsername ?? "",
      imapPassword: "",
      imapFolder: account?.imapFolder ?? "INBOX",
      imapEnabled: account?.imapEnabled ?? true,
      isActive: account?.isActive ?? true,
      isDefault: account?.isDefault ?? false,
    });
  }, [open, account]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.fromAddress.trim() || !form.smtpHost.trim()) {
      toast.error("A from address and SMTP host are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim() || undefined,
        fromName: form.fromName.trim(),
        fromAddress: form.fromAddress.trim(),
        replyToAddress: form.replyToAddress.trim() || undefined,
        smtpHost: form.smtpHost.trim(),
        smtpPort: Number(form.smtpPort) || 587,
        smtpSecurity: form.smtpSecurity,
        smtpUsername: form.smtpUsername.trim(),
        smtpPassword: form.smtpPassword || undefined,
        imapHost: form.imapHost.trim(),
        imapPort: Number(form.imapPort) || 993,
        imapSecurity: form.imapSecurity,
        imapUsername: form.imapUsername.trim() || form.smtpUsername.trim(),
        imapPassword: form.imapPassword || undefined,
        imapFolder: form.imapFolder.trim() || "INBOX",
        imapEnabled: form.imapEnabled,
        isActive: form.isActive,
        isDefault: form.isDefault,
      };
      if (account) await mutate(`/email/accounts/${account.id}`, "PUT", payload);
      else await mutate("/email/accounts", "POST", payload);
      await refreshEmail();
      toast.success(account ? "Mailbox updated" : "Mailbox added");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the mailbox");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={account ? `Edit ${account.name || account.fromAddress}` : "Add mailbox"}
          description="Passwords are encrypted at rest. Leave a password blank to keep the saved one."
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Label">
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Support inbox" />
              </Field>
              <Field label="From name">
                <Input value={form.fromName} onChange={(event) => setForm({ ...form, fromName: event.target.value })} placeholder="Acme Support" />
              </Field>
              <Field label="From address" required>
                <Input type="email" value={form.fromAddress} onChange={(event) => setForm({ ...form, fromAddress: event.target.value })} placeholder="support@acme.com" />
              </Field>
              <Field label="Reply-to" hint="Optional">
                <Input type="email" value={form.replyToAddress} onChange={(event) => setForm({ ...form, replyToAddress: event.target.value })} placeholder="help@acme.com" />
              </Field>
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
                <Send className="size-3" /> SMTP (outbound)
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Host" required>
                  <Input value={form.smtpHost} onChange={(event) => setForm({ ...form, smtpHost: event.target.value })} placeholder="smtp.acme.com" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Port">
                    <Input value={form.smtpPort} onChange={(event) => setForm({ ...form, smtpPort: event.target.value })} inputMode="numeric" />
                  </Field>
                  <Field label="Security">
                    <NativeSelect value={form.smtpSecurity} onChange={(event) => setForm({ ...form, smtpSecurity: event.target.value })}>
                      <option value="StartTls">STARTTLS</option>
                      <option value="SslOnConnect">SSL/TLS</option>
                      <option value="None">None</option>
                    </NativeSelect>
                  </Field>
                </div>
                <Field label="Username">
                  <Input value={form.smtpUsername} onChange={(event) => setForm({ ...form, smtpUsername: event.target.value })} autoComplete="off" />
                </Field>
                <Field label="Password" hint={account?.hasSmtpPassword ? "Leave blank to keep the saved password" : undefined}>
                  <Input type="password" value={form.smtpPassword} onChange={(event) => setForm({ ...form, smtpPassword: event.target.value })} autoComplete="new-password" />
                </Field>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
                  <Inbox className="size-3" /> IMAP (inbound)
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
                  <input type="checkbox" checked={form.imapEnabled} onChange={(event) => setForm({ ...form, imapEnabled: event.target.checked })} />
                  Poll this mailbox
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Host">
                  <Input value={form.imapHost} onChange={(event) => setForm({ ...form, imapHost: event.target.value })} placeholder="imap.acme.com" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Port">
                    <Input value={form.imapPort} onChange={(event) => setForm({ ...form, imapPort: event.target.value })} inputMode="numeric" />
                  </Field>
                  <Field label="Security">
                    <NativeSelect value={form.imapSecurity} onChange={(event) => setForm({ ...form, imapSecurity: event.target.value })}>
                      <option value="SslOnConnect">SSL/TLS</option>
                      <option value="StartTls">STARTTLS</option>
                      <option value="None">None</option>
                    </NativeSelect>
                  </Field>
                </div>
                <Field label="Username">
                  <Input value={form.imapUsername} onChange={(event) => setForm({ ...form, imapUsername: event.target.value })} placeholder="Defaults to the SMTP username" autoComplete="off" />
                </Field>
                <Field label="Password" hint={account?.hasImapPassword ? "Leave blank to keep the saved password" : undefined}>
                  <Input type="password" value={form.imapPassword} onChange={(event) => setForm({ ...form, imapPassword: event.target.value })} autoComplete="new-password" />
                </Field>
                <Field label="Folder">
                  <Input value={form.imapFolder} onChange={(event) => setForm({ ...form, imapFolder: event.target.value })} placeholder="INBOX" />
                </Field>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
                Active
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted">
                <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
                Use as the default sender
              </label>
            </div>
            <p className="text-[10.5px] text-faint">
              The first poll records the current mailbox position; older messages are not imported. New mail is matched and the rest lands in the review queue.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{account ? "Save mailbox" : "Add mailbox"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Outbox() {
  const { me } = useWorkspace();
  const canManage = me.user.role === "Admin" || me.user.role === "Manager";
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useEmailOutbox({ status: status || undefined, search: search || undefined, pageSize: 50 });
  const [retrying, setRetrying] = useState<string | null>(null);

  async function retry(message: EmailMessage) {
    setRetrying(message.id);
    try {
      await mutate(`/email/outbox/${message.id}/retry`, "POST");
      await refreshEmail();
      toast.success("Message queued again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to retry the message");
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Outbox</h2>
          <p className="text-[11.5px] text-muted">Every outbound message is stored here before delivery. Failed sends retry with backoff.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect value={status} onChange={(event) => setStatus(event.target.value)} className="h-8 w-[130px]">
            <option value="">All statuses</option>
            <option value="Queued">Queued</option>
            <option value="Sending">Sending</option>
            <option value="Sent">Sent</option>
            <option value="Failed">Failed</option>
            <option value="Suppressed">Suppressed</option>
          </NativeSelect>
          <SearchInput value={search} onChange={setSearch} placeholder="Search subject or recipient…" className="w-full sm:w-[230px]" />
        </div>
      </div>

      {isLoading && !data ? (
        <Card className="space-y-1.5 p-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-lg" />)}</Card>
      ) : data && data.items.length ? (
        <Card>
          <div className="divide-y divide-border">
            {data.items.map((message) => (
              <div key={message.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-foreground">{message.subject}</span>
                    <EmailStatusBadge status={message.status} />
                    {message.attempts > 0 ? <Badge tone="outline">{message.attempts} attempt{message.attempts === 1 ? "" : "s"}</Badge> : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted">
                    To {message.toName ? `${message.toName} <${message.toAddress}>` : message.toAddress}
                    {message.relatedName ? ` · ${message.relatedName}` : ""}
                  </div>
                  {message.failureReason ? <div className="mt-0.5 line-clamp-2 text-[10.5px] text-danger">{message.failureReason}</div> : null}
                  <div className="mt-0.5 text-[10px] text-faint">
                    {message.sentAt ? `Sent ${formatDateTime(message.sentAt)}` : message.nextAttemptAt ? `Next retry ${formatDateTime(message.nextAttemptAt)}` : `Created ${relativeTime(message.createdAt)}`}
                  </div>
                </div>
                {canManage && message.status === "Failed" ? (
                  <Button size="xs" variant="secondary" loading={retrying === message.id} onClick={() => void retry(message)}>
                    <RefreshCw className="size-3" /> Retry
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<Send />} title="Nothing in the outbox" description="Replies, quotes and other outbound mail will appear here with their delivery status." compact />
        </Card>
      )}
    </div>
  );
}

function ReviewQueue() {
  const { data, isLoading } = useInboundEmail({ review: true, pageSize: 50 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  async function dismiss(message: EmailMessage) {
    setDismissing(message.id);
    try {
      await mutate(`/email/inbound/${message.id}/dismiss`, "POST");
      await refreshEmail();
      toast.success("Message dismissed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to dismiss the message");
    } finally {
      setDismissing(null);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[13px] font-semibold text-foreground">Review queue</h2>
        <p className="text-[11.5px] text-muted">
          Inbound mail that matched no ticket header or subject token. Nothing is guessed from the sender — link it to a ticket or dismiss it.
        </p>
      </div>

      {isLoading && !data ? (
        <Card className="space-y-1.5 p-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)}</Card>
      ) : data && data.items.length ? (
        <Card>
          <div className="divide-y divide-border">
            {data.items.map((message) => (
              <div key={message.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-foreground">{message.subject}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress} · {formatDateTime(message.receivedAt ?? message.createdAt)}
                  </div>
                  {message.preview ? <p className="mt-1 line-clamp-2 text-[11px] text-faint">{message.preview}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="xs" variant="secondary" onClick={() => setOpenId(message.id)}>
                    <Link2 className="size-3" /> Link
                  </Button>
                  <IconButton size="icon-sm" variant="ghost" aria-label="Dismiss message" loading={dismissing === message.id} onClick={() => void dismiss(message)}>
                    <X className="size-3.5" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<Inbox />} title="Nothing to review" description="Unmatched inbound mail will wait here until someone links it to a ticket." compact />
        </Card>
      )}

      <LinkDialog messageId={openId} onOpenChange={(open) => !open && setOpenId(null)} />
    </div>
  );
}

function LinkDialog({ messageId, onOpenChange }: { messageId: string | null; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [saving, setSaving] = useState(false);
  const { data } = useTickets({ search: search || undefined, pageSize: 8 });

  useEffect(() => {
    if (!messageId) return;
    setSearch("");
    setTicketId("");
  }, [messageId]);

  async function submit() {
    if (!messageId || !ticketId) {
      toast.error("Choose a ticket first");
      return;
    }
    setSaving(true);
    try {
      await mutate(`/email/inbound/${messageId}/link`, "POST", { ticketId });
      await refreshEmail();
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/tickets") || key.startsWith("/activities")));
      toast.success("Message linked to the ticket");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to link the message");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(messageId)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Link to a ticket" description="The message becomes part of the ticket conversation." />
        <DialogBody className="space-y-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search tickets by number or subject…" />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {data?.items.length ? data.items.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setTicketId(ticket.id)}
                className={
                  "flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors " +
                  (ticketId === ticket.id ? "border-brand/40 bg-brand-soft" : "border-border bg-surface hover:bg-surface-2")
                }
              >
                <span className="font-mono text-[10.5px] text-faint">{ticket.number}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{ticket.subject}</span>
                <Badge tone="outline">{ticket.status}</Badge>
              </button>
            )) : <p className="py-6 text-center text-[11.5px] text-faint">No tickets match.</p>}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="primary" loading={saving} disabled={!ticketId} onClick={() => void submit()}>Link message</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Suppressions() {
  const { me } = useWorkspace();
  const canManage = me.user.role === "Admin" || me.user.role === "Manager";
  const [search, setSearch] = useState("");
  const { data, isLoading } = useEmailSuppressions({ search: search || undefined, pageSize: 100 });
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setAdding(true);
    try {
      await mutate("/email/suppressions", "POST", { email: email.trim(), reason: "Manual", note: note.trim() || undefined });
      await refreshEmail();
      setEmail("");
      setNote("");
      toast.success("Address suppressed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to suppress the address");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    try {
      await mutate(`/email/suppressions/${id}`, "DELETE");
      await refreshEmail();
      toast.success("Address removed from the suppression list");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove the address");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[13px] font-semibold text-foreground">Suppressions</h2>
        <p className="text-[11.5px] text-muted">Suppressed addresses never receive mail. Bounced addresses are added automatically; you can still unsubscribe contacts by hand.</p>
      </div>

      {canManage ? (
        <Card>
          <CardHeader title="Suppress an address" subtitle="Blocks all automated mail to this recipient" icon={<ShieldAlert className="size-3.5" />} />
          <form onSubmit={add} className="grid gap-3 border-t border-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Field label="Email">
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" />
            </Field>
            <Field label="Note" hint="Why this address is blocked">
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Asked to stop email" />
            </Field>
            <Button type="submit" variant="primary" loading={adding}><Plus className="size-3.5" /> Suppress</Button>
          </form>
        </Card>
      ) : null}

      <div className="flex items-center justify-end">
        <SearchInput value={search} onChange={setSearch} placeholder="Search suppressions…" className="w-full sm:w-[240px]" />
      </div>

      {isLoading && !data ? (
        <Card className="space-y-1.5 p-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}</Card>
      ) : data && data.items.length ? (
        <Card>
          <div className="divide-y divide-border">
            {data.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-foreground">{item.email}</div>
                  <div className="truncate text-[10.5px] text-faint">{item.reason}{item.note ? ` · ${item.note}` : ""} · {relativeTime(item.createdAt)}</div>
                </div>
                {canManage ? (
                  <IconButton size="icon-sm" variant="ghost" aria-label="Remove suppression" loading={removing === item.id} onClick={() => void remove(item.id)}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<ShieldAlert />} title="No suppressed addresses" description="Bounced recipients and manual unsubscribes appear here." compact />
        </Card>
      )}
    </div>
  );
}

export function EmailStatusBadge({ status }: { status: string }) {
  const tone =
    status === "Sent" ? "success"
      : status === "Failed" || status === "Suppressed" ? "danger"
        : status === "Queued" || status === "Sending" || status === "Received" ? "info"
          : "neutral";
  return <Badge tone={tone} dot>{status}</Badge>;
}
