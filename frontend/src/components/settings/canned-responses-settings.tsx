"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquareQuote, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useCannedResponses } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Field, Input, SearchInput, Textarea } from "@/components/ui/fields";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { CannedResponse } from "@/lib/types";

const refreshAll = () => globalMutate((key) => typeof key === "string" && key.startsWith("/canned-responses"));

export function CannedResponsesSettings() {
  const { me } = useWorkspace();
  const canManage = me.user.role === "Admin" || me.user.role === "Manager";
  const { data: items, isLoading } = useCannedResponses();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CannedResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (items ?? []).filter(
      (item) => !q || item.title.toLowerCase().includes(q) || item.shortcut.toLowerCase().includes(q) || item.content.toLowerCase().includes(q),
    );
    const map = new Map<string, CannedResponse[]>();
    for (const item of filtered) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return [...map.entries()];
  }, [items, search]);

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mutate(`/canned-responses/${deleteTarget.id}`, "DELETE");
      await refreshAll();
      toast.success("Response deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete response");
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
          <h2 className="text-[13px] font-semibold text-foreground">Canned responses</h2>
          <p className="text-[11.5px] text-muted">Reusable replies agents can drop into any ticket conversation.</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search responses…" className="w-full sm:w-[220px]" />
          {canManage ? (
            <Button variant="primary" size="sm" onClick={openNew}>
              <Plus className="size-3.5" /> New response
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading && !items ? (
        <Card className="space-y-1.5 p-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 rounded-lg" />)}</Card>
      ) : grouped.length ? (
        grouped.map(([category, list]) => (
          <Card key={category}>
            <CardHeader title={category} subtitle={`${list.length} response${list.length === 1 ? "" : "s"}`} icon={<MessageSquareQuote className="size-3.5" />} />
            <div className="divide-y divide-border border-t border-border">
              {list.map((item) => (
                <div key={item.id} className="group flex items-start gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-foreground">{item.title}</span>
                      <Badge tone="outline" className="font-mono text-[9.5px]">{item.shortcut}</Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[11px] text-muted">{item.content}</p>
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton size="icon-sm" variant="ghost" aria-label="Edit response" onClick={() => { setEditing(item); setDialogOpen(true); }}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton size="icon-sm" variant="ghost" aria-label="Delete response" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState
            icon={<MessageSquareQuote />}
            title={search ? "No matching responses" : "No canned responses yet"}
            description="Save answers to common questions — refunds, password resets, pricing — and reuse them on tickets."
            compact
            action={canManage && !search ? <Button variant="primary" size="xs" onClick={openNew}><Plus className="size-3" /> Add response</Button> : undefined}
          />
        </Card>
      )}

      <ResponseDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.title}"?` : "Delete response?"}
        description="Agents will no longer see this response in the ticket reply menu."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function ResponseDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CannedResponse | null;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", shortcut: "", category: "General", content: "" });

  useEffect(() => {
    if (!open) return;
    setForm({
      title: item?.title ?? "",
      shortcut: item?.shortcut ?? "",
      category: item?.category ?? "General",
      content: item?.content ?? "",
    });
  }, [open, item]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    const shortcut = form.shortcut.trim() || form.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setSaving(true);
    try {
      const payload = { title: form.title.trim(), shortcut, category: form.category.trim() || "General", content: form.content.trim() };
      if (item) await mutate(`/canned-responses/${item.id}`, "PUT", payload);
      else await mutate("/canned-responses", "POST", payload);
      await refreshAll();
      toast.success(item ? "Response updated" : "Response created");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save response");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={item ? `Edit ${item.title}` : "New canned response"} description="Shown in the canned response menu on every ticket." />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <Field label="Title" required>
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Refund policy" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shortcut" hint="Generated from the title if blank">
                <Input value={form.shortcut} onChange={(event) => setForm({ ...form, shortcut: event.target.value })} placeholder="/refund" className="font-mono text-[11.5px]" />
              </Field>
              <Field label="Category">
                <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Billing" />
              </Field>
            </div>
            <Field label="Content" required>
              <Textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} rows={6} placeholder="Hi there, …" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{item ? "Save response" : "Create response"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
