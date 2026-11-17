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
  FileText,
  Mail,
  MoreHorizontal,
  Pencil,
  Printer,
  Receipt,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useQuote } from "@/lib/api";
import type { InvoiceDetail } from "@/lib/types";
import { formatDate, formatDateTime, money, pluralize } from "@/lib/utils";
import { DetailField } from "@/components/ui/layout";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/overlays";
import { AuditTrail } from "@/components/shared/record-sections";
import { StatusBadge } from "@/components/shared/badges";
import { QuoteDialog } from "@/components/quotes/quote-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const DOC_STATUSES = ["Draft", "Sent", "Accepted", "Declined", "Expired"];

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: quote, isLoading, mutate: refresh } = useQuote(params.id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [sending, setSending] = useState(false);

  if (isLoading && !quote) return <DetailSkeleton />;

  if (!quote) {
    return (
      <div className="grid place-items-center py-24">
        <EmptyState
          icon={<FileText />}
          title="Quote not found"
          description="It may have been deleted, or you may not have access."
          action={<Button variant="primary" size="sm" asChild><Link href="/quotes">Back to quotes</Link></Button>}
        />
      </div>
    );
  }

  async function setStatus(status: string) {
    setUpdating(true);
    try {
      await mutate(`/quotes/${quote!.id}/status`, "PATCH", { status });
      await refresh();
      await globalMutate((key) =>
        typeof key === "string" && (key.startsWith("/quotes") || key.startsWith("/accounts") || key.startsWith("/deals") || key.startsWith("/reports")),
      );
      toast.success(`Quote marked ${status.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update quote");
    } finally {
      setUpdating(false);
    }
  }

  async function sendQuote() {
    setSending(true);
    try {
      await mutate(`/quotes/${quote!.id}/send`, "POST", {});
      await refresh();
      await globalMutate((key) =>
        typeof key === "string" && (key.startsWith("/quotes") || key.startsWith("/accounts") || key.startsWith("/deals") || key.startsWith("/reports") || key.startsWith("/email")),
      );
      toast.success("Quote queued for email delivery");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send quote");
    } finally {
      setSending(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await mutate(`/quotes/${quote!.id}`, "DELETE");
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/quotes") || key.startsWith("/accounts") || key.startsWith("/deals") || key.startsWith("/reports")));
      toast.success("Quote deleted");
      router.push("/quotes");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete quote");
      setDeleting(false);
    }
  }

  async function convertToInvoice() {
    setConverting(true);
    try {
      const inv = await mutate<InvoiceDetail>(`/invoices/from-quote/${quote!.id}`, "POST");
      toast.success(`Created invoice ${inv.number}`);
      router.push(`/invoices/${inv.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to convert quote to invoice");
      setConverting(false);
    }
  }

  const expired = quote.expiryDate ? new Date(quote.expiryDate) < new Date() : false;
  const discountValue = quote.subtotal - quote.subtotal * (1 - quote.discountPercent / 100);

  return (
    <div className="animate-in-fade">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted">
        <Link href="/quotes" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> Quotes
        </Link>
        <ChevronRight className="size-3 text-faint" />
        <span className="font-mono text-faint">{quote.number}</span>
        <ChevronRight className="size-3 text-faint" />
        <span className="truncate text-foreground">{quote.accountName ?? "Quote"}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground">Quote {quote.number}</h1>
              <StatusBadge status={quote.status} />
              {expired && quote.status !== "Accepted" ? <Badge tone="warning">Expired {formatDate(quote.expiryDate)}</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span className="text-[15px] font-semibold tabular-nums text-foreground">{money(quote.total, quote.currency)}</span>
              {quote.accountId ? <Link href={`/accounts/${quote.accountId}`} className="inline-flex items-center gap-1 hover:text-foreground"><Building2 className="size-3" /> {quote.accountName}</Link> : null}
              {quote.dealId ? <Link href={`/deals/${quote.dealId}`} className="inline-flex items-center gap-1 hover:text-foreground"><CircleDollarSign className="size-3" /> {quote.dealName}</Link> : null}
              <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" /> Issued {formatDate(quote.issueDate)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Print
          </Button>
          {quote.status === "Draft" || quote.status === "Sent" ? (
            <Button variant="outline" size="sm" onClick={() => void sendQuote()} loading={sending} disabled={updating}>
              <Mail className="size-3.5" /> {quote.status === "Draft" ? "Send quote" : "Resend"}
            </Button>
          ) : null}
          {quote.status !== "Accepted" ? (
            <Button variant="primary" size="sm" onClick={() => void setStatus("Accepted")} disabled={updating}>
              <CheckCircle2 className="size-3.5" /> Accept
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => void convertToInvoice()} disabled={converting}>
                <Receipt className="size-3.5" /> Convert to Invoice
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="size-3.5" /> Edit
              </Button>
            </div>
          )}
          <Dropdown>
            <DropdownTrigger asChild>
              <IconButton variant="outline" aria-label="More actions"><MoreHorizontal className="size-4" /></IconButton>
            </DropdownTrigger>
            <DropdownContent>
              {DOC_STATUSES.filter((status) => status !== quote.status).map((status) => (
                <DropdownItem key={status} onSelect={() => void setStatus(status)}>
                  Mark {status.toLowerCase()}
                </DropdownItem>
              ))}
              <DropdownSeparator />
              <DropdownItem icon={<XCircle />} onSelect={() => void setStatus("Declined")}>Mark declined</DropdownItem>
              <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleteOpen(true)}>Delete quote</DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Quote</div>
              <div className="mt-1 font-mono text-[18px] font-semibold text-foreground">{quote.number}</div>
              <div className="mt-1 text-[11.5px] text-muted">Issued {formatDate(quote.issueDate, "long")}</div>
              {quote.expiryDate ? <div className="text-[11.5px] text-muted">Valid until {formatDate(quote.expiryDate, "long")}</div> : null}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Prepared for</div>
              <div className="mt-1 text-[13px] font-semibold text-foreground">{quote.accountName ?? "—"}</div>
              {quote.contactName ? <div className="text-[11.5px] text-muted">{quote.contactName}</div> : null}
              {quote.dealName ? <div className="text-[11.5px] text-muted">Deal: {quote.dealName}</div> : null}
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
                {quote.lines.length ? quote.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border/60 last:border-0">
                    <td className="px-6 py-2.5">
                      <div className="text-[12.5px] font-medium text-foreground">{line.description || line.productName || "Item"}</div>
                      {line.productName && line.description !== line.productName ? <div className="text-[10.5px] text-faint">{line.productName}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{line.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{money(line.unitPrice, quote.currency, { decimals: true })}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{line.discountPercent ? `${line.discountPercent}%` : "—"}</td>
                    <td className="px-6 py-2.5 text-right text-[12.5px] font-medium tabular-nums text-foreground">{money(line.lineTotal, quote.currency, { decimals: true })}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-[12px] text-muted">No line items on this quote.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-end border-t border-border px-6 py-4">
            <div className="w-full max-w-[280px] space-y-1.5 text-[12px]">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums text-foreground">{money(quote.subtotal, quote.currency, { decimals: true })}</span></div>
              {quote.discountPercent ? <div className="flex justify-between"><span className="text-muted">Discount ({quote.discountPercent}%)</span><span className="tabular-nums text-danger">-{money(discountValue, quote.currency, { decimals: true })}</span></div> : null}
              <div className="flex justify-between"><span className="text-muted">Tax ({quote.taxPercent}%)</span><span className="tabular-nums text-foreground">{money(quote.taxTotal, quote.currency, { decimals: true })}</span></div>
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-[14px] font-semibold"><span>Total</span><span className="tabular-nums">{money(quote.total, quote.currency, { decimals: true })}</span></div>
            </div>
          </div>

          {quote.notes ? (
            <div className="border-t border-border bg-surface-2/30 px-6 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Notes</div>
              <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-muted">{quote.notes}</p>
            </div>
          ) : null}
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Quote summary" />
            <div className="space-y-3 px-4 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Status">{quote.status}</DetailField>
                <DetailField label="Total">{money(quote.total, quote.currency)}</DetailField>
                <DetailField label="Issued">{formatDate(quote.issueDate)}</DetailField>
                <DetailField label="Expires">{quote.expiryDate ? formatDate(quote.expiryDate) : null}</DetailField>
                <DetailField label="Tax">{quote.taxPercent}%</DetailField>
                <DetailField label="Discount">{quote.discountPercent}%</DetailField>
              </div>
              <div className="border-t border-border pt-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={quote.ownerName} src={quote.ownerAvatarUrl} size="md" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Owner</div>
                    <div className="truncate text-[12.5px] font-medium text-foreground">{quote.ownerName ?? "Unassigned"}</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <DetailField label="Created">{formatDate(quote.createdAt)}</DetailField>
                <DetailField label="Updated">{formatDateTime(quote.updatedAt)}</DetailField>
              </div>
              <div className="border-t border-border pt-3 text-[11px] text-muted">
                {pluralize(quote.lines.length, "line item")} · {quote.currency}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Linked records" />
            <div className="space-y-2 px-4 pb-4">
              {quote.accountId ? (
                <Link href={`/accounts/${quote.accountId}`} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[12px] transition-colors hover:border-border-strong">
                  <Building2 className="size-3.5 text-faint" />
                  <span className="min-w-0 flex-1 truncate">{quote.accountName}</span>
                  <ChevronRight className="size-3 text-faint" />
                </Link>
              ) : null}
              {quote.dealId ? (
                <Link href={`/deals/${quote.dealId}`} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[12px] transition-colors hover:border-border-strong">
                  <CircleDollarSign className="size-3.5 text-faint" />
                  <span className="min-w-0 flex-1 truncate">{quote.dealName}</span>
                  <ChevronRight className="size-3 text-faint" />
                </Link>
              ) : null}
              {quote.contactId ? (
                <Link href={`/contacts/${quote.contactId}`} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[12px] transition-colors hover:border-border-strong">
                  <Avatar name={quote.contactName} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{quote.contactName}</span>
                  <ChevronRight className="size-3 text-faint" />
                </Link>
              ) : null}
              {!quote.accountId && !quote.dealId && !quote.contactId ? <div className="text-[11.5px] text-faint">No linked records.</div> : null}
            </div>
          </Card>

          <AuditTrail entries={quote.audit} />
        </div>
      </div>

      <QuoteDialog open={editOpen} onOpenChange={setEditOpen} quote={quote} onSaved={() => void refresh()} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${quote.number}?`}
        description="The quote will be archived and removed from reporting."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <Skeleton className="h-[520px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    </div>
  );
}
