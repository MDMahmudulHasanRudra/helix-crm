"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useAccounts, useContacts } from "@/lib/api";
import type { TicketDetail } from "@/lib/types";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";

const CHANNELS = ["Email", "Chat", "Phone", "Web", "Social"];

export function TicketDialog({
  open,
  onOpenChange,
  ticket,
  presetAccountId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket?: TicketDetail | null;
  presetAccountId?: string;
  onSaved?: (id: string) => void;
}) {
  const { users } = useWorkspace();
  const { data: accounts } = useAccounts({ page: 1, pageSize: 200 });
  const { data: contacts } = useContacts({ page: 1, pageSize: 200 });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    description: "",
    status: "Open",
    priority: "Normal",
    channel: "Email",
    accountId: "",
    contactId: "",
    assigneeId: "",
    slaDueAt: "",
    tags: "",
  });

  const availableContacts = useMemo(
    () => (contacts?.items ?? []).filter((contact) => !form.accountId || contact.accountId === form.accountId),
    [contacts, form.accountId],
  );

  useEffect(() => {
    if (!open) return;
    setForm({
      subject: ticket?.subject ?? "",
      description: ticket?.description ?? "",
      status: ticket?.status ?? "Open",
      priority: ticket?.priority ?? "Normal",
      channel: ticket?.channel ?? "Email",
      accountId: ticket?.accountId ?? presetAccountId ?? "",
      contactId: ticket?.contactId ?? "",
      assigneeId: ticket?.assigneeId ?? "",
      slaDueAt: ticket?.slaDueAt ? toLocalInput(ticket.slaDueAt) : "",
      tags: ticket?.tags?.join(", ") ?? "",
    });
  }, [open, ticket, presetAccountId]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        subject: form.subject,
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        channel: form.channel,
        accountId: form.accountId || null,
        contactId: form.contactId || null,
        assigneeId: form.assigneeId || null,
        slaDueAt: form.slaDueAt ? new Date(form.slaDueAt).toISOString() : null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      const saved = ticket
        ? await mutate<TicketDetail>(`/tickets/${ticket.id}`, "PUT", payload)
        : await mutate<{ id: string }>("/tickets", "POST", payload);
      await globalMutate((key) =>
        typeof key === "string" && (key.startsWith("/tickets") || key.startsWith("/accounts") || key.startsWith("/dashboard")),
      );
      toast.success(ticket ? "Ticket updated" : "Ticket created");
      onOpenChange(false);
      onSaved?.(saved.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save ticket");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={ticket ? `Edit ${ticket.number}` : "New ticket"}
          description="Capture a customer conversation and route it to the right teammate."
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <Field label="Subject" required>
              <Input value={form.subject} onChange={(event) => set("subject", event.target.value)} placeholder="e.g. Cannot export invoice history" autoFocus />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(event) => set("description", event.target.value)} rows={3} placeholder="What did the customer report?" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Status">
                <NativeSelect value={form.status} onChange={(event) => set("status", event.target.value)}>
                  {["Open", "Pending", "Resolved", "Closed"].map((option) => <option key={option} value={option}>{option}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Priority">
                <NativeSelect value={form.priority} onChange={(event) => set("priority", event.target.value)}>
                  {["Low", "Normal", "High", "Urgent"].map((option) => <option key={option} value={option}>{option}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Channel">
                <NativeSelect value={form.channel} onChange={(event) => set("channel", event.target.value)}>
                  {CHANNELS.map((option) => <option key={option} value={option}>{option}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Assignee">
                <NativeSelect value={form.assigneeId} onChange={(event) => set("assigneeId", event.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Account">
                <NativeSelect value={form.accountId} onChange={(event) => { set("accountId", event.target.value); set("contactId", ""); }}>
                  <option value="">No account</option>
                  {(accounts?.items ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Contact">
                <NativeSelect value={form.contactId} onChange={(event) => set("contactId", event.target.value)}>
                  <option value="">No contact</option>
                  {availableContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}</option>)}
                </NativeSelect>
              </Field>
              <Field label="SLA due" hint="Defaults to 24h urgent / 72h normal">
                <Input type="datetime-local" value={form.slaDueAt} onChange={(event) => set("slaDueAt", event.target.value)} />
              </Field>
              <Field label="Tags" hint="Comma separated">
                <Input value={form.tags} onChange={(event) => set("tags", event.target.value)} placeholder="Billing, Escalation" />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{ticket ? "Save changes" : "Create ticket"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
