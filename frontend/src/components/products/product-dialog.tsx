"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate } from "@/lib/api";
import type { Product } from "@/lib/types";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";

export function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  categories: string[];
  onSaved?: () => void;
}) {
  const { me } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    description: "",
    unitPrice: "",
    taxRate: "0",
    category: "",
    isActive: true,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      description: product?.description ?? "",
      unitPrice: product ? String(product.unitPrice) : "",
      taxRate: String(product?.taxRate ?? 0),
      category: product?.category ?? "",
      isActive: product?.isActive ?? true,
    });
  }, [open, product]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku || null,
        description: form.description || null,
        unitPrice: Number(form.unitPrice) || 0,
        currency: me.organization.currency,
        taxRate: Number(form.taxRate) || 0,
        category: form.category || null,
        isActive: form.isActive,
      };
      if (product) await mutate(`/products/${product.id}`, "PUT", payload);
      else await mutate("/products", "POST", payload);
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/products") || key.startsWith("/quotes")));
      toast.success(product ? "Product updated" : "Product created");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          title={product ? `Edit ${product.name}` : "New product"}
          description="Products and services you can add to quotes."
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <Field label="Name" required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Platform license" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU">
                <Input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="PLAT-001" />
              </Field>
              <Field label="Category">
                <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Software" list="product-categories" />
                <datalist id="product-categories">
                  {categories.map((category) => <option key={category} value={category} />)}
                </datalist>
              </Field>
              <Field label={`Unit price (${me.organization.currency})`}>
                <Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} />
              </Field>
              <Field label="Tax rate %">
                <Input type="number" min="0" max="100" value={form.taxRate} onChange={(event) => setForm({ ...form, taxRate: event.target.value })} />
              </Field>
              <Field label="Status">
                <NativeSelect value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm({ ...form, isActive: event.target.value === "active" })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </NativeSelect>
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{product ? "Save changes" : "Create product"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
