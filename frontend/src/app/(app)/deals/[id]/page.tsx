"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity as ActivityIcon,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useDeal, usePipelines } from "@/lib/api";
import { formatDate, formatDateTime, money, pluralize } from "@/lib/utils";
import { DetailField, PageHeader } from "@/components/ui/layout";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Progress, Skeleton } from "@/components/ui/primitives";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { AuditTrail, CustomFieldsCard } from "@/components/shared/record-sections";
import { EntityMark, OwnerCell, StatusBadge } from "@/components/shared/badges";
import { DealDialog } from "@/components/deals/deal-dialog";
import { ActivityDialog } from "@/components/shared/activity-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { cn } from "@/lib/utils";

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useWorkspace();
  const { data: deal, isLoading, mutate: refresh } = useDeal(params.id);
  const { data: pipelines } = usePipelines();
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [movingStageId, setMovingStageId] = useState<string | null>(null);

  if (isLoading && !deal) return <DetailSkeleton />;

  if (!deal) {
    return (
      <div className="grid place-items-center py-24">
        <EmptyState
          icon={<CircleDollarSign />}
          title="Deal not found"
          description="It may have been deleted, or you may not have access."
          action={<Button variant="primary" size="sm" asChild><Link href="/deals">Back to deals</Link></Button>}
        />
      </div>
    );
  }

  const currency = deal.currency || me.organization.currency;
  const pipeline = pipelines?.find((item) => item.id === deal.pipelineId);
  const stages = [...(pipeline?.stages ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIndex = stages.findIndex((stage) => stage.id === deal.stageId);
  const weighted = deal.amount * (deal.probability / 100);

  async function remove() {
    setDeleting(true);
    try {
      await mutate(`/deals/${deal!.id}`, "DELETE");
      await globalMutate((key) =>
        typeof key === "string" && (key.startsWith("/deals") || key.startsWith("/dashboard") || key.startsWith("/pipelines") || key.startsWith("/reports")),
      );
      toast.success("Deal deleted");
      router.push("/deals");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete deal");
      setDeleting(false);
    }
  }

  async function moveToStage(stageId: string, stageName: string) {
    if (!deal || stageId === deal.stageId) return;

    const targetStage = stages.find((stage) => stage.id === stageId);
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

    setMovingStageId(stageId);
    try {
      await mutate(`/deals/${deal.id}/stage`, "PATCH", { stageId, lostReason });
      await refresh();
      await globalMutate((key) =>
        typeof key === "string" && (key.startsWith("/deals") || key.startsWith("/dashboard") || key.startsWith("/pipelines") || key.startsWith("/reports")),
      );
      toast.success(`Moved to ${stageName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to move deal");
    } finally {
      setMovingStageId(null);
    }
  }

  return (
    <div className="animate-in-fade">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted">
        <Link href="/deals" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> Deals
        </Link>
        <ChevronRight className="size-3 text-faint" />
        <span className="truncate text-foreground">{deal.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <EntityMark name={deal.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground">{deal.name}</h1>
              <StatusBadge status={deal.status} />
              {deal.isStalled ? <Badge tone="danger" dot>Stalled</Badge> : null}
              <span
                className="inline-flex h-[21px] items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium"
                style={{ backgroundColor: `${deal.stageColor}14`, borderColor: `${deal.stageColor}30`, color: deal.stageColor }}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: deal.stageColor }} />
                {deal.stageName}
              </span>
              {deal.tags.slice(0, 2).map((tag) => <Badge key={tag} tone="outline">{tag}</Badge>)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span className="text-[15px] font-semibold tabular-nums text-foreground">{money(deal.amount, currency)}</span>
              {deal.accountId ? (
                <Link href={`/accounts/${deal.accountId}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <CircleDollarSign className="size-3" /> {deal.accountName}
                </Link>
              ) : null}
              {deal.primaryContactId ? (
                <Link href={`/contacts/${deal.primaryContactId}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <User className="size-3" /> {deal.primaryContactName}
                </Link>
              ) : null}
              <OwnerCell name={deal.ownerName} avatarUrl={deal.ownerAvatarUrl} size="xs" />
              <span className="text-faint">{deal.pipelineName}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setActivityOpen(true)}>
            <Plus className="size-3.5" /> Log activity
          </Button>
          <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Dropdown>
            <DropdownTrigger asChild>
              <IconButton variant="outline" aria-label="More actions"><MoreHorizontal className="size-4" /></IconButton>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<FileText />} onSelect={() => router.push(`/quotes?new=1&dealId=${deal.id}`)}>
                New quote
              </DropdownItem>
              <DropdownItem icon={<ActivityIcon />} onSelect={() => setActivityOpen(true)}>
                Log activity
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleteOpen(true)}>
                Delete deal
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Deal value", value: money(deal.amount, currency, { compact: true }), detail: `${deal.probability}% probability`, icon: <CircleDollarSign className="size-3.5" /> },
          { label: "Weighted value", value: money(weighted, currency, { compact: true }), detail: "Forecast contribution", icon: <TrendingUp className="size-3.5" /> },
          { label: "Expected close", value: deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "—", detail: deal.status === "Open" ? "Still open" : `Closed ${formatDate(deal.closedAt)}`, icon: <CalendarDays className="size-3.5" /> },
          { label: "Next step", value: deal.nextStep ?? "—", detail: pluralize(deal.activities.length, "activity", "activities"), icon: <Target className="size-3.5" /> },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
              <span className="text-faint">{item.icon}</span>
            </div>
            <div className="mt-1.5 truncate text-[17px] font-semibold leading-none tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1.5 truncate text-[11px] text-muted">{item.detail}</div>
          </div>
        ))}
      </div>

      {stages.length ? (
        <div className="mt-3 rounded-xl border border-border bg-surface p-3 shadow-soft">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Pipeline stage</span>
            <span className="text-[11px] text-muted">{deal.pipelineName}</span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {stages.map((stage, index) => {
              const active = stage.id === deal.stageId;
              const complete = currentIndex >= 0 && index < currentIndex;
              return (
                <div key={stage.id} className="flex min-w-0 flex-1 items-center gap-1">
                  <button
                    type="button"
                    disabled={movingStageId !== null}
                    onClick={() => void moveToStage(stage.id, stage.name)}
                    className={cn(
                      "group flex min-w-0 flex-1 flex-col gap-1 rounded-lg border px-2 py-1.5 text-left transition-all disabled:opacity-60",
                      active ? "border-brand/40 bg-brand-soft" : "border-border bg-surface hover:border-border-strong",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn("flex size-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold", active ? "border-brand bg-brand text-white" : complete ? "border-success bg-success text-white" : "border-border-strong text-faint")}
                      >
                        {index + 1}
                      </span>
                      <span className={cn("truncate text-[11px] font-medium", active ? "text-brand" : complete ? "text-foreground" : "text-muted")}>{stage.name}</span>
                    </span>
                    <span className="flex items-center justify-between pl-5 text-[10px] text-faint">
                      <span className="tabular-nums">{money(stage.dealValue, currency, { compact: true })}</span>
                      <span>{stage.probability}%</span>
                    </span>
                  </button>
                  {index < stages.length - 1 ? <span className="h-px w-2 shrink-0 bg-border" /> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <Tabs defaultValue="overview">
            <div className="border-b border-border px-3 py-2.5">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="activity" count={deal.activities.length}>Activity</TabsTrigger>
                <TabsTrigger value="quotes" count={deal.quotes.length}>Quotes</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="p-4">
              <div className="grid gap-5">
                {deal.description ? (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">About</h3>
                    <p className="mt-1.5 max-w-3xl whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{deal.description}</p>
                  </div>
                ) : null}
                <div>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Deal details</h3>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
                    <DetailField label="Amount">{money(deal.amount, currency)}</DetailField>
                    <DetailField label="Probability">{deal.probability}%</DetailField>
                    <DetailField label="Weighted">{money(weighted, currency)}</DetailField>
                    <DetailField label="Stage">{deal.stageName}</DetailField>
                    <DetailField label="Status">{deal.status}</DetailField>
                    <DetailField label="Health">
                      <span className={cn(deal.isStalled ? "font-medium text-danger" : deal.healthIndex < 70 ? "text-warning" : "text-foreground")}>
                        {deal.healthIndex}%{deal.isStalled ? " · stalled" : ""}
                      </span>
                    </DetailField>
                    <DetailField label="Lost reason">{deal.lostReason}</DetailField>
                    <DetailField label="Source">{deal.source}</DetailField>
                    <DetailField label="Expected close">{formatDate(deal.expectedCloseDate, "long")}</DetailField>
                    <DetailField label="Closed">{deal.closedAt ? formatDate(deal.closedAt, "long") : null}</DetailField>
                    <DetailField label="Owner">{deal.ownerName}</DetailField>
                    <DetailField label="Primary contact">{deal.primaryContactName}</DetailField>
                    <DetailField label="Contact email">{deal.primaryContactEmail}</DetailField>
                    <DetailField label="Account">{deal.accountName}</DetailField>
                    <DetailField label="Created">{formatDate(deal.createdAt, "long")}</DetailField>
                    <DetailField label="Last updated">{formatDateTime(deal.updatedAt)}</DetailField>
                    <DetailField label="Next step">{deal.nextStep}</DetailField>
                  </dl>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-muted">Win probability</span>
                    <span className="font-medium tabular-nums text-foreground">{deal.probability}%</span>
                  </div>
                  <Progress value={deal.probability} color={deal.stageColor} />
                </div>
              </div>
              <div className="mt-6 border-t border-border pt-4">
                <AuditTrail entries={deal.audit} />
              </div>
            </TabsContent>

            <TabsContent value="activity">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[11.5px] text-muted">{pluralize(deal.activities.length, "activity", "activities")}</span>
                <Button size="xs" variant="secondary" onClick={() => setActivityOpen(true)}>
                  <Plus className="size-3" /> Log activity
                </Button>
              </div>
              <div className="border-t border-border">
                <ActivityFeed items={deal.activities} showRelated={false} showComplete />
              </div>
            </TabsContent>

            <TabsContent value="quotes">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[11.5px] text-muted">{pluralize(deal.quotes.length, "quote")}</span>
                <Button size="xs" variant="secondary" onClick={() => router.push(`/quotes?new=1&dealId=${deal.id}`)}>
                  <Plus className="size-3" /> New quote
                </Button>
              </div>
              {deal.quotes.length ? (
                <div className="divide-y divide-border border-t border-border">
                  {deal.quotes.map((quote) => (
                    <Link key={quote.id} href={`/quotes/${quote.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/50">
                      <span className="font-mono text-[10.5px] text-faint">{quote.number}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{formatDate(quote.issueDate)}</span>
                      <span className="text-[12px] font-medium tabular-nums">{money(quote.total, quote.currency)}</span>
                      <StatusBadge status={quote.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No quotes yet"
                  description="Create a quote to formalize pricing for this opportunity."
                  compact
                  action={<Button size="xs" variant="primary" onClick={() => router.push(`/quotes?new=1&dealId=${deal.id}`)}><Plus className="size-3" /> Create quote</Button>}
                />
              )}
            </TabsContent>
          </Tabs>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Move stage" subtitle="Update the opportunity in one click" />
            <div className="space-y-1 px-3 pb-3">
              {stages.length ? stages.map((stage) => {
                const active = stage.id === deal.stageId;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    disabled={movingStageId !== null}
                    onClick={() => void moveToStage(stage.id, stage.name)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-colors disabled:opacity-60",
                      active ? "border-brand/30 bg-brand-soft font-medium text-brand" : "border-transparent text-muted hover:border-border hover:bg-surface-2/50 hover:text-foreground",
                    )}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="flex-1 truncate">{stage.name}</span>
                    <span className="text-[10.5px] tabular-nums text-faint">{stage.probability}%</span>
                  </button>
                );
              }) : <div className="text-[11.5px] text-faint">No stages in this pipeline.</div>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Relationship" />
            <div className="space-y-3.5 px-4 pb-4">
              <div className="flex items-center gap-2.5">
                <EntityMark name={deal.ownerName ?? "Unassigned"} size="md" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Deal owner</div>
                  <div className="truncate text-[12.5px] font-medium text-foreground">{deal.ownerName ?? "Unassigned"}</div>
                </div>
              </div>
              {deal.accountName ? (
                <div className="border-t border-border pt-3">
                  <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Account</div>
                  {deal.accountId ? (
                    <Link href={`/accounts/${deal.accountId}`} className="mt-1 flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                      {deal.accountName} <ChevronRight className="size-3" />
                    </Link>
                  ) : (
                    <div className="mt-1 text-[12.5px]">{deal.accountName}</div>
                  )}
                </div>
              ) : null}
              {deal.primaryContactName ? (
                <div className="border-t border-border pt-3">
                  <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Primary contact</div>
                  {deal.primaryContactId ? (
                    <Link href={`/contacts/${deal.primaryContactId}`} className="mt-1 flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                      {deal.primaryContactName} <ChevronRight className="size-3" />
                    </Link>
                  ) : (
                    <div className="mt-1 text-[12.5px]">{deal.primaryContactName}</div>
                  )}
                  {deal.primaryContactEmail ? <div className="text-[11px] text-muted">{deal.primaryContactEmail}</div> : null}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <DetailField label="Status">{deal.status}</DetailField>
                <DetailField label="Created">{formatDate(deal.createdAt)}</DetailField>
                <DetailField label="Updated">{formatDate(deal.updatedAt)}</DetailField>
                <DetailField label="Source">{deal.source}</DetailField>
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Tags</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {deal.tags.length ? deal.tags.map((tag) => <Badge key={tag} tone="outline">{tag}</Badge>) : <span className="text-[11.5px] text-faint">None</span>}
                </div>
              </div>
            </div>
          </Card>

          <CustomFieldsCard fields={deal.customFields} />

          <Card>
            <CardHeader title="Quick actions" />
            <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
              {[
                { label: "Log activity", icon: <ActivityIcon className="size-3.5" />, onClick: () => setActivityOpen(true) },
                { label: "New quote", icon: <FileText className="size-3.5" />, onClick: () => router.push(`/quotes?new=1&dealId=${deal.id}`) },
                { label: "View account", icon: <CircleDollarSign className="size-3.5" />, onClick: () => deal.accountId && router.push(`/accounts/${deal.accountId}`) },
                { label: "All deals", icon: <Target className="size-3.5" />, onClick: () => router.push("/deals") },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-surface p-2.5 text-left text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <span className="text-faint">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <DealDialog open={editOpen} onOpenChange={setEditOpen} deal={deal} onSaved={() => void refresh()} />
      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        relatedType="Deal"
        relatedId={deal.id}
        relatedName={deal.name}
        onSaved={() => void refresh()}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${deal.name}?`}
        description="The deal will be archived and removed from pipeline reporting."
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
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[84px] rounded-xl" />)}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>
    </div>
  );
}
