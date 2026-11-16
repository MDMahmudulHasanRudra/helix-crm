"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { useCustomFields, mutate } from "@/lib/api";
import type { AccountDetail } from "@/lib/types";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { CustomFieldInputs } from "@/components/shared/custom-field-inputs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";

const industries = [
  "Technology",
  "Manufacturing",
  "Healthcare",
  "Financial Services",
  "Retail",
  "Media",
  "Data & Analytics",
  "Education",
  "Logistics",
  "Energy",
  "Other",
];

export function AccountDialog({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountDetail | null;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const { me, users } = useWorkspace();
  const { data: customFields } = useCustomFields("Account");
  const [saving, setSaving] = useState(false);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    domain: "",
    website: "",
    industry: "",
    employees: "",
    annualRevenue: "",
    phone: "",
    email: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    description: "",
    status: "Active",
    ownerId: "",
    tags: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: account?.name ?? "",
      domain: account?.domain ?? "",
      website: account?.website ?? "",
      industry: account?.industry ?? "",
      employees: account?.employees ? String(account.employees) : "",
      annualRevenue: account?.annualRevenue ? String(account.annualRevenue) : "",
      phone: account?.phone ?? "",
      email: account?.email ?? "",
      street: account?.street ?? "",
      city: account?.city ?? "",
      state: account?.state ?? "",
      postalCode: account?.postalCode ?? "",
      country: account?.country ?? "",
      description: account?.description ?? "",
      status: account?.status ?? "Active",
      ownerId: account?.ownerId ?? me.user.id,
      tags: account?.tags?.join(", ") ?? "",
    });
    setCustomValues(
      Object.fromEntries((account?.customFields ?? []).map((field) => [field.key, field.value ?? ""])),
    );
  }, [open, account, me.user.id]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Account name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        domain: form.domain || null,
        website: form.website || null,
        industry: form.industry || null,
        employees: form.employees ? Number(form.employees) : null,
        annualRevenue: form.annualRevenue ? Number(form.annualRevenue) : null,
        phone: form.phone || null,
        email: form.email || null,
        street: form.street || null,
        city: form.city || null,
        state: form.state || null,
        postalCode: form.postalCode || null,
        country: form.country || null,
        description: form.description || null,
        status: form.status,
        ownerId: form.ownerId || me.user.id,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        customFields: customValues,
      };
      const saved = account
        ? await mutate<AccountDetail>(`/accounts/${account.id}`, "PUT", payload)
        : await mutate<{ id: string }>("/accounts", "POST", payload);
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/accounts") || key.startsWith("/dashboard")));
      toast.success(account ? "Account updated" : "Account created");
      onOpenChange(false);
      if (onSaved) onSaved(saved.id);
      else if (!account) router.push(`/accounts/${saved.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={account ? `Edit ${account.name}` : "New account"}
          description={account ? "Update the company profile and relationship details." : "Add a company to your workspace."}
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-4">
            <Tabs defaultValue="company">
              <TabsList className="mb-4">
                <TabsTrigger value="company">Company</TabsTrigger>
                <TabsTrigger value="address">Address</TabsTrigger>
                <TabsTrigger value="custom">Custom fields</TabsTrigger>
              </TabsList>

              <TabsContent value="company" className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Account name" required className="sm:col-span-2">
                    <Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Acme Corporation" autoFocus />
                  </Field>
                  <Field label="Domain">
                    <Input value={form.domain} onChange={(event) => set("domain", event.target.value)} placeholder="acme.com" />
                  </Field>
                  <Field label="Website">
                    <Input value={form.website} onChange={(event) => set("website", event.target.value)} placeholder="https://acme.com" />
                  </Field>
                  <Field label="Industry">
                    <NativeSelect value={form.industry} onChange={(event) => set("industry", event.target.value)}>
                      <option value="">Select industry…</option>
                      {industries.map((industry) => (
                        <option key={industry} value={industry}>
                          {industry}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Status">
                    <NativeSelect value={form.status} onChange={(event) => set("status", event.target.value)}>
                      {["Active", "Prospect", "Churned", "Inactive"].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Employees">
                    <Input type="number" min="0" value={form.employees} onChange={(event) => set("employees", event.target.value)} placeholder="250" />
                  </Field>
                  <Field label={`Annual revenue (${me.organization.currency})`}>
                    <Input type="number" min="0" value={form.annualRevenue} onChange={(event) => set("annualRevenue", event.target.value)} placeholder="10000000" />
                  </Field>
                  <Field label="Phone">
                    <Input value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="+1 (415) 555-0100" />
                  </Field>
                  <Field label="Email">
                    <Input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} placeholder="hello@acme.com" />
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
                  <Field label="Tags" hint="Comma separated">
                    <Input value={form.tags} onChange={(event) => set("tags", event.target.value)} placeholder="Enterprise, Expansion" />
                  </Field>
                  <Field label="Description" className="sm:col-span-2">
                    <Textarea value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="What does this company do? How did you meet?" />
                  </Field>
                </div>
              </TabsContent>

              <TabsContent value="address">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Street" className="sm:col-span-2">
                    <Input value={form.street} onChange={(event) => set("street", event.target.value)} placeholder="117 Market Street" />
                  </Field>
                  <Field label="City">
                    <Input value={form.city} onChange={(event) => set("city", event.target.value)} placeholder="San Francisco" />
                  </Field>
                  <Field label="State / region">
                    <Input value={form.state} onChange={(event) => set("state", event.target.value)} placeholder="California" />
                  </Field>
                  <Field label="Postal code">
                    <Input value={form.postalCode} onChange={(event) => set("postalCode", event.target.value)} placeholder="94103" />
                  </Field>
                  <Field label="Country">
                    <Input value={form.country} onChange={(event) => set("country", event.target.value)} placeholder="United States" />
                  </Field>
                </div>
              </TabsContent>

              <TabsContent value="custom">
                {customFields?.length ? (
                  <CustomFieldInputs
                    fields={customFields}
                    values={customValues}
                    onChange={(key, value) => setCustomValues((current) => ({ ...current, [key]: value }))}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[12px] text-muted">
                    No custom fields defined. Add them in Settings → Custom fields.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {account ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
