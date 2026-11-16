"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileText,
  Mail,
  MoreHorizontal,
  Pencil,
  Printer,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useInvoice } from "@/lib/api";
import { formatDate, formatDateTime, money } from "@/lib/utils";
import { DetailField } from "@/components/ui/layout";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/overlays";
import { AuditTrail } from "@/components/shared/record-sections";
import { StatusBadge } from "@/components/shared/badges";
import { InvoiceDialog } from "@/components/invoices/invoice-dialog";
import { PaymentDialog } from "@/components/invoices/payment-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const INVOICE_STATUSES = ["Draft", "Sent", "PartiallyPaid", "Paid", "Overdue", "Cancelled"];

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: invoice, isLoading, mutate: refresh } = useInvoice(params.id);
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState(false);

  if (isLoading && !invoice) return <DetailSkeleton />;

  if (!invoice) {
    return (
      <div className="grid place-items-center py-24">
        <EmptyState
          icon={<FileText />}
          title="Invoice not found"
          description="It may have been deleted, or you may not have access."
          action={<Button variant="primary" size="sm" asChild><Link href="/invoices">Back to invoices</Link></Button>}
        />
      </div>
    );
  }

  async function setStatus(status: string) {
    setUpdating(true);
    try {
      await mutate(`/invoices/${invoice!.id}/status`, "PATCH", { status });
      await refresh();
      await globalMutate((key) =>
        typeof key === "string" && (key.startsWith("/invoices") || key.startsWith("/accounts") || key.startsWith("/deals") || key.startsWith("/reports")),
      );
      toast.success(`Invoice marked ${status.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update invoice");
    } finally {
      setUpdating(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await mutate(`/invoices/${invoice!.id}`, "DELETE");
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/invoices") || key.startsWith("/accounts") || key.startsWith("/deals") || key.startsWith("/reports")));
      toast.success("Invoice deleted");
      router.push("/invoices");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete invoice");
      setDeleting(false);
    }
  }

  const overdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== "Paid" && invoice.status !== "Cancelled";
  const discountValue = invoice.subtotal - invoice.subtotal * (1 - invoice.discountPercent / 100);

  return (
    <div className="animate-in-fade space-y-4">
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <Link href="/invoices" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> Invoices
        </Link>
        <ChevronRight className="size-3 text-faint" />
        <span className="font-mono text-faint">{invoice.number}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
              Invoice {invoice.number}
            </h1>
            <StatusBadge status={invoice.status} />
            {overdue ? <Badge tone="danger">Overdue {formatDate(invoice.dueDate)}</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            <span className="text-[15px] font-semibold tabular-nums text-foreground">{money(invoice.total, invoice.currency)}</span>
            {invoice.accountId ? (
              <Link href={`/accounts/${invoice.accountId}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Building2 className="size-3" /> {invoice.accountName}
              </Link>
            ) : null}
            {invoice.dealId ? (
              <Link href={`/deals/${invoice.dealId}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <CircleDollarSign className="size-3" /> {invoice.dealName}
              </Link>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" /> Issued {formatDate(invoice.issueDate)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Print
          </Button>

          {invoice.status !== "Paid" && invoice.status !== "Cancelled" ? (
            <Button variant="primary" size="sm" onClick={() => setPaymentOpen(true)}>
              <CreditCard className="size-3.5" /> Record payment
            </Button>
          ) : null}

          {invoice.status === "Draft" ? (
            <Button variant="outline" size="sm" onClick={() => void setStatus("Sent")} disabled={updating}>
              <Mail className="size-3.5" /> Mark sent
            </Button>
          ) : null}

          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>

          <Dropdown>
            <DropdownTrigger asChild>
              <IconButton variant="outline" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </IconButton>
            </DropdownTrigger>
            <DropdownContent>
              {INVOICE_STATUSES.filter((st) => st !== invoice.status).map((st) => (
                <DropdownItem key={st} onSelect={() => void setStatus(st)}>
                  Mark {st.toLowerCase()}
                </DropdownItem>
              ))}
              <DropdownSeparator />
              <DropdownItem icon={<XCircle />} onSelect={() => void setStatus("Cancelled")}>
                Mark cancelled
              </DropdownItem>
              <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleteOpen(true)}>
                Delete invoice
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Printable Tax Invoice Document Layout */}
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Tax Invoice</div>
              <div className="mt-1 font-mono text-[18px] font-semibold text-foreground">{invoice.number}</div>
              <div className="mt-1 text-[11.5px] text-muted">Issued {formatDate(invoice.issueDate, "long")}</div>
              {invoice.dueDate ? (
                <div className="text-[11.5px] text-muted">
                  Due {formatDate(invoice.dueDate, "long")} ({invoice.paymentTerms ?? "Net 30"})
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Billed to</div>
              <div className="mt-1 text-[13px] font-semibold text-foreground">{invoice.accountName ?? "—"}</div>
              {invoice.contactName ? <div className="text-[11.5px] text-muted">{invoice.contactName}</div> : null}
              {invoice.dealName ? <div className="text-[11.5px] text-muted">Deal: {invoice.dealName}</div> : null}
              {invoice.quoteNumber ? (
                <div className="text-[11.5px] text-muted">Quote: {invoice.quoteNumber}</div>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-2/40">
                  <th className="px-6 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Description</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Qty</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Unit price</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Disc</th>
                  <th className="px-6 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.length ? (
                  invoice.lines.map((line) => (
                    <tr key={line.id} className="border-b border-border/60 last:border-0">
                      <td className="px-6 py-2.5">
                        <div className="text-[12.5px] font-medium text-foreground">
                          {line.description || line.productName || "Item"}
                        </div>
                        {line.productName && line.description !== line.productName ? (
                          <div className="text-[10.5px] text-faint">{line.productName}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{line.quantity}</td>
                      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">
                        {money(line.unitPrice, invoice.currency, { decimals: true })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">
                        {line.discountPercent ? `${line.discountPercent}%` : "—"}
                      </td>
                      <td className="px-6 py-2.5 text-right text-[12.5px] font-medium tabular-nums text-foreground">
                        {money(line.lineTotal, invoice.currency, { decimals: true })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[12px] text-muted">
                      No line items on this invoice.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-end border-t border-border px-6 py-4">
            <div className="w-full max-w-[280px] space-y-1.5 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="tabular-nums text-foreground">{money(invoice.subtotal, invoice.currency, { decimals: true })}</span>
              </div>
              {invoice.discountPercent ? (
                <div className="flex justify-between">
                  <span className="text-muted">Discount ({invoice.discountPercent}%)</span>
                  <span className="tabular-nums text-danger">-{money(discountValue, invoice.currency, { decimals: true })}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted">Tax ({invoice.taxPercent}%)</span>
                <span className="tabular-nums text-foreground">{money(invoice.taxTotal, invoice.currency, { decimals: true })}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-[14px] font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(invoice.total, invoice.currency, { decimals: true })}</span>
              </div>
              <div className="flex justify-between text-success">
                <span>Amount paid</span>
                <span className="tabular-nums">{money(invoice.amountPaid, invoice.currency, { decimals: true })}</span>
              </div>
              <div className="flex justify-between font-bold text-danger">
                <span>Balance due</span>
                <span className="tabular-nums">{money(invoice.balanceDue, invoice.currency, { decimals: true })}</span>
              </div>
            </div>
          </div>

          {/* Payment History Table */}
          {invoice.payments.length ? (
            <div className="border-t border-border bg-surface-2/20 px-6 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Recorded Payments</div>
              <div className="mt-2 divide-y divide-border/60">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-[12px]">
                    <div>
                      <span className="font-medium text-foreground">{p.paymentMethod}</span>
                      {p.reference ? <span className="ml-2 font-mono text-faint">({p.reference})</span> : null}
                      <div className="text-[11px] text-muted">{formatDateTime(p.paymentDate)}</div>
                    </div>
                    <div className="font-semibold tabular-nums text-success">
                      +{money(p.amount, invoice.currency, { decimals: true })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {invoice.notes ? (
            <div className="border-t border-border bg-surface-2/30 px-6 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Payment Instructions / Notes</div>
              <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-muted">{invoice.notes}</p>
            </div>
          ) : null}
        </Card>

        {/* Sidebar Summary */}
        <div className="space-y-3">
          <Card>
            <CardHeader title="Invoice summary" />
            <div className="space-y-3 px-4 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Status">{invoice.status}</DetailField>
                <DetailField label="Terms">{invoice.paymentTerms ?? "Net 30"}</DetailField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Total">{money(invoice.total, invoice.currency)}</DetailField>
                <DetailField label="Balance due">
                  <span className={invoice.balanceDue > 0 ? "font-bold text-danger" : "text-success"}>
                    {money(invoice.balanceDue, invoice.currency)}
                  </span>
                </DetailField>
              </div>
              <DetailField label="Owner">
                <div className="flex items-center gap-2">
                  <Avatar name={invoice.ownerName ?? "Unassigned"} src={invoice.ownerAvatarUrl} size="sm" />
                  <span className="text-[12px] font-medium text-foreground">{invoice.ownerName ?? "Unassigned"}</span>
                </div>
              </DetailField>
              <div className="border-t border-border pt-2">
                <DetailField label="Created">{formatDateTime(invoice.createdAt)}</DetailField>
              </div>
            </div>
          </Card>

          <AuditTrail entries={invoice.audit} />
        </div>
      </div>

      <InvoiceDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        invoice={invoice}
        onSaved={() => void refresh()}
      />

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        invoice={invoice}
        onRecorded={() => void refresh()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete invoice?"
        description="This will permanently soft-delete this invoice and preserve the audit log."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-36" />
      <div className="flex justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

