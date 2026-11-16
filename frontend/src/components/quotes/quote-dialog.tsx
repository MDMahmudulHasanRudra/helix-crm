"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useAccounts, useContacts, useDeals, useProducts } from "@/lib/api";
import type { QuoteDetail } from "@/lib/types";
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

const STATUSES = ["Draft", "Sent", "Accepted", "Declined", "Expired"];

export function QuoteDialog({
  open,
  onOpenChange,
  quote,
  presetDealId,
  presetAccountId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote?: QuoteDetail | null;
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
    expiryDate: "",
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
    const expiry = new Date(today.getTime() + 30 * 86_400_000);
    setForm({
      accountId: quote?.accountId ?? presetAccountId ?? "",
      dealId: quote?.dealId ?? presetDealId ?? "",
      contactId: quote?.contactId ?? "",
      status: quote?.status ?? "Draft",
      issueDate: toDateInput(quote?.issueDate ?? today.toISOString()),
      expiryDate: toDateInput(quote?.expiryDate ?? expiry.toISOString()),
      discountPercent: String(quote?.discountPercent ?? 0),
      taxPercent: String(quote?.taxPercent ?? 0),
      notes: quote?.notes ?? "",
      ownerId: quote?.ownerId ?? me.user.id,
    });
    setLines(
      quote?.lines.length
        ? quote.lines.map((line, index) => ({
            key: `${line.id}-${index}`,
            productId: line.productId ?? "",
            description: line.description,
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
            discountPercent: String(line.discountPercent),
          }))
        : [blankLine()],
    );
  }, [open, quote, presetDealId, presetAccountId, me.user.id]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((acc, line) => {
      const quantity = Number(line.quantity) || 0;
      const price = Number(line.unitPrice) || 0;
      const discount = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
      return acc + quantity * price * (1 - discount / 100);
    }, 0);
    const afterDiscount = subtotal * (1 - (Number(form.discountPercent) || 0) / 100);
    const tax = afterDiscount * ((Number(form.taxPercent) || 0) / 100);
    return { subtotal, tax, total: afterDiscount + tax };
  }, [lines, form.discountPercent, form.taxPercent]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function pickProduct(key: string, productId: string) {
    const product = products?.find((item) => item.id === productId);
    updateLine(key, {
      productId,
      description: product?.name ?? "",
      unitPrice: product ? String(product.unitPrice) : "",
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!lines.length || lines.every((line) => !line.description.trim() && !Number(line.unitPrice))) {
      toast.error("Add at least one line item");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        accountId: form.accountId || null,
        dealId: form.dealId || null,
        contactId: form.contactId || null,
        status: form.status,
        issueDate: form.issueDate ? fromDateInput(form.issueDate) : null,
        expiryDate: form.expiryDate ? fromDateInput(form.expiryDate) : null,
        currency: me.organization.currency,
        discountPercent: Number(form.discountPercent) || 0,
        taxPercent: Number(form.taxPercent) || 0,
        notes: form.notes || null,
        ownerId: form.ownerId || me.user.id,
        lines: lines
          .filter((line) => line.description.trim() || Number(line.unitPrice))
          .map((line) => ({
            productId: line.productId || null,
            description: line.description,
            quantity: Number(line.quantity) || 0,
            unitPrice: Number(line.unitPrice) || 0,
            discountPercent: Number(line.discountPercent) || 0,
          })),
      };
      const saved = quote
        ? await mutate<QuoteDetail>(`/quotes/${quote.id}`, "PUT", payload)
        : await mutate<QuoteDetail>("/quotes", "POST", payload);
      await globalMutate((key) =>
        typeof key === "string" && (key.startsWith("/quotes") || key.startsWith("/deals") || key.startsWith("/accounts") || key.startsWith("/dashboard") || key.startsWith("/reports")),
      );
      toast.success(quote ? "Quote updated" : `Quote ${saved.number} created`);
      onOpenChange(false);
      onSaved?.(saved.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save quote");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader
          title={quote ? `Edit ${quote.number}` : "New quote"}
          description="Price a deal, adjust line items and send a professional quote."
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Status">
                <NativeSelect value={form.status} onChange={(event) => set("status", event.target.value)}>
                  {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Account">
                <NativeSelect value={form.accountId} onChange={(event) => { set("accountId", event.target.value); set("dealId", ""); set("contactId", ""); }}>
                  <option value="">No account</option>
                  {(accounts?.items ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Deal">
                <NativeSelect value={form.dealId} onChange={(event) => set("dealId", event.target.value)}>
                  <option value="">No deal</option>
                  {availableDeals.map((deal) => <option key={deal.id} value={deal.id}>{deal.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Contact">
                <NativeSelect value={form.contactId} onChange={(event) => set("contactId", event.target.value)}>
                  <option value="">No contact</option>
                  {availableContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Issue date">
                <Input type="date" value={form.issueDate} onChange={(event) => set("issueDate", event.target.value)} />
              </Field>
              <Field label="Expiry date">
                <Input type="date" value={form.expiryDate} onChange={(event) => set("expiryDate", event.target.value)} />
              </Field>
              <Field label="Owner">
                <NativeSelect value={form.ownerId} onChange={(event) => set("ownerId", event.target.value)}>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Currency">
                <Input value={me.organization.currency} readOnly className="bg-surface-2 text-muted" />
              </Field>
            </div>

            <div className="rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Line items</span>
                <Button type="button" size="xs" variant="secondary" onClick={() => setLines((current) => [...current, blankLine()])}>
                  <Plus className="size-3" /> Add line
                </Button>
              </div>
              <div className="space-y-2 p-2">
                <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_70px_100px_80px_90px_28px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint md:grid">
                  <span>Product</span>
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit price</span>
                  <span>Disc %</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>
                {lines.map((line) => {
                  const lineTotal =
                    (Number(line.quantity) || 0) *
                    (Number(line.unitPrice) || 0) *
                    (1 - Math.min(100, Math.max(0, Number(line.discountPercent) || 0)) / 100);
                  return (
                    <div key={line.key} className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-surface-2/30 p-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_70px_100px_80px_90px_28px] md:items-center md:border-0 md:bg-transparent md:p-0">
                      <NativeSelect value={line.productId} onChange={(event) => pickProduct(line.key, event.target.value)} className="col-span-2 h-8 text-[12px] md:col-span-1">
                        <option value="">Custom item</option>
                        {(products ?? []).filter((product) => product.isActive).map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                      </NativeSelect>
                      <Input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} placeholder="Description" className="col-span-2 h-8 text-[12px] md:col-span-1" />
                      <Input type="number" min="0" step="0.5" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} className="h-8 text-[12px]" placeholder="1" />
                      <Input type="number" min="0" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} className="h-8 text-[12px]" placeholder="0" />
                      <Input type="number" min="0" max="100" value={line.discountPercent} onChange={(event) => updateLine(line.key, { discountPercent: event.target.value })} className="h-8 text-[12px]" placeholder="0" />
                      <div className="text-right text-[12px] font-medium tabular-nums">{money(lineTotal, me.organization.currency)}</div>
                      <IconButton
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove line"
                        onClick={() => setLines((current) => (current.length > 1 ? current.filter((item) => item.key !== line.key) : current))}
                        className="justify-self-end"
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quote discount %">
                  <Input type="number" min="0" max="100" value={form.discountPercent} onChange={(event) => set("discountPercent", event.target.value)} />
                </Field>
                <Field label="Tax %">
                  <Input type="number" min="0" max="100" value={form.taxPercent} onChange={(event) => set("taxPercent", event.target.value)} />
                </Field>
                <Field label="Notes" className="col-span-2">
                  <Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} placeholder="Payment terms, scope, assumptions…" />
                </Field>
              </div>
              <div className="space-y-1.5 rounded-lg border border-border bg-surface-2/40 p-3 text-[12px]">
                <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(totals.subtotal, me.organization.currency, { decimals: true })}</span></div>
                <div className="flex justify-between"><span className="text-muted">Discount</span><span className="tabular-nums text-danger">-{money(totals.subtotal - totals.subtotal * (1 - (Number(form.discountPercent) || 0) / 100), me.organization.currency, { decimals: true })}</span></div>
                <div className="flex justify-between"><span className="text-muted">Tax ({Number(form.taxPercent) || 0}%)</span><span className="tabular-nums">{money(totals.tax, me.organization.currency, { decimals: true })}</span></div>
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-[13px] font-semibold"><span>Total</span><span className="tabular-nums">{money(totals.total, me.organization.currency, { decimals: true })}</span></div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{quote ? "Save changes" : "Create quote"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function blankLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    productId: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    discountPercent: "0",
  };
}
