"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileText, Plus, Send, Timer } from "lucide-react";
import { download, useQuotes } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { formatDate, money, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { NativeSelect, SearchInput } from "@/components/ui/fields";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/shared/data-table";
import { OwnerCell, StatusBadge } from "@/components/shared/badges";
import { QuoteDialog } from "@/components/quotes/quote-dialog";
import type { QuoteListItem } from "@/lib/types";

const PAGE_SIZE = 25;
const STATUSES = ["Draft", "Sent", "Accepted", "Declined", "Expired"];

export default function QuotesPage() {
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
    const quoteId = params.get("quote");
    if (quoteId) {
      router.replace(`/quotes/${quoteId}`);
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

  const { data, isLoading, mutate: refresh } = useQuotes({ search, status, sort: "issueDate", page, pageSize: PAGE_SIZE });

  const summary = useMemo(() => {
    const items = data?.items ?? [];
    const accepted = items.filter((quote) => quote.status === "Accepted");
    const sent = items.filter((quote) => quote.status === "Sent");
    const draft = items.filter((quote) => quote.status === "Draft");
    return {
      pipeline: items.reduce((acc, quote) => acc + quote.total, 0),
      acceptedValue: accepted.reduce((acc, quote) => acc + quote.total, 0),
      accepted: accepted.length,
      sent: sent.length,
      draft: draft.length,
    };
  }, [data]);

  const columns = useMemo<Column<QuoteListItem>[]>(
    () => [
      {
        key: "number",
        header: "Quote",
        width: "24%",
        render: (quote) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-faint">{quote.number}</span>
              <span className="truncate text-[12.5px] font-medium text-foreground">{quote.accountName ?? "No account"}</span>
            </div>
            <div className="truncate text-[10.5px] text-muted">{quote.dealName ?? "No deal"}</div>
          </div>
        ),
      },
      { key: "status", header: "Status", width: "100px", render: (quote) => <StatusBadge status={quote.status} /> },
      { key: "issued", header: "Issued", width: "110px", render: (quote) => <span className="text-[11.5px] text-muted">{formatDate(quote.issueDate)}</span> },
      {
        key: "expiry",
        header: "Expires",
        width: "110px",
        render: (quote) => {
          const expired = quote.expiryDate ? new Date(quote.expiryDate) < new Date() && quote.status !== "Accepted" : false;
          return <span className={expired ? "text-[11.5px] font-medium text-danger" : "text-[11.5px] text-muted"}>{formatDate(quote.expiryDate)}</span>;
        },
      },
      { key: "total", header: "Total", align: "right", width: "120px", render: (quote) => <span className="font-medium tabular-nums">{money(quote.total, quote.currency)}</span> },
      { key: "owner", header: "Owner", width: "155px", render: (quote) => <OwnerCell name={quote.ownerName} /> },
      { key: "updated", header: "Updated", align: "right", width: "100px", render: (quote) => <span className="text-[11.5px] text-muted">{relativeTime(quote.updatedAt)}</span> },
    ],
    [],
  );

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Quotes"
        subtitle={data ? `${data.total} quotes · ${money(summary.pipeline, me.organization.currency, { compact: true })} in play · ${summary.accepted} accepted` : "Price deals and formalize what you're selling"}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => download("/quotes/export")}>
              <Download className="size-3.5" /> Export
            </Button>
            <Button variant="primary" size="sm" onClick={() => { setPresetDealId(undefined); setPresetAccountId(undefined); setDialogOpen(true); }}>
              <Plus className="size-3.5" /> New quote
            </Button>
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Quoted value", value: money(summary.pipeline, me.organization.currency, { compact: true }), detail: `${data?.total ?? 0} quotes`, icon: <FileText className="size-3.5" />, tone: "text-brand" },
          { label: "Accepted", value: money(summary.acceptedValue, me.organization.currency, { compact: true }), detail: `${summary.accepted} accepted`, icon: <CheckCircle2 className="size-3.5" />, tone: "text-success" },
          { label: "Sent", value: summary.sent, detail: "Awaiting response", icon: <Send className="size-3.5" />, tone: "text-info" },
          { label: "Drafts", value: summary.draft, detail: "Not sent yet", icon: <Timer className="size-3.5" />, tone: "text-muted" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
              <span className={item.tone}>{item.icon}</span>
            </div>
            <div className="mt-1.5 truncate text-[19px] font-semibold leading-none tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1.5 text-[11px] text-muted">{item.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search number, account, notes…" className="w-full sm:w-[260px]" />
        <NativeSelect value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[130px] text-[12px]">
          <option value="">All statuses</option>
          {STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
        </NativeSelect>
        <Badge tone="outline" className="ml-auto">{data?.total ?? 0} quotes</Badge>
      </div>

      <div className="mt-2.5">
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          loading={isLoading}
          onRowClick={(quote) => router.push(`/quotes/${quote.id}`)}
          emptyTitle="No quotes yet"
          emptyDescription="Bundle products and services into a quote for one of your deals."
          emptyAction={<Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}><Plus className="size-3.5" /> New quote</Button>}
          footer={data && data.total > 0 ? <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} /> : null}
        />
      </div>

      {!isLoading && (data?.total ?? 0) === 0 && !search && !status ? (
        <div className="mt-6 rounded-xl border border-dashed border-border">
          <EmptyState
            icon={<FileText />}
            title="Win business with clear pricing"
            description="Create a quote with line items, discounts and tax. Track when it is sent, accepted or declined."
            action={<Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}><Plus className="size-3.5" /> Create your first quote</Button>}
          />
        </div>
      ) : null}

      <QuoteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        presetDealId={presetDealId}
        presetAccountId={presetAccountId}
        onSaved={(id) => {
          void refresh();
          router.push(`/quotes/${id}`);
        }}
      />
    </div>
  );
}
