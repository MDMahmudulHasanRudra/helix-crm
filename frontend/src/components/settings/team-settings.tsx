"use client";

import { useState } from "react";
import { Mail, MoreHorizontal, Plus, Shield, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useAllUsers } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Field, Input, NativeSelect } from "@/components/ui/fields";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/overlays";
import { Avatar } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDate, relativeTime } from "@/lib/utils";
import type { Role, User } from "@/lib/types";

const ROLES: Role[] = ["Admin", "Manager", "Rep"];

const roleTone: Record<Role, "brand" | "info" | "neutral"> = {
  Admin: "brand",
  Manager: "info",
  Rep: "neutral",
};

export function TeamSettings() {
  const { me, refresh } = useWorkspace();
  const { data: users, isLoading, mutate: refreshUsers } = useAllUsers();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const isAdmin = me.user.role === "Admin";
  const active = (users ?? []).filter((user) => user.isActive);

  async function updateUser(user: User, patch: Record<string, unknown>, message: string) {
    setPendingId(user.id);
    try {
      await mutate(`/users/${user.id}`, "PATCH", patch);
      await refreshUsers();
      refresh();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update teammate");
    } finally {
      setPendingId(null);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mutate(`/users/${deleteTarget.id}`, "DELETE");
      await refreshUsers();
      refresh();
      await globalMutate((key) => typeof key === "string" && key.startsWith("/users"));
      toast.success("Teammate removed");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove teammate");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Team"
          subtitle={`${active.length} active · ${(users ?? []).length} total seats`}
          icon={<Users className="size-3.5" />}
          action={isAdmin ? <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}><Plus className="size-3.5" /> Invite teammate</Button> : null}
        />
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="bg-surface-2/40">
                <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Teammate</th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Role</th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Status</th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Last login</th>
                <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint" />
              </tr>
            </thead>
            <tbody>
              {isLoading && !users ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index} className="border-t border-border/60">
                    {Array.from({ length: 5 }).map((__, cell) => <td key={cell} className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>)}
                  </tr>
                ))
              ) : (users ?? []).length ? (
                (users ?? []).map((user) => {
                  const self = user.id === me.user.id;
                  return (
                    <tr key={user.id} className="border-t border-border/60">
                      <td className="px-4 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[12.5px] font-medium text-foreground">{user.fullName}</span>
                              {self ? <Badge tone="outline" className="h-4 px-1.5 text-[9px]">You</Badge> : null}
                            </div>
                            <div className="truncate text-[10.5px] text-muted">{user.email}{user.title ? ` · ${user.title}` : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {isAdmin && !self ? (
                          <select
                            value={user.role}
                            disabled={pendingId === user.id}
                            onChange={(event) => void updateUser(user, { role: event.target.value }, `${user.fullName} is now ${event.target.value}`)}
                            className="h-7 cursor-pointer rounded-md border border-border bg-surface px-2 text-[11.5px] text-foreground focus:border-brand/60 focus:outline-none"
                          >
                            {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                          </select>
                        ) : (
                          <Badge tone={roleTone[user.role]} dot>{user.role}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={user.isActive ? "success" : "neutral"} dot>{user.isActive ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-muted">
                        {user.lastLoginAt ? relativeTime(user.lastLoginAt) : "Never"}
                        <div className="text-[10px] text-faint">{user.lastLoginAt ? formatDate(user.lastLoginAt) : "Invited recently"}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isAdmin && !self ? (
                          <Dropdown>
                            <DropdownTrigger asChild>
                              <IconButton size="icon-sm" variant="ghost" aria-label={`Manage ${user.fullName}`} disabled={pendingId === user.id}>
                                <MoreHorizontal className="size-3.5" />
                              </IconButton>
                            </DropdownTrigger>
                            <DropdownContent>
                              <DropdownItem icon={<UserRound />} onSelect={() => void updateUser(user, { isActive: !user.isActive }, user.isActive ? "Teammate deactivated" : "Teammate reactivated")}>
                                {user.isActive ? "Deactivate" : "Reactivate"}
                              </DropdownItem>
                              <DropdownItem icon={<Shield />} onSelect={() => void updateUser(user, { role: user.role === "Admin" ? "Manager" : "Admin" }, "Role updated")}>
                                {user.role === "Admin" ? "Make manager" : "Make admin"}
                              </DropdownItem>
                              <DropdownSeparator />
                              <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleteTarget(user)}>
                                Remove teammate
                              </DropdownItem>
                            </DropdownContent>
                          </Dropdown>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon={<Users />} title="No teammates yet" description="Invite your team to collaborate on pipeline and support." compact />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { title: "Admin", description: "Full access to billing, workspace settings, custom fields and team management.", tone: "brand" as const, icon: <Shield className="size-3.5" /> },
          { title: "Manager", description: "Manage pipelines, quotes, products and all customer records. Cannot manage the team.", tone: "info" as const, icon: <Users className="size-3.5" /> },
          { title: "Rep", description: "Work accounts, contacts, leads, deals and tickets. Read-only on configuration.", tone: "neutral" as const, icon: <UserRound className="size-3.5" /> },
        ].map((role) => (
          <div key={role.title} className="rounded-xl border border-border bg-surface p-3.5 shadow-soft">
            <div className="flex items-center gap-2">
              <span className="text-faint">{role.icon}</span>
              <Badge tone={role.tone}>{role.title}</Badge>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{role.description}</p>
          </div>
        ))}
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onSaved={() => { void refreshUsers(); refresh(); }} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Remove ${deleteTarget.fullName}?` : "Remove teammate?"}
        description="They will lose access to this workspace. Their historical records remain intact."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function InviteDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", role: "Rep" as Role, title: "", password: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await mutate("/users", "POST", {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        title: form.title || null,
        password: form.password,
      });
      toast.success(`${form.firstName || form.email} invited`);
      onOpenChange(false);
      setForm({ email: "", firstName: "", lastName: "", role: "Rep", title: "", password: "" });
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to invite teammate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Invite teammate" description="Create credentials for a new workspace member." />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <Field label="Email" required>
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="teammate@company.com" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <Input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
              </Field>
              <Field label="Last name">
                <Input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
              </Field>
              <Field label="Role">
                <NativeSelect value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
                  {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Job title">
                <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </Field>
            </div>
            <Field label="Temporary password" hint="At least 8 characters" required>
              <Input type="text" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Welcome@123" />
            </Field>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 px-2.5 py-2 text-[11px] text-muted">
              <Mail className="mt-0.5 size-3.5 shrink-0 text-faint" />
              Share these credentials securely. The teammate can change their password in Settings → Profile.
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>Invite teammate</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
