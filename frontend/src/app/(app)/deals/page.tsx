"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Download,
  LayoutGrid,
  List,
  Plus,
  Trophy,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { download, mutate, useBoard, useDeals } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { cn, formatDate, money } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { NativeSelect, SearchInput } from "@/components/ui/fields";
import { Avatar, Badge, EmptyState, SegmentedControl, Skeleton } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/shared/data-table";
import { OwnerCell, StatusBadge } from "@/components/shared/badges";
import { DealDialog } from "@/components/deals/deal-dialog";
import type { BoardStage, DealListItem } from "@/lib/types";

const PAGE_SIZE = 25;

export default function DealsPage() {
  const router = useRouter();
  const { me, users } = useWorkspace();
  const [view, setView] = useState<"board" | "table">("board");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetStageId, setPresetStageId] = useState<string | undefined>();
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const account = params.get("accountId");
    if (account) {
      setAccountId(account);
      setView("table");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: board, isLoading: boardLoading, mutate: refreshBoard } = useBoard({
    pipelineId,
    ownerId,
    search,
  });

  const { data: table, isLoading: tableLoading, mutate: refreshTable } = useDeals({
    search,
    ownerId,
    pipelineId,
    accountId,
    page,
    pageSize: PAGE_SIZE,
    sort: "updatedAt",
  });

  const currency = me.organization.currency;

  const columns = useMemo<Column<DealListItem>[]>(
    () => [
      {
        key: "name",
        header: "Deal",
        width: "26%",
        render: (deal) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12.5px] font-medium text-foreground">{deal.name}</span>
              {deal.isStalled ? <Badge tone="danger">Stalled</Badge> : null}
            </div>
            <div className="truncate text-[10.5px] text-muted">{deal.accountName ?? "No account"}</div>
          </div>
        ),
      },
      {
        key: "stage",
        header: "Stage",
        width: "150px",
        render: (deal) => (
          <span
            className="inline-flex h-[21px] items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium"
            style={{
              backgroundColor: `${deal.stageColor}14`,
              borderColor: `${deal.stageColor}30`,
              color: deal.stageColor,
            }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: deal.stageColor }} />
            {deal.stageName}
          </span>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        width: "120px",
        render: (deal) => <span className="font-medium tabular-nums">{money(deal.amount, deal.currency, { compact: true })}</span>,
      },
      {
        key: "probability",
        header: "Probability",
        width: "110px",
        render: (deal) => (
          <div className="flex items-center gap-1.5">
            <span className="h-1 w-9 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${deal.probability}%` }} />
            </span>
            <span className="tabular-nums text-[11.5px] text-muted">{deal.probability}%</span>
          </div>
        ),
      },
      {
        key: "close",
        header: "Close date",
        width: "120px",
        render: (deal) => (
          <span className={cn("text-[11.5px]", deal.expectedCloseDate && new Date(deal.expectedCloseDate) < new Date() ? "text-danger" : "text-muted")}>
            {formatDate(deal.expectedCloseDate)}
          </span>
        ),
      },
      { key: "owner", header: "Owner", width: "155px", render: (deal) => <OwnerCell name={deal.ownerName} avatarUrl={deal.ownerAvatarUrl} /> },
      { key: "status", header: "Status", width: "95px", render: (deal) => <StatusBadge status={deal.status} /> },
    ],
    [],
  );

  async function moveDeal(dealId: string, stageId: string) {
    const source = board?.stages.flatMap((stage) => stage.deals).find((deal) => deal.id === dealId);
    if (!source || source.stageId === stageId) return;

    const targetStage = board?.stages.find((stage) => stage.id === stageId);
    let lostReason: string | undefined;
    if (targetStage?.isLost) {
      const input = window.prompt("Why was this deal lost? (e.g. Price, Competitor, No budget)");
      if (input === null) return;
      const trimmed = input.trim();
      if (!trimmed) {
        toast.error("A lost reason is required when moving a deal to a lost stage");
        return;
      }
      lostReason = trimmed;
    }

    try {
      await mutate(`/deals/${dealId}/stage`, "PATCH", { stageId, lostReason });
      await Promise.all([
        refreshBoard(),
        globalMutate((key) =>
          typeof key === "string" &&
          (key.startsWith("/deals") || key.startsWith("/pipelines") || key.startsWith("/dashboard") || key.startsWith("/reports")),
        ),
      ]);
      toast.success(`Moved to ${board?.stages.find((stage) => stage.id === stageId)?.name ?? "new stage"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to move deal");
    }
  }

  function openNew(stage?: BoardStage) {
    setPresetStageId(stage?.id);
    setDialogOpen(true);
  }

  const totals = board?.totals;
  const pipelineName = board?.pipeline.name;

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Deals"
        subtitle={
          view === "board" && totals
            ? `${totals.count} open deals · ${money(totals.value, currency, { compact: true })} pipeline · ${money(totals.weighted, currency, { compact: true })} weighted`
            : table
              ? `${table.total} deals${accountId ? " for this account" : ""}`
              : "Track every opportunity from first touch to closed won"
        }
        actions={
          <>
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: "board", label: <><LayoutGrid /> Board</> },
                { value: "table", label: <><List /> Table</> },
              ]}
            />
            <Button variant="outline" size="sm" onClick={() => download("/deals/export")}>
              <Download className="size-3.5" /> Export
            </Button>
            <Button variant="primary" size="sm" onClick={() => openNew()}>
              <Plus className="size-3.5" /> New deal
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search deals, accounts, next steps…" className="w-full sm:w-[280px]" />
        {view === "board" ? (
          <NativeSelect
            value={pipelineId}
            onChange={(event) => setPipelineId(event.target.value)}
            className="h-8 w-auto min-w-[150px] text-[12px]"
          >
            <option value="">Default pipeline</option>
            {(board?.pipelines ?? []).map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
            ))}
          </NativeSelect>
        ) : null}
        <NativeSelect value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPage(1); }} className="h-8 w-auto min-w-[140px] text-[12px]">
          <option value="">All owners</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.fullName}</option>
          ))}
        </NativeSelect>
        {accountId ? (
          <Badge tone="brand" className="gap-1.5">
            Filtered by account
            <button type="button" onClick={() => setAccountId("")} aria-label="Clear account filter" className="text-brand/70 hover:text-brand">
              <XCircle className="size-3" />
            </button>
          </Badge>
        ) : null}
        <Badge tone="outline" className="ml-auto">
          {view === "board" ? `${totals?.count ?? 0} open` : `${table?.total ?? 0} deals`}
        </Badge>
      </div>

      {view === "board" ? (
        <div className="mt-2.5">
          {pipelineName ? (
            <div className="mb-2 flex items-center gap-2 text-[11px] text-faint">
              <span className="size-1.5 rounded-full bg-brand" />
              {pipelineName}
              <span>· drag cards between stages to update</span>
            </div>
          ) : null}
          <div className="flex gap-2.5 overflow-x-auto pb-2">
            {board
              ? board.stages.map((stage) => (
                  <BoardColumn
                    key={stage.id}
                    stage={stage}
                    currency={currency}
                    loading={boardLoading}
                    dragOver={dragOverStage === stage.id}
                    onDragEnter={() => setDragOverStage(stage.id)}
                    onDragLeave={() => setDragOverStage((current) => (current === stage.id ? null : current))}
                    onDrop={(dealId) => {
                      setDragOverStage(null);
                      void moveDeal(dealId, stage.id);
                    }}
                    onOpen={(id) => router.push(`/deals/${id}`)}
                    onAdd={stage.isWon || stage.isLost ? undefined : () => openNew(stage)}
                  />
                ))
              : Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="w-[270px] shrink-0 space-y-2">
                    <Skeleton className="h-9 rounded-lg" />
                    <Skeleton className="h-24 rounded-lg" />
                    <Skeleton className="h-24 rounded-lg" />
                  </div>
                ))}
          </div>
        </div>
      ) : (
        <div className="mt-2.5">
          <DataTable
            columns={columns}
            rows={table?.items ?? []}
            loading={tableLoading}
            onRowClick={(deal) => router.push(`/deals/${deal.id}`)}
            emptyTitle="No deals found"
            emptyDescription="Adjust your filters, or create a new opportunity."
            emptyAction={<Button variant="primary" size="sm" onClick={() => openNew()}><Plus className="size-3.5" /> New deal</Button>}
            footer={table && table.total > 0 ? <Pagination page={table.page} totalPages={table.totalPages} total={table.total} pageSize={table.pageSize} onPage={setPage} /> : null}
          />
        </div>
      )}

      {!boardLoading && !tableLoading && (view === "board" ? (totals?.count ?? 0) === 0 : (table?.total ?? 0) === 0) && !search && !ownerId && !accountId ? (
        <div className="mt-6 rounded-xl border border-dashed border-border">
          <EmptyState
            icon={<Trophy />}
            title="Your pipeline is empty"
            description="Create your first deal to start forecasting revenue, tracking stages and celebrating wins."
            action={<Button variant="primary" size="sm" onClick={() => openNew()}><Plus className="size-3.5" /> Create a deal</Button>}
          />
        </div>
      ) : null}

      <DealDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        presetStageId={presetStageId}
        presetPipelineId={board?.pipeline.id}
        presetAccountId={accountId || undefined}
        onSaved={(id) => {
          void refreshBoard();
          void refreshTable();
          router.push(`/deals/${id}`);
        }}
      />
    </div>
  );
}

function BoardColumn({
  stage,
  currency,
  loading,
  dragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onOpen,
  onAdd,
}: {
  stage: BoardStage;
  currency: string;
  loading: boolean;
  dragOver: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (dealId: string) => void;
  onOpen: (id: string) => void;
  onAdd?: () => void;
}) {
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData("text/deal-id");
        if (id) onDrop(id);
      }}
      className={cn(
        "flex w-[270px] shrink-0 flex-col rounded-xl border bg-surface-2/40 transition-colors",
        dragOver ? "border-brand/50 bg-brand-soft/40" : "border-border",
      )}
    >
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
          <span className="truncate text-[11.5px] font-semibold">{stage.name}</span>
          <span className="text-[10.5px] text-faint">{stage.count}</span>
          {stage.isWon ? <Trophy className="ml-auto size-3 text-success" /> : null}
          {stage.isLost ? <XCircle className="ml-auto size-3 text-faint" /> : null}
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Add deal to ${stage.name}`}
              className="ml-auto rounded p-0.5 text-faint transition-colors hover:bg-surface-3 hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="mt-1 flex items-center justify-between text-[10.5px]">
          <span className="tabular-nums text-muted">{money(stage.value, currency, { compact: true })}</span>
          <span className="text-faint">{stage.probability}%</span>
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[92px] rounded-lg" />)
        ) : stage.deals.length ? (
          stage.deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} currency={currency} onOpen={() => onOpen(deal.id)} />
          ))
        ) : (
          <div className="flex h-20 items-center justify-center text-[11px] text-faint">Drop deals here</div>
        )}
      </div>
    </div>
  );
}

function DealCard({ deal, currency, onOpen }: { deal: DealListItem; currency: string; onOpen: () => void }) {
  const overdue = deal.expectedCloseDate ? new Date(deal.expectedCloseDate) < new Date() : false;
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/deal-id", deal.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className="group cursor-pointer rounded-lg border border-border bg-surface p-2.5 shadow-soft transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-pop active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium leading-snug text-foreground">{deal.name}</div>
          <div className="truncate text-[10.5px] text-muted">{deal.accountName ?? "No account"}</div>
          {deal.isStalled ? (
            <div className="mt-1">
              <Badge tone="danger" dot>Stalled · {deal.healthIndex}% health</Badge>
            </div>
          ) : null}
        </div>
        <Avatar name={deal.ownerName} src={deal.ownerAvatarUrl} size="xs" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold tabular-nums text-foreground">{money(deal.amount, deal.currency || currency, { compact: true })}</span>
        <span className="rounded border border-border bg-surface-2 px-1 py-px text-[9.5px] font-medium text-muted">{deal.probability}%</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
        <span className={cn("inline-flex items-center gap-1", overdue ? "text-danger" : "text-faint")}>
          <CalendarDays className="size-2.5" />
          {deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "No close date"}
        </span>
        {deal.nextStep ? <span className="truncate text-faint">{deal.nextStep}</span> : null}
      </div>
    </div>
  );
}
