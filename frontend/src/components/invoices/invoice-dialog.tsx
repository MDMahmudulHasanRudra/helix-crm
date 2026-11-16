"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useAccounts, useContacts, useDeals, useProducts } from "@/lib/api";
import type { InvoiceDetail } from "@/lib/types";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Button, IconButton } from "@/components/ui/button";
import { fromDateInput, money, toDateInput } from "@/lib/utils";

interface LineDraft {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
}

const STATUSES = ["Draft", "Sent", "Paid", "PartiallyPaid", "Overdue", "Cancelled"];
const PAYMENT_TERMS = ["Due on Receipt", "Net 15", "Net 30", "Net 60"];

export function InvoiceDialog({
  open,
  onOpenChange,
  invoice,
  presetDealId,
  presetAccountId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: InvoiceDetail | null;
  presetDealId?: string;
  presetAccountId?: string;
  onSaved?: (id: string) => void;
}) {
  const { me, users } = useWorkspace();
  const { data: accounts } = useAccounts({ page: 1, pageSize: 200 });
  const { data: deals } = useDeals({ page: 1, pageSize: 200 });
  const { data: contacts } = useContacts({ page: 1, pageSize: 200 });
  const { data: products } = useProducts();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    accountId: "",
    dealId: "",
    contactId: "",
    status: "Draft",
    issueDate: "",
    dueDate: "",
    paymentTerms: "Net 30",
    discountPercent: "0",
    taxPercent: "0",
    notes: "",
    ownerId: "",
  });
  const [lines, setLines] = useState<LineDraft[]>([]);

  const availableContacts = useMemo(
    () => (contacts?.items ?? []).filter((contact) => !form.accountId || contact.accountId === form.accountId),
    [contacts, form.accountId],
  );
  const availableDeals = useMemo(
    () => (deals?.items ?? []).filter((deal) => !form.accountId || deal.accountId === form.accountId),
    [deals, form.accountId],
  );

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    const due = new Date(today.getTime() + 30 * 86_400_000);
    setForm({
      accountId: invoice?.accountId ?? presetAccountId ?? "",
      dealId: invoice?.dealId ?? presetDealId ?? "",
      contactId: invoice?.contactId ?? "",
      status: invoice?.status ?? "Draft",
      issueDate: toDateInput(invoice?.issueDate ?? today.toISOString()),
      dueDate: toDateInput(invoice?.dueDate ?? due.toISOString()),
      paymentTerms: invoice?.paymentTerms ?? "Net 30",
      discountPercent: String(invoice?.discountPercent ?? 0),
      taxPercent: String(invoice?.taxPercent ?? 0),
      notes: invoice?.notes ?? "",
      ownerId: invoice?.ownerId ?? me.user.id,
    });
    setLines(
      invoice?.lines.length
        ? invoice.lines.map((line, index) => ({
            key: `${line.id}-${index}`,
            productId: line.productId ?? "",
            description: line.description,
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
            discountPercent: String(line.discountPercent),
          }))
        : [blankLine()],
    );
  }, [open, invoice, presetDealId, presetAccountId, me.user.id]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => {
      const qty = Math.max(0, parseFloat(line.quantity) || 0);
      const price = Math.max(0, parseFloat(line.unitPrice) || 0);
      const disc = Math.min(100, Math.max(0, parseFloat(line.discountPercent) || 0));
      return sum + qty * price * (1 - disc / 100);
    }, 0);
    const orderDiscount = Math.min(100, Math.max(0, parseFloat(form.discountPercent) || 0));
    const taxRate = Math.min(100, Math.max(0, parseFloat(form.taxPercent) || 0));
    const afterDiscount = subtotal * (1 - orderDiscount / 100);
    const tax = (afterDiscount * taxRate) / 100;
    const total = afterDiscount + tax;
    return { subtotal, tax, total };
  }, [lines, form.discountPercent, form.taxPercent]);

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.productId && patch.productId !== line.productId) {
          const product = products?.find((p) => p.id === patch.productId);
          if (product) {
            next.description = product.name;
            next.unitPrice = String(product.unitPrice);
            if (!next.quantity || next.quantity === "0") next.quantity = "1";
          }
        }
        return next;
      }),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const validLines = lines
      .map((l) => ({
        productId: l.productId || null,
        description: l.description.trim(),
        quantity: Math.max(0, parseFloat(l.quantity) || 1),
        unitPrice: Math.max(0, parseFloat(l.unitPrice) || 0),
        discountPercent: Math.min(100, Math.max(0, parseFloat(l.discountPercent) || 0)),
      }))
      .filter((l) => l.description.length > 0 || (l.productId && l.unitPrice > 0));

    if (validLines.length === 0) {
      toast.error("Please add at least one line item with a description.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        accountId: form.accountId || null,
        dealId: form.dealId || null,
        contactId: form.contactId || null,
        status: form.status,
        issueDate: fromDateInput(form.issueDate),
        dueDate: fromDateInput(form.dueDate),
        paymentTerms: form.paymentTerms,
        currency: invoice?.currency ?? me.organization.currency ?? "USD",
        discountPercent: parseFloat(form.discountPercent) || 0,
        taxPercent: parseFloat(form.taxPercent) || 0,
        notes: form.notes.trim() || null,
        ownerId: form.ownerId || null,
        lines: validLines,
      };

      let result: InvoiceDetail;
      if (invoice) {
        result = await mutate<InvoiceDetail>(`/invoices/${invoice.id}`, "PUT", payload);
        toast.success("Invoice updated");
      } else {
        result = await mutate<InvoiceDetail>("/invoices", "POST", payload);
        toast.success("Invoice created");
      }

      await globalMutate((key) =>
        typeof key === "string" &&
        (key.startsWith("/invoices") ||
          key.startsWith("/accounts") ||
          key.startsWith("/deals") ||
          key.startsWith("/reports") ||
          key.startsWith("/dashboard")),
      );
      onOpenChange(false);
      onSaved?.(result.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <form onSubmit={submit}>
          <DialogHeader
            title={invoice ? `Edit invoice ${invoice.number}` : "New invoice"}
            description="Bill customers with line items, tax, payment terms, and track incoming payments."
          />
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Account">
                <NativeSelect
                  value={form.accountId}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountId: e.target.value, contactId: "", dealId: "" }))}
                >
                  <option value="">Select account...</option>
                  {(accounts?.items ?? []).map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Deal">
                <NativeSelect
                  value={form.dealId}
                  onChange={(e) => setForm((prev) => ({ ...prev, dealId: e.target.value }))}
                >
                  <option value="">Select deal (optional)...</option>
                  {availableDeals.map((deal) => (
                    <option key={deal.id} value={deal.id}>{deal.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Contact">
                <NativeSelect
                  value={form.contactId}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactId: e.target.value }))}
                >
                  <option value="">Select contact (optional)...</option>
                  {availableContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>{contact.fullName}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field label="Status">
                <NativeSelect
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Issue date">
                <Input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, issueDate: e.target.value }))}
                />
              </Field>
              <Field label="Due date">
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                />
              </Field>
              <Field label="Payment terms">
                <NativeSelect
                  value={form.paymentTerms}
                  onChange={(e) => setForm((prev) => ({ ...prev, paymentTerms: e.target.value }))}
                >
                  {PAYMENT_TERMS.map((term) => (
                    <option key={term} value={term}>{term}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Line items</span>
                <Button type="button" variant="outline" size="xs" onClick={addLine}>
                  <Plus className="size-3" /> Add item
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-surface-2/30 p-2.5">
                {lines.map((line, index) => (
                  <div key={line.key} className="grid grid-cols-12 items-center gap-2">
                    <div className="col-span-3">
                      <NativeSelect
                        value={line.productId}
                        onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                        className="text-[12px]"
                      >
                        <option value="">Custom product...</option>
                        {(products ?? []).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="col-span-4">
                      <Input
                        placeholder="Description"
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        className="text-[12px]"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        className="text-right text-[12px]"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Price"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                        className="text-right text-[12px]"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Disc %"
                        value={line.discountPercent}
                        onChange={(e) => updateLine(line.key, { discountPercent: e.target.value })}
                        className="text-right text-[12px]"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="xs"
                        aria-label="Remove line"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Order discount (%)">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.discountPercent}
                  onChange={(e) => setForm((prev) => ({ ...prev, discountPercent: e.target.value }))}
                />
              </Field>
              <Field label="Tax rate (%)">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.taxPercent}
                  onChange={(e) => setForm((prev) => ({ ...prev, taxPercent: e.target.value }))}
                />
              </Field>
              <Field label="Owner">
                <NativeSelect
                  value={form.ownerId}
                  onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="flex flex-col items-end border-t border-border pt-3">
              <div className="w-full max-w-[240px] space-y-1 text-[12px]">
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span className="tabular-nums text-foreground">{money(totals.subtotal, me.organization.currency)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Tax</span>
                  <span className="tabular-nums text-foreground">{money(totals.tax, me.organization.currency)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                  <span>Total</span>
                  <span className="tabular-nums">{money(totals.total, me.organization.currency)}</span>
                </div>
              </div>
            </div>

            <Field label="Notes / Payment instructions">
              <Textarea
                rows={2}
                placeholder="Bank account details, wire instructions or payment terms..."
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving..." : invoice ? "Save changes" : "Create invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function blankLine(): LineDraft {
  return {
    key: `line-${Math.random().toString(36).slice(2, 9)}`,
    productId: "",
    description: "",
    quantity: "1",
    unitPrice: "0",
    discountPercent: "0",
  };
}

