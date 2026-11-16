"use client";

import { useEffect, useState } from "react";
import { BellRing, ListChecks, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { mutate, useAutomations } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Field, Input, NativeSelect } from "@/components/ui/fields";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { AutomationRule } from "@/lib/types";

// Mirrors AutomationEvents in backend/src/HelixCrm.Api/Domain/Constants.cs.
const EVENTS = [
  { value: "LeadCreated", label: "Lead is created" },
  { value: "DealWon", label: "Deal is won" },
  { value: "TicketCreated", label: "Ticket is created" },
  { value: "QuoteAccepted", label: "Quote is accepted" },
];

const ACTIONS = [
  { value: "CreateTask", label: "Create a follow-up task" },
  { value: "SendNotification", label: "Notify the record owner" },
];

function readConfig(json: string): { taskSubject: string; durationDays: number } {
  try {
    const parsed = JSON.parse(json) as { taskSubject?: string; durationDays?: number };
    return { taskSubject: parsed.taskSubject ?? "", durationDays: parsed.durationDays ?? 1 };
  } catch {
    return { taskSubject: "", durationDays: 1 };
  }
}

export function AutomationsSettings() {
  const { me } = useWorkspace();
  const canManage = me.user.role === "Admin" || me.user.role === "Manager";
  const { data: rules, isLoading, mutate: refresh } = useAutomations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function toggle(rule: AutomationRule) {
    try {
      await mutate(`/automations/${rule.id}/toggle`, "PATCH");
      await refresh();
      toast.success(rule.isActive ? "Rule paused" : "Rule activated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update rule");
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mutate(`/automations/${deleteTarget.id}`, "DELETE");
      await refresh();
      toast.success("Rule deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete rule");
    } finally {
      setDeleting(false);
    }
  }

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Automation rules</h2>
          <p className="text-[11.5px] text-muted">When something happens in the CRM, create a task or notify the owner automatically.</p>
        </div>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={openNew}>
            <Plus className="size-3.5" /> New rule
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader
          title="Rules"
          subtitle={`${rules?.filter((rule) => rule.isActive).length ?? 0} active of ${rules?.length ?? 0}`}
          icon={<Workflow className="size-3.5" />}
        />
        <div className="border-t border-border">
          {isLoading && !rules ? (
            <div className="space-y-1.5 p-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}</div>
          ) : rules?.length ? (
            <div className="divide-y divide-border">
              {rules.map((rule) => {
                const config = readConfig(rule.actionConfigJson);
                return (
                  <div key={rule.id} className="group flex items-center gap-3 px-4 py-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                      {rule.actionType === "SendNotification" ? <BellRing className="size-3.5" /> : <ListChecks className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-foreground">{rule.name}</span>
                        {rule.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge tone="neutral">Paused</Badge>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted">
                        <span>When {EVENTS.find((event) => event.value === rule.eventType)?.label.toLowerCase() ?? rule.eventType}</span>
                        <span>→ {ACTIONS.find((action) => action.value === rule.actionType)?.label.toLowerCase() ?? rule.actionType}</span>
                        {rule.actionType === "CreateTask" ? <span>due in {config.durationDays}d</span> : null}
                        <span>· ran {rule.executionCount}×</span>
                      </div>
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button variant="ghost" size="xs" onClick={() => void toggle(rule)}>{rule.isActive ? "Pause" : "Activate"}</Button>
                        <IconButton size="icon-sm" variant="ghost" aria-label="Edit rule" onClick={() => { setEditing(rule); setDialogOpen(true); }}>
                          <Pencil className="size-3.5" />
                        </IconButton>
                        <IconButton size="icon-sm" variant="ghost" aria-label="Delete rule" onClick={() => setDeleteTarget(rule)}>
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Workflow />}
              title="No automation rules yet"
              description="For example: when a deal is won, create an onboarding task for its owner."
              compact
              action={canManage ? <Button variant="primary" size="xs" onClick={openNew}><Plus className="size-3" /> Add rule</Button> : undefined}
            />
          )}
        </div>
      </Card>

      <RuleDialog open={dialogOpen} onOpenChange={setDialogOpen} rule={editing} onSaved={() => void refresh()} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete rule?"}
        description="The rule stops running. Tasks and notifications it already created are kept."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function RuleDialog({
  open,
  onOpenChange,
  rule,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AutomationRule | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", eventType: "LeadCreated", actionType: "CreateTask", taskSubject: "", durationDays: "1", isActive: true });

  useEffect(() => {
    if (!open) return;
    const config = readConfig(rule?.actionConfigJson ?? "{}");
    setForm({
      name: rule?.name ?? "",
      eventType: rule?.eventType ?? "LeadCreated",
      actionType: rule?.actionType ?? "CreateTask",
      taskSubject: config.taskSubject,
      durationDays: String(config.durationDays),
      isActive: rule?.isActive ?? true,
    });
  }, [open, rule]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Rule name is required");
      return;
    }
    const days = Math.max(0, Math.round(Number(form.durationDays) || 0));
    const config =
      form.actionType === "CreateTask"
        ? { ...(form.taskSubject.trim() ? { taskSubject: form.taskSubject.trim() } : {}), durationDays: days }
        : {};
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        eventType: form.eventType,
        actionType: form.actionType,
        actionConfigJson: JSON.stringify(config),
        isActive: form.isActive,
      };
      if (rule) await mutate(`/automations/${rule.id}`, "PUT", payload);
      else await mutate("/automations", "POST", payload);
      toast.success(rule ? "Rule updated" : "Rule created");
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save rule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={rule ? `Edit ${rule.name}` : "New automation rule"} description="Rules run instantly when the trigger fires." />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <Field label="Name" required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Onboard won deals" autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="When">
                <NativeSelect value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })}>
                  {EVENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Then">
                <NativeSelect value={form.actionType} onChange={(event) => setForm({ ...form, actionType: event.target.value })}>
                  {ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </NativeSelect>
              </Field>
            </div>
            {form.actionType === "CreateTask" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                <Field label="Task subject" hint="{title} is replaced with the record name">
                  <Input value={form.taskSubject} onChange={(event) => setForm({ ...form, taskSubject: event.target.value })} placeholder="Follow-up: {title}" />
                </Field>
                <Field label="Due in (days)">
                  <Input type="number" min={0} value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} />
                </Field>
              </div>
            ) : (
              <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-[11.5px] text-muted">
                The record owner gets an in-app notification. Records without an owner notify the first active admin.
              </p>
            )}
            <label className="flex items-center gap-2 text-[12px] text-foreground">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="size-3.5 accent-[var(--brand)]" />
              Active
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{rule ? "Save rule" : "Create rule"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
