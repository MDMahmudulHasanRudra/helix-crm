"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useAccounts, useCustomFields } from "@/lib/api";
import type { ContactDetail } from "@/lib/types";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { CustomFieldInputs } from "@/components/shared/custom-field-inputs";

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  presetAccountId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ContactDetail | null;
  presetAccountId?: string;
  onSaved?: (id: string) => void;
}) {
  const { me, users } = useWorkspace();
  const { data: accounts } = useAccounts({ page: 1, pageSize: 200 });
  const { data: customFields } = useCustomFields("Contact");
  const [saving, setSaving] = useState(false);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    mobile: "",
    title: "",
    department: "",
    accountId: "",
    ownerId: "",
    linkedInUrl: "",
    city: "",
    country: "",
    notes: "",
    tags: "",
    isPrimary: false,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      firstName: contact?.firstName ?? "",
      lastName: contact?.lastName ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      mobile: contact?.mobile ?? "",
      title: contact?.title ?? "",
      department: contact?.department ?? "",
      accountId: contact?.accountId ?? presetAccountId ?? "",
      ownerId: contact?.ownerId ?? me.user.id,
      linkedInUrl: contact?.linkedInUrl ?? "",
      city: contact?.city ?? "",
      country: contact?.country ?? "",
      notes: contact?.notes ?? "",
      tags: contact?.tags?.join(", ") ?? "",
      isPrimary: contact?.isPrimary ?? false,
    });
    setCustomValues(
      Object.fromEntries((contact?.customFields ?? []).map((field) => [field.key, field.value ?? ""])),
    );
  }, [open, contact, presetAccountId, me.user.id]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
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
        mobile: form.mobile || null,
        title: form.title || null,
        department: form.department || null,
        accountId: form.accountId || null,
        ownerId: form.ownerId || me.user.id,
        linkedInUrl: form.linkedInUrl || null,
        city: form.city || null,
        country: form.country || null,
        notes: form.notes || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        customFields: customValues,
      };
      const saved = contact
        ? await mutate<ContactDetail>(`/contacts/${contact.id}`, "PUT", payload)
        : await mutate<{ id: string }>("/contacts", "POST", payload);
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/contacts") || key.startsWith("/accounts") || key.startsWith("/dashboard")));
      toast.success(contact ? "Contact updated" : "Contact created");
      onOpenChange(false);
      onSaved?.(saved.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={contact ? `Edit ${contact.fullName}` : "New contact"}
          description="People you work with across accounts and deals."
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First name" required>
                <Input value={form.firstName} onChange={(event) => set("firstName", event.target.value)} placeholder="Elena" autoFocus />
              </Field>
              <Field label="Last name">
                <Input value={form.lastName} onChange={(event) => set("lastName", event.target.value)} placeholder="Petrova" />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} placeholder="elena@acme.com" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="+1 (415) 555-0100" />
              </Field>
              <Field label="Job title">
                <Input value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="CTO" />
              </Field>
              <Field label="Department">
                <Input value={form.department} onChange={(event) => set("department", event.target.value)} placeholder="Engineering" />
              </Field>
              <Field label="Account">
                <NativeSelect value={form.accountId} onChange={(event) => set("accountId", event.target.value)}>
                  <option value="">No account</option>
                  {(accounts?.items ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </NativeSelect>
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
              <Field label="Mobile">
                <Input value={form.mobile} onChange={(event) => set("mobile", event.target.value)} />
              </Field>
              <Field label="LinkedIn">
                <Input value={form.linkedInUrl} onChange={(event) => set("linkedInUrl", event.target.value)} placeholder="linkedin.com/in/…" />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(event) => set("city", event.target.value)} />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={(event) => set("country", event.target.value)} />
              </Field>
              <Field label="Tags" hint="Comma separated">
                <Input value={form.tags} onChange={(event) => set("tags", event.target.value)} placeholder="Champion, Technical" />
              </Field>
              <label className="flex items-center gap-2 self-end rounded-lg border border-border px-3 py-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={form.isPrimary}
                  onChange={(event) => set("isPrimary", event.target.checked)}
                  className="size-3.5 accent-[var(--brand)]"
                />
                Primary contact for account
              </label>
              <Field label="Notes" className="sm:col-span-2">
                <Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} />
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
              {contact ? "Save changes" : "Create contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
