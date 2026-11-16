"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { mutate } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/fields";
import { DetailField } from "@/components/ui/layout";
import { formatDate } from "@/lib/utils";

export function ProfileSettings() {
  const { me, refresh, logout } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", title: "", phone: "" });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    setForm({
      firstName: me.user.firstName,
      lastName: me.user.lastName,
      title: me.user.title ?? "",
      phone: me.user.phone ?? "",
    });
  }, [me.user]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!form.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    setSaving(true);
    try {
      await mutate("/auth/profile", "PATCH", {
        firstName: form.firstName,
        lastName: form.lastName,
        title: form.title || null,
        phone: form.phone || null,
      });
      refresh();
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update profile");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwords.next !== passwords.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (passwords.next.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setChanging(true);
    try {
      await mutate("/auth/change-password", "POST", { currentPassword: passwords.current, newPassword: passwords.next });
      setPasswords({ current: "", next: "", confirm: "" });
      toast.success("Password updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change password");
    } finally {
      setChanging(false);
    }
  }

  const initials = `${me.user.firstName[0] ?? ""}${me.user.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <Card>
          <CardHeader title="Your profile" subtitle="How you appear across the workspace" icon={<UserRound className="size-3.5" />} />
          <form onSubmit={saveProfile}>
            <div className="space-y-4 border-t border-border px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[18px] font-semibold text-white">
                  {initials || "?"}
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-foreground">{me.user.fullName}</div>
                  <div className="text-[11.5px] text-muted">{me.user.role} · {me.organization.name}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="First name" required>
                  <Input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
                </Field>
                <Field label="Last name">
                  <Input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
                </Field>
                <Field label="Job title">
                  <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Account executive" />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+1 (555) 000-0000" />
                </Field>
                <Field label="Email" hint="Contact an admin to change">
                  <Input value={me.user.email} readOnly className="bg-surface-2 text-muted" />
                </Field>
                <Field label="Role" hint="Managed by admins">
                  <Input value={me.user.role} readOnly className="bg-surface-2 text-muted" />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/40 px-4 py-3">
              <Button type="submit" variant="primary" size="sm" loading={saving}>Save profile</Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Password" subtitle="Use at least 8 characters" icon={<KeyRound className="size-3.5" />} />
          <form onSubmit={changePassword}>
            <div className="grid grid-cols-1 gap-3 border-t border-border px-4 py-4 sm:grid-cols-3">
              <Field label="Current password" required>
                <Input type="password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} autoComplete="current-password" />
              </Field>
              <Field label="New password" required>
                <Input type="password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Confirm password" required>
                <Input type="password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} autoComplete="new-password" />
              </Field>
            </div>
            <div className="flex items-center justify-end border-t border-border bg-surface-2/40 px-4 py-3">
              <Button type="submit" variant="primary" size="sm" loading={changing}>Update password</Button>
            </div>
          </form>
        </Card>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader title="Account" />
          <div className="space-y-3 border-t border-border px-4 py-3.5">
            <DetailField label="Member since">{formatDate(me.user.lastLoginAt ?? undefined, "long")}</DetailField>
            <DetailField label="Last sign in">{formatDate(me.user.lastLoginAt, "long")}</DetailField>
            <DetailField label="Workspace">{me.organization.name}</DetailField>
            <DetailField label="Workspace slug">{me.organization.slug}</DetailField>
            <DetailField label="Currency">{me.organization.currency}</DetailField>
          </div>
        </Card>

        <Card>
          <CardHeader title="Security" subtitle="Session and access" icon={<ShieldCheck className="size-3.5" />} />
          <div className="space-y-2 border-t border-border px-4 py-3.5">
            <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft px-2.5 py-2 text-[11.5px] text-success">
              <ShieldCheck className="size-3.5" /> HTTP-only cookie session
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[11.5px] text-muted">
              <Mail className="size-3.5" /> {me.user.email}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => void logout()}>
              <LogOut className="size-3.5" /> Sign out
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
