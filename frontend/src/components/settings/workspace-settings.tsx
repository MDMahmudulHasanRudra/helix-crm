"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Globe2, Image, Moon, Palette, Sun } from "lucide-react";
import { mutate } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { useTheme } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/primitives";
import { Field, Input, NativeSelect } from "@/components/ui/fields";
import { DetailField } from "@/components/ui/layout";
import { cn } from "@/lib/utils";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "JPY"];
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function WorkspaceSettings() {
  const { me, refresh } = useWorkspace();
  const isAdmin = me.user.role === "Admin";
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", currency: "USD", timeZone: "UTC", logoUrl: "" });

  useEffect(() => {
    setForm({
      name: me.organization.name,
      currency: me.organization.currency,
      timeZone: me.organization.timeZone,
      logoUrl: me.organization.logoUrl ?? "",
    });
  }, [me.organization]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Workspace name is required");
      return;
    }
    setSaving(true);
    try {
      await mutate("/organization", "PUT", {
        name: form.name,
        currency: form.currency,
        timeZone: form.timeZone,
        logoUrl: form.logoUrl || null,
      });
      refresh();
      toast.success("Workspace updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update workspace");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader title="Workspace" subtitle="Identity and regional defaults for everyone" icon={<Building2 className="size-3.5" />} />
        <form onSubmit={submit}>
          <div className="space-y-4 border-t border-border px-4 py-4">
            {!isAdmin ? (
              <div className="rounded-lg border border-warning/30 bg-warning-soft px-2.5 py-2 text-[11.5px] text-warning">
                Only workspace admins can change these settings.
              </div>
            ) : null}
            <Field label="Workspace name" required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={!isAdmin} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Default currency" hint="Used for deals, quotes and reports">
                <NativeSelect value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} disabled={!isAdmin}>
                  {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Time zone">
                <NativeSelect value={form.timeZone} onChange={(event) => setForm({ ...form, timeZone: event.target.value })} disabled={!isAdmin}>
                  {[...new Set([form.timeZone, ...TIMEZONES])].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Logo URL" hint="Square image, at least 128px">
              <div className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 text-faint">
                  {form.logoUrl ? <img src={form.logoUrl} alt="" className="size-full object-cover" /> : <Image className="size-3.5" />}
                </span>
                <Input value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} placeholder="https://…/logo.png" disabled={!isAdmin} />
              </div>
            </Field>
          </div>
          {isAdmin ? (
            <div className="flex items-center justify-end border-t border-border bg-surface-2/40 px-4 py-3">
              <Button type="submit" variant="primary" size="sm" loading={saving}>Save workspace</Button>
            </div>
          ) : null}
        </form>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader title="Workspace info" icon={<Globe2 className="size-3.5" />} />
          <div className="space-y-3 border-t border-border px-4 py-3.5">
            <DetailField label="Slug" mono>{me.organization.slug}</DetailField>
            <DetailField label="Currency">{me.organization.currency}</DetailField>
            <DetailField label="Time zone">{me.organization.timeZone}</DetailField>
            <DetailField label="Organization ID" mono>{me.organization.id}</DetailField>
            <DetailField label="Your role">{me.user.role}</DetailField>
          </div>
        </Card>
        <Card>
          <CardHeader title="Data & privacy" />
          <div className="space-y-2 border-t border-border px-4 py-3.5 text-[11.5px] leading-relaxed text-muted">
            <p>All records are scoped to this workspace. Soft-deleted records are retained for audit purposes and excluded from lists and reports.</p>
            <p>Every change to a record is captured in its change history with the actor and previous values.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader title="Appearance" subtitle="Choose how Helix looks on this device" icon={<Palette className="size-3.5" />} />
        <div className="grid grid-cols-1 gap-2.5 border-t border-border px-4 py-4 sm:grid-cols-2">
          {[
            { value: "light" as const, label: "Light", description: "Bright surfaces, crisp contrast for daytime work.", icon: <Sun className="size-4" />, preview: "bg-white border-[#e4e4e7]" },
            { value: "dark" as const, label: "Dark", description: "Low-glare dark surfaces for long sessions.", icon: <Moon className="size-4" />, preview: "bg-[#131316] border-[#2a2a31]" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                theme === option.value ? "border-brand/50 bg-brand-soft/50" : "border-border hover:border-border-strong",
              )}
            >
              <div className={cn("mb-2.5 flex h-16 items-end gap-1.5 rounded-lg border p-2", option.preview)}>
                <span className="h-full w-6 rounded bg-[#5b5bd6]/80" />
                <span className="flex-1 space-y-1">
                  <span className="block h-1.5 w-3/4 rounded bg-current opacity-20" />
                  <span className="block h-1.5 w-1/2 rounded bg-current opacity-10" />
                  <span className="block h-6 w-full rounded bg-current opacity-5" />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted">{option.icon}</span>
                <span className="text-[12.5px] font-medium text-foreground">{option.label}</span>
                {theme === option.value ? <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.05em] text-brand">Active</span> : null}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{option.description}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Preview" />
        <div className="space-y-2 border-t border-border px-4 py-4">
          <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
            <div className="text-[11px] font-semibold text-foreground">Pipeline review</div>
            <div className="mt-0.5 text-[10.5px] text-muted">Today · 4:00 PM · Zoom</div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-brand/20 bg-brand-soft px-3 py-2">
            <span className="text-[11px] font-medium text-brand">New deal</span>
            <span className="text-[10.5px] text-brand/80">⌘N</span>
          </div>
          <p className="pt-1 text-[10.5px] leading-relaxed text-faint">Theme is stored per browser and applies instantly across the workspace.</p>
        </div>
      </Card>
    </div>
  );
}
