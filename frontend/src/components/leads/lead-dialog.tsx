"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useCustomFields } from "@/lib/api";
import type { LeadDetail } from "@/lib/types";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { CustomFieldInputs } from "@/components/shared/custom-field-inputs";

const sources = ["Website", "Outbound", "LinkedIn Ads", "Partner", "Referral", "Event", "Other"];
const statuses = ["New", "Contacted", "Qualified", "Unqualified"];

export function LeadDialog({
  open,
  onOpenChange,
  lead,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: LeadDetail | null;
  onSaved?: (id: string) => void;
}) {
  const { me, users } = useWorkspace();
  const { data: customFields } = useCustomFields("Lead");
  const [saving, setSaving] = useState(false);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    company: "",
    email: "",
    phone: "",
    title: "",
    website: "",
    source: "Website",
    status: "New",
    score: "50",
    estimatedValue: "",
    ownerId: "",
    notes: "",
    tags: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      firstName: lead?.firstName ?? "",
      lastName: lead?.lastName ?? "",
      company: lead?.company ?? "",
      email: lead?.email ?? "",
      phone: lead?.phone ?? "",
      title: lead?.title ?? "",
      website: lead?.website ?? "",
      source: lead?.source ?? "Website",
      status: lead && lead.status !== "Converted" ? lead.status : "New",
      score: String(lead?.score ?? 50),
      estimatedValue: lead?.estimatedValue ? String(lead.estimatedValue) : "",
      ownerId: lead?.ownerId ?? me.user.id,
      notes: lead?.notes ?? "",
      tags: lead?.tags?.join(", ") ?? "",
    });
    setCustomValues(
      Object.fromEntries((lead?.customFields ?? []).map((field) => [field.key, field.value ?? ""])),
    );
  }, [open, lead, me.user.id]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        email: form.email || null,
        phone: form.phone || null,
        title: form.title || null,
        website: form.website || null,
        score: Number(form.score) || 0,
        estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
        ownerId: form.ownerId || me.user.id,
        notes: form.notes || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        customFields: customValues,
      };
      const saved = lead
        ? await mutate<LeadDetail>(`/leads/${lead.id}`, "PUT", payload)
        : await mutate<{ id: string }>("/leads", "POST", payload);
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/leads") || key.startsWith("/dashboard")));
      toast.success(lead ? "Lead updated" : "Lead created");
      onOpenChange(false);
      onSaved?.(saved.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={lead ? `Edit ${lead.fullName}` : "New lead"}
          description="Capture an inbound or outbound opportunity before it becomes a deal."
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First name" required>
                <Input value={form.firstName} onChange={(event) => set("firstName", event.target.value)} autoFocus />
              </Field>
              <Field label="Last name">
                <Input value={form.lastName} onChange={(event) => set("lastName", event.target.value)} />
              </Field>
              <Field label="Company">
                <Input value={form.company} onChange={(event) => set("company", event.target.value)} placeholder="e.g. Meridian Health" />
              </Field>
              <Field label="Job title">
                <Input value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="VP Engineering" />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(event) => set("phone", event.target.value)} />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={(event) => set("website", event.target.value)} placeholder="meridian.health" />
              </Field>
              <Field label="Source">
                <NativeSelect value={form.source} onChange={(event) => set("source", event.target.value)}>
                  {sources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Status">
                <NativeSelect value={form.status} onChange={(event) => set("status", event.target.value)}>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Score" hint="0–100">
                <Input type="number" min="0" max="100" value={form.score} onChange={(event) => set("score", event.target.value)} />
              </Field>
              <Field label={`Estimated value (${me.organization.currency})`}>
                <Input type="number" min="0" value={form.estimatedValue} onChange={(event) => set("estimatedValue", event.target.value)} placeholder="50000" />
              </Field>
              <Field label="Owner">
                <NativeSelect value={form.ownerId} onChange={(event) => set("ownerId", event.target.value)}>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Tags" hint="Comma separated" className="sm:col-span-2">
                <Input value={form.tags} onChange={(event) => set("tags", event.target.value)} placeholder="Enterprise, Inbound" />
              </Field>
              <Field label="Notes" className="sm:col-span-2">
                <Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} placeholder="Where did this lead come from? What do they need?" />
              </Field>
            </div>
            {customFields?.length ? (
              <div className="border-t border-border pt-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Custom fields</div>
                <CustomFieldInputs
                  fields={customFields}
                  values={customValues}
                  onChange={(key, value) => setCustomValues((current) => ({ ...current, [key]: value }))}
                />
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {lead ? "Save changes" : "Create lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
