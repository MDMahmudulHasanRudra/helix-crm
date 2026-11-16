"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useAccounts, useContacts, useCustomFields, usePipelines } from "@/lib/api";
import type { DealDetail } from "@/lib/types";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { CustomFieldInputs } from "@/components/shared/custom-field-inputs";
import { fromDateInput, toDateInput } from "@/lib/utils";

export function DealDialog({
  open,
  onOpenChange,
  deal,
  presetStageId,
  presetPipelineId,
  presetAccountId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: DealDetail | null;
  presetStageId?: string;
  presetPipelineId?: string;
  presetAccountId?: string;
  onSaved?: (id: string) => void;
}) {
  const { me, users } = useWorkspace();
  const { data: pipelines } = usePipelines();
  const { data: accounts } = useAccounts({ page: 1, pageSize: 200 });
  const { data: contacts } = useContacts({ page: 1, pageSize: 200 });
  const { data: customFields } = useCustomFields("Deal");
  const [saving, setSaving] = useState(false);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    accountId: "",
    primaryContactId: "",
    amount: "",
    pipelineId: "",
    stageId: "",
    expectedCloseDate: "",
    source: "",
    description: "",
    nextStep: "",
    ownerId: "",
    tags: "",
  });

  const pipeline = useMemo(
    () => pipelines?.find((item) => item.id === form.pipelineId) ?? pipelines?.[0],
    [pipelines, form.pipelineId],
  );

  const availableContacts = useMemo(
    () => (contacts?.items ?? []).filter((contact) => !form.accountId || contact.accountId === form.accountId),
    [contacts, form.accountId],
  );

  useEffect(() => {
    if (!open) return;
    const initialPipeline = deal?.pipelineId ?? presetPipelineId ?? pipelines?.find((item) => item.isDefault)?.id ?? pipelines?.[0]?.id ?? "";
    const initialPipelineStages = pipelines?.find((item) => item.id === initialPipeline)?.stages ?? [];
    const initialStage =
      deal?.stageId ?? presetStageId ?? initialPipelineStages.find((stage) => !stage.isWon && !stage.isLost)?.id ?? initialPipelineStages[0]?.id ?? "";
    setForm({
      name: deal?.name ?? "",
      accountId: deal?.accountId ?? presetAccountId ?? "",
      primaryContactId: deal?.primaryContactId ?? "",
      amount: deal?.amount ? String(deal.amount) : "",
      pipelineId: initialPipeline,
      stageId: initialStage,
      expectedCloseDate: toDateInput(deal?.expectedCloseDate) || toDateInput(new Date(Date.now() + 30 * 86400000).toISOString()),
      source: deal?.source ?? "",
      description: deal?.description ?? "",
      nextStep: deal?.nextStep ?? "",
      ownerId: deal?.ownerId ?? me.user.id,
      tags: deal?.tags?.join(", ") ?? "",
    });
    setCustomValues(Object.fromEntries((deal?.customFields ?? []).map((field) => [field.key, field.value ?? ""])));
  }, [open, deal, presetStageId, presetPipelineId, presetAccountId, pipelines, me.user.id]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Deal name is required");
      return;
    }
    if (!form.pipelineId || !form.stageId) {
      toast.error("Choose a pipeline and stage");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        accountId: form.accountId || null,
        primaryContactId: form.primaryContactId || null,
        amount: form.amount ? Number(form.amount) : 0,
        currency: me.organization.currency,
        pipelineId: form.pipelineId,
        stageId: form.stageId,
        expectedCloseDate: form.expectedCloseDate ? fromDateInput(form.expectedCloseDate) : null,
        source: form.source || null,
        description: form.description || null,
        nextStep: form.nextStep || null,
        ownerId: form.ownerId || me.user.id,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        customFields: customValues,
      };
      const saved = deal
        ? await mutate<DealDetail>(`/deals/${deal.id}`, "PUT", payload)
        : await mutate<{ id: string }>("/deals", "POST", payload);
      await globalMutate((key) =>
        typeof key === "string" &&
        (key.startsWith("/deals") || key.startsWith("/pipelines") || key.startsWith("/accounts") || key.startsWith("/dashboard") || key.startsWith("/reports")),
      );
      toast.success(deal ? "Deal updated" : "Deal created");
      onOpenChange(false);
      onSaved?.(saved.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save deal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={deal ? `Edit ${deal.name}` : "New deal"}
          description="Track an opportunity through your pipeline."
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <Field label="Deal name" required>
              <Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Acme — Platform rollout" autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Account">
                <NativeSelect value={form.accountId} onChange={(event) => { set("accountId", event.target.value); set("primaryContactId", ""); }}>
                  <option value="">No account</option>
                  {(accounts?.items ?? []).map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Primary contact">
                <NativeSelect value={form.primaryContactId} onChange={(event) => set("primaryContactId", event.target.value)}>
                  <option value="">No contact</option>
                  {availableContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>{contact.fullName}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={`Amount (${me.organization.currency})`}>
                <Input type="number" min="0" value={form.amount} onChange={(event) => set("amount", event.target.value)} placeholder="50000" />
              </Field>
              <Field label="Expected close">
                <Input type="date" value={form.expectedCloseDate} onChange={(event) => set("expectedCloseDate", event.target.value)} />
              </Field>
              <Field label="Pipeline">
                <NativeSelect
                  value={form.pipelineId}
                  onChange={(event) => {
                    const nextPipeline = pipelines?.find((item) => item.id === event.target.value);
                    set("pipelineId", event.target.value);
                    set("stageId", nextPipeline?.stages.find((stage) => !stage.isWon && !stage.isLost)?.id ?? nextPipeline?.stages[0]?.id ?? "");
                  }}
                >
                  {(pipelines ?? []).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Stage">
                <NativeSelect value={form.stageId} onChange={(event) => set("stageId", event.target.value)}>
                  {(pipeline?.stages ?? []).map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.name} · {stage.probability}%</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Owner">
                <NativeSelect value={form.ownerId} onChange={(event) => set("ownerId", event.target.value)}>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.fullName}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Source">
                <Input value={form.source} onChange={(event) => set("source", event.target.value)} placeholder="Inbound, Outbound…" />
              </Field>
              <Field label="Next step" className="sm:col-span-2">
                <Input value={form.nextStep} onChange={(event) => set("nextStep", event.target.value)} placeholder="e.g. Send security questionnaire" />
              </Field>
              <Field label="Tags" hint="Comma separated" className="sm:col-span-2">
                <Input value={form.tags} onChange={(event) => set("tags", event.target.value)} placeholder="Enterprise, Expansion" />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea value={form.description} onChange={(event) => set("description", event.target.value)} rows={2} />
              </Field>
            </div>
            {customFields?.length ? (
              <div className="border-t border-border pt-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Custom fields</div>
                <CustomFieldInputs fields={customFields} values={customValues} onChange={(key, value) => setCustomValues((current) => ({ ...current, [key]: value }))} />
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{deal ? "Save changes" : "Create deal"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
