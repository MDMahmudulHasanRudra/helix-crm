"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LayoutGrid, List, Plus, Sparkles, ArrowRight, Upload } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { download, mutate, useLeads } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { cn, formatDate, money } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { NativeSelect, SearchInput } from "@/components/ui/fields";
import { Avatar, Badge, EmptyState, SegmentedControl, Skeleton } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/shared/data-table";
import { OwnerCell, ScoreBadge, StatusBadge } from "@/components/shared/badges";
import { LeadDialog } from "@/components/leads/lead-dialog";
import { ImportDialog } from "@/components/shared/import-dialog";
import type { LeadListItem } from "@/lib/types";

const PAGE_SIZE = 25;
const BOARD_STATUSES = ["New", "Contacted", "Qualified", "Unqualified"] as const;
const statusAccent: Record<string, string> = {
  New: "#0b7ec4",
  Contacted: "#5b5bd6",
  Qualified: "#0f9f6e",
  Unqualified: "#a1a1aa",
  Converted: "#0f9f6e",
};

export default function LeadsPage() {
  const router = useRouter();
  const { me, users } = useWorkspace();
  const [view, setView] = useState<"table" | "board">("table");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, mutate: refresh } = useLeads({
    search,
    status,
    source,
    ownerId,
    page: view === "board" ? 1 : page,
    pageSize: view === "board" ? 200 : PAGE_SIZE,
    sort: "updatedAt",
  });

  const columns = useMemo<Column<LeadListItem>[]>(
    () => [
      {
        key: "name",
        header: "Lead",
        width: "24%",
        render: (lead) => (
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-medium text-foreground">{lead.fullName}</div>
            <div className="truncate text-[10.5px] text-muted">{lead.company ?? lead.email ?? "—"}</div>
          </div>
        ),
      },
      { key: "status", header: "Status", width: "110px", render: (lead) => <StatusBadge status={lead.status} /> },
      { key: "score", header: "Score", width: "100px", render: (lead) => <ScoreBadge score={lead.score} /> },
      { key: "source", header: "Source", width: "130px", render: (lead) => <span className="text-muted">{lead.source}</span> },
      {
        key: "value",
        header: "Est. value",
        align: "right",
        width: "120px",
        render: (lead) => (
          <span className="tabular-nums font-medium">
            {lead.estimatedValue ? money(lead.estimatedValue, me.organization.currency) : "—"}
          </span>
        ),
      },
      { key: "owner", header: "Owner", width: "155px", render: (lead) => <OwnerCell name={lead.ownerName} avatarUrl={lead.ownerAvatarUrl} /> },
      { key: "updated", header: "Updated", align: "right", width: "110px", render: (lead) => <span className="text-[11.5px] text-muted">{formatDate(lead.updatedAt)}</span> },
    ],
    [me.organization.currency],
  );

  const boardLeads = (data?.items ?? []).filter((lead) => lead.status !== "Converted");
  const convertedCount = (data?.items ?? []).filter((lead) => lead.status === "Converted").length;
  const openValue = boardLeads.reduce((acc, lead) => acc + (lead.estimatedValue ?? 0), 0);

  async function moveLead(lead: LeadListItem, nextStatus: string) {
    if (lead.status === nextStatus) return;
    try {
      await mutate(`/leads/${lead.id}`, "PUT", {
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        title: lead.title,
        source: lead.source,
        status: nextStatus,
        score: lead.score,
        estimatedValue: lead.estimatedValue,
        ownerId: lead.ownerId,
      });
      await refresh();
      await globalMutate((key) => typeof key === "string" && key.startsWith("/dashboard"));
      toast.success(`Moved to ${nextStatus}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update lead");
    }
  }

  function openConvert(lead: LeadListItem) {
    router.push(`/leads/${lead.id}?convert=1`);
  }

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Leads"
        subtitle={
          data
            ? `${data.total} leads · ${money(openValue, me.organization.currency, { compact: true })} estimated value · ${convertedCount} converted`
            : "Inbound and outbound opportunities before they become deals"
        }
        actions={
          <>
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: "table", label: <><List /> Table</> },
                { value: "board", label: <><LayoutGrid /> Board</> },
              ]}
            />
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => download("/leads/export")}>
              <Download className="size-3.5" /> Export
            </Button>
            <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3.5" /> New lead
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search name, company, email…" className="w-full sm:w-[260px]" />
        {view === "table" ? (
          <NativeSelect value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[130px] text-[12px]">
            <option value="">All statuses</option>
            {["New", "Contacted", "Qualified", "Unqualified", "Converted"].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </NativeSelect>
        ) : null}
        <NativeSelect value={source} onChange={(event) => { setSource(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[130px] text-[12px]">
          <option value="">All sources</option>
          {["Website", "Outbound", "LinkedIn Ads", "Partner", "Referral", "Event", "Other"].map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </NativeSelect>
        <NativeSelect value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[140px] text-[12px]">
          <option value="">All owners</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.fullName}</option>
          ))}
        </NativeSelect>
        <Badge tone="outline" className="ml-auto">{data?.total ?? 0} leads</Badge>
      </div>

      {view === "table" ? (
        <div className="mt-2.5">
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            loading={isLoading}
            onRowClick={(lead) => router.push(`/leads/${lead.id}`)}
            emptyTitle="No leads found"
            emptyDescription="Try a different filter, or add your first lead."
            emptyAction={<Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}><Plus className="size-3.5" /> New lead</Button>}
            footer={data && data.total > 0 ? <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} /> : null}
          />
        </div>
      ) : (
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_STATUSES.map((statusName) => {
            const leads = boardLeads.filter((lead) => lead.status === statusName);
            const value = leads.reduce((acc, lead) => acc + (lead.estimatedValue ?? 0), 0);
            return (
              <div
                key={statusName}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/lead-id");
                  const lead = boardLeads.find((item) => item.id === id);
                  if (lead) void moveLead(lead, statusName);
                }}
                className="flex min-h-[280px] flex-col rounded-xl border border-border bg-surface-2/40"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: statusAccent[statusName] }} />
                    <span className="text-[11.5px] font-semibold">{statusName}</span>
                    <span className="text-[10.5px] text-faint">{leads.length}</span>
                  </div>
                  <span className="text-[10.5px] tabular-nums text-muted">{money(value, me.organization.currency, { compact: true })}</span>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-lg" />)
                  ) : leads.length ? (
                    leads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData("text/lead-id", lead.id)}
                        onClick={() => router.push(`/leads/${lead.id}`)}
                        className="group cursor-pointer rounded-lg border border-border bg-surface p-2.5 shadow-soft transition-colors hover:border-border-strong"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-medium">{lead.fullName}</div>
                            <div className="truncate text-[10.5px] text-muted">{lead.company ?? "No company"}</div>
                          </div>
                          <Avatar name={lead.ownerName} src={lead.ownerAvatarUrl} size="xs" />
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] font-semibold tabular-nums text-foreground">
                            {lead.estimatedValue ? money(lead.estimatedValue, me.organization.currency, { compact: true }) : "—"}
                          </span>
                          <ScoreBadge score={lead.score} />
                        </div>
                        {lead.status === "Qualified" ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openConvert(lead);
                            }}
                            className="mt-2 inline-flex h-6 w-full items-center justify-center gap-1 rounded-md border border-success/25 bg-success-soft text-[10.5px] font-medium text-success hover:bg-success/15"
                          >
                            Convert <ArrowRight className="size-3" />
                          </button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="flex h-24 items-center justify-center text-[11px] text-faint">Drop leads here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && (data?.total ?? 0) === 0 && !search && !status && !source && !ownerId ? (
        <div className="mt-6 rounded-xl border border-dashed border-border">
          <EmptyState
            icon={<Sparkles />}
            title="No leads yet"
            description="Capture inbound interest or start an outbound sequence. Qualified leads convert into accounts, contacts and deals."
            action={<Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}><Plus className="size-3.5" /> Add your first lead</Button>}
          />
        </div>
      ) : null}

      <LeadDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={() => void refresh()} />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityName="leads"
        title="Import leads"
        templateColumns={["firstName", "lastName", "company", "email", "phone", "title", "source", "status", "score", "estimatedValue"]}
        sampleRows={[["Leo", "Martins", "Brightpath", "leo@brightpath.co", "+1 212 555 0199", "Head of Sales", "Website", "New", "60", "12000"]]}
      />
    </div>
  );
}
