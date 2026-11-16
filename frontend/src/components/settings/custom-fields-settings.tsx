"use client";

import { useEffect, useMemo, useState } from "react";
import { Braces, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useCustomFields } from "@/lib/api";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import type { CustomField } from "@/lib/types";

const ENTITY_TYPES = ["Account", "Contact", "Lead", "Deal"] as const;
const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Checkbox" },
  { value: "select", label: "Select" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
];

export function CustomFieldsSettings() {
  const { data: fields, isLoading, mutate: refresh } = useCustomFields();
  const [entity, setEntity] = useState<(typeof ENTITY_TYPES)[number]>("Account");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomField | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => (fields ?? []).filter((field) => field.entityType === entity), [fields, entity]);

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mutate(`/custom-fields/${deleteTarget.id}`, "DELETE");
      await refresh();
      await globalMutate((key) => typeof key === "string" && key.startsWith("/custom-fields"));
      toast.success("Custom field deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete field");
    } finally {
      setDeleting(false);
    }
  }

  async function toggle(field: CustomField) {
    try {
      await mutate(`/custom-fields/${field.id}`, "PUT", { label: field.label, fieldType: field.fieldType, options: field.options, isRequired: field.isRequired, sortOrder: field.sortOrder, isActive: !field.isActive, placeholder: field.placeholder, helpText: field.helpText });
      await refresh();
      toast.success(field.isActive ? "Field deactivated" : "Field activated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update field");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Custom fields</h2>
          <p className="text-[11.5px] text-muted">Capture workspace-specific data on records without changing the schema.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="size-3.5" /> New field
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {ENTITY_TYPES.map((type) => {
          const count = (fields ?? []).filter((field) => field.entityType === type).length;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setEntity(type)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors",
                entity === type ? "border-brand/30 bg-brand-soft text-brand" : "border-border bg-surface text-muted hover:text-foreground",
              )}
            >
              {type}s <span className="text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={`${entity} fields`}
          subtitle={`${filtered.length} field${filtered.length === 1 ? "" : "s"} configured`}
          icon={<Braces className="size-3.5" />}
          action={<Button variant="secondary" size="xs" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="size-3" /> Add field</Button>}
        />
        <div className="border-t border-border">
          {isLoading && !fields ? (
            <div className="space-y-1.5 p-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}</div>
          ) : filtered.length ? (
            <div className="divide-y divide-border">
              {filtered.map((field) => (
                <div key={field.id} className="group flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-foreground">{field.label}</span>
                      <Badge tone="outline" className="font-mono text-[9.5px]">{field.key}</Badge>
                      {field.isRequired ? <Badge tone="warning">Required</Badge> : null}
                      {!field.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted">
                      <span>{FIELD_TYPES.find((type) => type.value === field.fieldType)?.label ?? field.fieldType}</span>
                      {field.options.length ? <span>Options: {field.options.join(", ")}</span> : null}
                      {field.helpText ? <span className="truncate">{field.helpText}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="xs" onClick={() => void toggle(field)}>{field.isActive ? "Disable" : "Enable"}</Button>
                    <IconButton size="icon-sm" variant="ghost" aria-label="Edit field" onClick={() => { setEditing(field); setDialogOpen(true); }}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton size="icon-sm" variant="ghost" aria-label="Delete field" onClick={() => setDeleteTarget(field)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Braces />}
              title={`No custom ${entity.toLowerCase()} fields`}
              description={`Add fields like "Procurement stage" or "Renewal risk" to ${entity.toLowerCase()} records.`}
              compact
              action={<Button variant="primary" size="xs" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="size-3" /> Add field</Button>}
            />
          )}
        </div>
      </Card>

      <FieldDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        field={editing}
        defaultEntity={entity}
        onSaved={() => void refresh()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.label}"?` : "Delete field?"}
        description="Existing values stay stored but the field disappears from forms and record pages."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function FieldDialog({
  open,
  onOpenChange,
  field,
  defaultEntity,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field?: CustomField | null;
  defaultEntity: string;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    entityType: defaultEntity,
    label: "",
    key: "",
    fieldType: "text",
    options: "",
    isRequired: false,
    isActive: true,
    placeholder: "",
    helpText: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      entityType: field?.entityType ?? defaultEntity,
      label: field?.label ?? "",
      key: field?.key ?? "",
      fieldType: field?.fieldType ?? "text",
      options: field?.options.join(", ") ?? "",
      isRequired: field?.isRequired ?? false,
      isActive: field?.isActive ?? true,
      placeholder: field?.placeholder ?? "",
      helpText: field?.helpText ?? "",
    });
  }, [open, field, defaultEntity]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.label.trim()) {
      toast.error("Field label is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        entityType: form.entityType,
        key: form.key || null,
        label: form.label,
        fieldType: form.fieldType,
        options: form.fieldType === "select" ? form.options.split(",").map((option) => option.trim()).filter(Boolean) : [],
        isRequired: form.isRequired,
        isActive: form.isActive,
        placeholder: form.placeholder || null,
        helpText: form.helpText || null,
      };
      if (field) await mutate(`/custom-fields/${field.id}`, "PUT", payload);
      else await mutate("/custom-fields", "POST", payload);
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/custom-fields") || key.startsWith("/accounts") || key.startsWith("/contacts") || key.startsWith("/leads") || key.startsWith("/deals")));
      toast.success(field ? "Field updated" : "Field created");
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save field");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={field ? `Edit ${field.label}` : "New custom field"} description="Available on every record of the selected type." />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Record type">
                <NativeSelect value={form.entityType} onChange={(event) => setForm({ ...form, entityType: event.target.value })} disabled={Boolean(field)}>
                  {ENTITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Field type">
                <NativeSelect value={form.fieldType} onChange={(event) => setForm({ ...form, fieldType: event.target.value })}>
                  {FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Label" required>
                <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Procurement stage" autoFocus />
              </Field>
              <Field label="Key" hint={field ? "Cannot be changed" : "Auto-generated if blank"}>
                <Input value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} placeholder="procurement_stage" disabled={Boolean(field)} className="font-mono text-[11.5px]" />
              </Field>
            </div>
            {form.fieldType === "select" ? (
              <Field label="Options" hint="Comma separated">
                <Input value={form.options} onChange={(event) => setForm({ ...form, options: event.target.value })} placeholder="Security review, Legal, Procured" />
              </Field>
            ) : null}
            <Field label="Placeholder">
              <Input value={form.placeholder} onChange={(event) => setForm({ ...form, placeholder: event.target.value })} />
            </Field>
            <Field label="Help text">
              <Textarea value={form.helpText} onChange={(event) => setForm({ ...form, helpText: event.target.value })} rows={2} placeholder="Shown under the input on forms" />
            </Field>
            <div className="flex items-center gap-5">
              <label className="flex items-center gap-2 text-[12px] text-foreground">
                <input type="checkbox" checked={form.isRequired} onChange={(event) => setForm({ ...form, isRequired: event.target.checked })} className="size-3.5 accent-[var(--brand)]" />
                Required
              </label>
              <label className="flex items-center gap-2 text-[12px] text-foreground">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="size-3.5 accent-[var(--brand)]" />
                Active
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{field ? "Save field" : "Create field"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
