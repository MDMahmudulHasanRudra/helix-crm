"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, CircleDollarSign, Download, Plus, Receipt } from "lucide-react";
import { download, useInvoices, useInvoiceSummary } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { formatDate, money, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { NativeSelect, SearchInput } from "@/components/ui/fields";
import { DataTable, Pagination, type Column } from "@/components/shared/data-table";
import { OwnerCell, StatusBadge } from "@/components/shared/badges";
import { InvoiceDialog } from "@/components/invoices/invoice-dialog";
import type { InvoiceListItem } from "@/lib/types";

const PAGE_SIZE = 25;
const STATUSES = ["Draft", "Sent", "PartiallyPaid", "Paid", "Overdue", "Cancelled"];

export default function InvoicesPage() {
  const router = useRouter();
  const { me } = useWorkspace();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetDealId, setPresetDealId] = useState<string | undefined>();
  const [presetAccountId, setPresetAccountId] = useState<string | undefined>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get("invoice");
    if (invoiceId) {
      router.replace(`/invoices/${invoiceId}`);
      return;
    }
    const dealId = params.get("dealId") ?? undefined;
    const accountId = params.get("accountId") ?? undefined;
    if (dealId) setPresetDealId(dealId);
    if (accountId) setPresetAccountId(accountId);
    if (params.get("new") === "1" || dealId || accountId) setDialogOpen(true);
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, mutate: refresh } = useInvoices({
    search,
    status,
    sort: "issueDate",
    page,
    pageSize: PAGE_SIZE,
  });

  const { data: summary } = useInvoiceSummary();

  const columns = useMemo<Column<InvoiceListItem>[]>(
    () => [
      {
        key: "number",
        header: "Invoice",
        width: "24%",
        render: (inv) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-faint">{inv.number}</span>
              <span className="truncate text-[12.5px] font-medium text-foreground">{inv.accountName ?? "No account"}</span>
            </div>
            <div className="truncate text-[10.5px] text-muted">{inv.dealName ?? "No deal"}</div>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "110px",
        render: (inv) => <StatusBadge status={inv.status} />,
      },
      {
        key: "issued",
        header: "Issued",
        width: "110px",
        render: (inv) => <span className="text-[11.5px] text-muted">{formatDate(inv.issueDate)}</span>,
      },
      {
        key: "due",
        header: "Due",
        width: "110px",
        render: (inv) => {
          const overdue =
            inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "Paid" && inv.status !== "Cancelled";
          return (
            <span className={overdue ? "text-[11.5px] font-medium text-danger" : "text-[11.5px] text-muted"}>
              {formatDate(inv.dueDate)}
            </span>
          );
        },
      },
      {
        key: "total",
        header: "Total",
        align: "right",
        width: "120px",
        render: (inv) => <span className="font-medium tabular-nums">{money(inv.total, inv.currency)}</span>,
      },
      {
        key: "balanceDue",
        header: "Balance Due",
        align: "right",
        width: "120px",
        render: (inv) => (
          <span className={`tabular-nums ${inv.balanceDue > 0 ? "font-semibold text-danger" : "text-muted"}`}>
            {money(inv.balanceDue, inv.currency)}
          </span>
        ),
      },
      {
        key: "owner",
        header: "Owner",
        width: "155px",
        render: (inv) => <OwnerCell name={inv.ownerName} />,
      },
      {
        key: "updated",
        header: "Updated",
        align: "right",
        width: "100px",
        render: (inv) => <span className="text-[11.5px] text-muted">{relativeTime(inv.updatedAt)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="animate-in-fade space-y-4">
      <PageHeader
        title="Invoices"
        subtitle="Issue professional tax invoices, record payments, and track revenue receivables."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => download(`/invoices/export?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`)}
            >
              <Download className="size-3.5" /> Export
            </Button>
            <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3.5" /> New invoice
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <Receipt className="size-3.5 text-brand" /> Total invoiced
          </div>
          <div className="mt-1 text-[18px] font-semibold tabular-nums text-foreground">
            {money(summary?.totalInvoiced ?? 0, me.organization.currency)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{summary?.invoiceCount ?? 0} invoices</div>
        </div>

        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <CheckCircle2 className="size-3.5 text-success" /> Collected / Paid
          </div>
          <div className="mt-1 text-[18px] font-semibold tabular-nums text-success">
            {money(summary?.totalPaid ?? 0, me.organization.currency)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">Cleared funds</div>
        </div>

        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <CircleDollarSign className="size-3.5 text-warning" /> Outstanding balance
          </div>
          <div className="mt-1 text-[18px] font-semibold tabular-nums text-foreground">
            {money(summary?.balanceDue ?? 0, me.organization.currency)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">Pending receivables</div>
        </div>

        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <AlertCircle className="size-3.5 text-danger" /> Overdue
          </div>
          <div className="mt-1 text-[18px] font-semibold tabular-nums text-danger">
            {summary?.overdueCount ?? 0}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">Past payment terms</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            placeholder="Search invoices by number, account or notes..."
            value={searchInput}
            onChange={setSearchInput}
            className="w-72"
          />
          <NativeSelect
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-40"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex items-center gap-1.5">
          {["", "Draft", "Sent", "PartiallyPaid", "Paid", "Overdue"].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatus(st);
                setPage(1);
              }}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                status === st
                  ? "bg-brand text-brand-foreground"
                  : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {st === "" ? "All" : st}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        onRowClick={(inv) => router.push(`/invoices/${inv.id}`)}
        emptyTitle="No invoices found"
        emptyDescription="Create an invoice or convert an accepted quote to start tracking payments."
        emptyAction={
          <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-3.5" /> Create invoice
          </Button>
        }
        footer={
          data && data.total > 0 ? (
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
          ) : null
        }
      />

      <InvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        presetDealId={presetDealId}
        presetAccountId={presetAccountId}
        onSaved={(id) => {
          void refresh();
          router.push(`/invoices/${id}`);
        }}
      />
    </div>
  );
}

