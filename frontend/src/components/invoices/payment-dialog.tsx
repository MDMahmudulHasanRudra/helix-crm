"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate } from "@/lib/api";
import type { InvoiceDetail } from "@/lib/types";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { fromDateInput, money, toDateInput } from "@/lib/utils";

const PAYMENT_METHODS = [
  "Bank Transfer",
  "Credit Card",
  "Wire Transfer (ACH)",
  "Check",
  "Cash",
  "Stripe",
  "PayPal",
];

export function PaymentDialog({
  open,
  onOpenChange,
  invoice,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceDetail;
  onRecorded?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    paymentDate: "",
    paymentMethod: "Bank Transfer",
    reference: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      amount: String(invoice.balanceDue > 0 ? invoice.balanceDue : invoice.total),
      paymentDate: toDateInput(new Date().toISOString()),
      paymentMethod: "Bank Transfer",
      reference: "",
      notes: "",
    });
  }, [open, invoice]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) {
      toast.error("Please enter a valid payment amount greater than zero.");
      return;
    }

    setSaving(true);
    try {
      await mutate(`/invoices/${invoice.id}/payments`, "POST", {
        amount,
        paymentDate: fromDateInput(form.paymentDate),
        paymentMethod: form.paymentMethod,
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
      });

      toast.success(`Payment of ${money(amount, invoice.currency)} recorded`);
      await globalMutate((key) =>
        typeof key === "string" &&
        (key.startsWith("/invoices") ||
          key.startsWith("/accounts") ||
          key.startsWith("/deals") ||
          key.startsWith("/reports") ||
          key.startsWith("/dashboard")),
      );
      onOpenChange(false);
      onRecorded?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit}>
          <DialogHeader
            title={`Record payment for ${invoice.number}`}
            description={`Outstanding balance: ${money(invoice.balanceDue, invoice.currency)}`}
          />
          <DialogBody className="space-y-3">
            <Field label="Payment amount">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={invoice.balanceDue > 0 ? invoice.balanceDue : undefined}
                required
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </Field>

            <Field label="Payment date">
              <Input
                type="date"
                required
                value={form.paymentDate}
                onChange={(e) => setForm((prev) => ({ ...prev, paymentDate: e.target.value }))}
              />
            </Field>

            <Field label="Payment method">
              <NativeSelect
                value={form.paymentMethod}
                onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Reference / Transaction ID">
              <Input
                placeholder="e.g. WIRE-884192 or CHK-4001"
                value={form.reference}
                onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
              />
            </Field>

            <Field label="Internal notes">
              <Textarea
                rows={2}
                placeholder="Optional notes about the transaction..."
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
              {saving ? "Recording..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

