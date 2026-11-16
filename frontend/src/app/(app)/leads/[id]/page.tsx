"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Globe,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useLead } from "@/lib/api";
import { formatDate, formatDateTime, money, percent } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Progress, Skeleton } from "@/components/ui/primitives";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/overlays";
import { DetailField } from "@/components/ui/layout";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { AuditTrail, CustomFieldsCard } from "@/components/shared/record-sections";
import { ScoreBadge, StatusBadge } from "@/components/shared/badges";
import { LeadDialog } from "@/components/leads/lead-dialog";
import { ConvertLeadDialog } from "@/components/leads/convert-lead-dialog";
import { ActivityDialog } from "@/components/shared/activity-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useWorkspace } from "@/components/shell/workspace-provider";
import type { LeadScoreFactor } from "@/lib/types";

const ROUTING_LABELS: Record<string, string> = {
  Unrouted: "Unrouted",
  Assigned: "Assigned",
  AutoRouted: "Auto-routed",
  SdrQueue: "SDR queue",
};

function readScoreFactors(json: string): LeadScoreFactor[] {
  try {
    const parsed = JSON.parse(json) as { factors?: LeadScoreFactor[] };
    return Array.isArray(parsed?.factors) ? parsed.factors : [];
  } catch {
    return [];
  }
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useWorkspace();
  const { data: lead, isLoading, mutate: refresh } = useLead(params.id);
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("convert") === "1" && lead && lead.status !== "Converted") {
      setConvertOpen(true);
    }
  }, [lead]);

  if (isLoading && !lead) return <DetailSkeleton />;

  if (!lead) {
    return (
      <div className="grid place-items-center py-24">
        <EmptyState
          icon={<Sparkles />}
          title="Lead not found"
          description="It may have been deleted, or you may not have access."
          action={<Button variant="primary" size="sm" asChild><Link href="/leads">Back to leads</Link></Button>}
        />
      </div>
    );
  }

  const isConverted = lead.status === "Converted";
  const currency = me.organization.currency;
  const scoreFactors = readScoreFactors(lead.scoreBreakdownJson);

  async function remove() {
    setDeleting(true);
    try {
      await mutate(`/leads/${lead!.id}`, "DELETE");
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/leads") || key.startsWith("/dashboard")));
      toast.success("Lead deleted");
      router.push("/leads");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete lead");
      setDeleting(false);
    }
  }

  return (
    <div className="animate-in-fade">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted">
        <Link href="/leads" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> Leads
        </Link>
        <ChevronRight className="size-3 text-faint" />
        <span className="truncate text-foreground">{lead.fullName}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground">{lead.fullName}</h1>
              <StatusBadge status={lead.status} />
              <ScoreBadge score={lead.score} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              {lead.company ? <span className="inline-flex items-center gap-1"><Building2 className="size-3" /> {lead.company}</span> : null}
              {lead.title ? <span className="inline-flex items-center gap-1"><Briefcase className="size-3" /> {lead.title}</span> : null}
              {lead.email ? <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-foreground"><Mail className="size-3" /> {lead.email}</a> : null}
              {lead.phone ? <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="size-3" /> {lead.phone}</a> : null}
              <span className="inline-flex items-center gap-1"><Target className="size-3" /> {lead.source}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isConverted ? (
            <Button variant="primary" size="sm" onClick={() => setConvertOpen(true)}>
              <UserCheck className="size-3.5" /> Convert lead
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setActivityOpen(true)}>
            <Plus className="size-3.5" /> Log activity
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Dropdown>
            <DropdownTrigger asChild>
              <IconButton variant="outline" aria-label="More actions"><MoreHorizontal className="size-4" /></IconButton>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<Mail />} onSelect={() => window.open(`mailto:${lead.email ?? ""}`)}>Send email</DropdownItem>
              <DropdownItem icon={<CalendarDays />} onSelect={() => setActivityOpen(true)}>Schedule follow-up</DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleteOpen(true)}>Delete lead</DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      {isConverted ? (
        <div className="mt-4 rounded-xl border border-success/25 bg-success-soft px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-medium text-success">
            <UserCheck className="size-4" /> Converted {lead.convertedAt ? formatDate(lead.convertedAt, "long") : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {lead.convertedAccountId ? (
              <Link href={`/accounts/${lead.convertedAccountId}`} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-success/20 bg-surface px-2.5 text-[11.5px] font-medium text-foreground hover:border-success/40">
                <Building2 className="size-3.5 text-success" /> {lead.convertedAccountName}
              </Link>
            ) : null}
            {lead.convertedContactId ? (
              <Link href={`/contacts/${lead.convertedContactId}`} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-success/20 bg-surface px-2.5 text-[11.5px] font-medium text-foreground hover:border-success/40">
                <Users className="size-3.5 text-success" /> {lead.convertedContactName}
              </Link>
            ) : null}
            {lead.convertedDealId ? (
              <Link href={`/deals/${lead.convertedDealId}`} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-success/20 bg-surface px-2.5 text-[11.5px] font-medium text-foreground hover:border-success/40">
                <CircleDollarSign className="size-3.5 text-success" /> {lead.convertedDealName}
                <ArrowRight className="size-3" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Estimated value", value: money(lead.estimatedValue, currency, { compact: true }), detail: "Potential revenue" },
          { label: "Lead score", value: lead.score, detail: lead.score >= 75 ? "Hot" : lead.score >= 50 ? "Warm" : "Needs nurture" },
          { label: "Source", value: lead.source, detail: "Acquisition channel" },
          { label: "Activities", value: lead.activities.length, detail: `${lead.activities.filter((item) => item.status === "Open").length} open` },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3 shadow-soft">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
            <div className="mt-1.5 truncate text-[19px] font-semibold leading-none tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1.5 truncate text-[11px] text-muted">{item.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <Tabs defaultValue="overview">
            <div className="border-b border-border px-3 py-2.5">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="activity" count={lead.activities.length}>Activity</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="p-4">
              {lead.notes ? (
                <div className="mb-5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Notes</h3>
                  <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{lead.notes}</p>
                </div>
              ) : null}
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Lead details</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
                <DetailField label="Company">{lead.company}</DetailField>
                <DetailField label="Job title">{lead.title}</DetailField>
                <DetailField label="Email">{lead.email}</DetailField>
                <DetailField label="Phone">{lead.phone}</DetailField>
                <DetailField label="Website">
                  {lead.website ? (
                    <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                      {lead.website} <Globe className="size-2.5" />
                    </a>
                  ) : null}
                </DetailField>
                <DetailField label="Source">{lead.source}</DetailField>
                <DetailField label="Score">{percent(lead.score)}</DetailField>
                <DetailField label="Routing">{ROUTING_LABELS[lead.routingState] ?? lead.routingState}</DetailField>
                <DetailField label="Estimated value">{lead.estimatedValue ? money(lead.estimatedValue, currency) : null}</DetailField>
                <DetailField label="Owner">{lead.ownerName}</DetailField>
                <DetailField label="Created">{formatDate(lead.createdAt, "long")}</DetailField>
                <DetailField label="Last updated">{formatDateTime(lead.updatedAt)}</DetailField>
              </dl>
              <div className="mt-6 border-t border-border pt-4">
                <AuditTrail entries={lead.audit} />
              </div>
            </TabsContent>

            <TabsContent value="activity">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[11.5px] text-muted">{lead.activities.length} activities</span>
                <Button size="xs" variant="secondary" onClick={() => setActivityOpen(true)}><Plus className="size-3" /> Log activity</Button>
              </div>
              <div className="border-t border-border">
                <ActivityFeed items={lead.activities} showRelated={false} showComplete />
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Qualification" />
            <div className="px-4 pb-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[28px] font-semibold leading-none tracking-tight text-foreground">{lead.score}</div>
                  <div className="mt-1 text-[10.5px] uppercase tracking-[0.05em] text-faint">Lead score</div>
                </div>
                <Badge tone={lead.score >= 75 ? "success" : lead.score >= 50 ? "info" : "warning"} dot>
                  {lead.score >= 75 ? "Hot" : lead.score >= 50 ? "Warm" : "Nurture"}
                </Badge>
              </div>
              <Progress value={lead.score} className="mt-3" color={lead.score >= 75 ? "var(--success)" : lead.score >= 50 ? "var(--info)" : "var(--warning)"} />
              {scoreFactors.length ? (
                <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Why this score</div>
                  {scoreFactors.map((factor) => (
                    <div key={factor.key} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-muted">{factor.label}</span>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">+{factor.points}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
                <DetailField label="Estimated value">{lead.estimatedValue ? money(lead.estimatedValue, currency) : null}</DetailField>
                <DetailField label="Source">{lead.source}</DetailField>
                <DetailField label="Owner">{lead.ownerName}</DetailField>
                <DetailField label="Status">{lead.status}</DetailField>
              </div>
              {!isConverted ? (
                <Button variant="primary" size="sm" className="mt-3 w-full" onClick={() => setConvertOpen(true)}>
                  <UserCheck className="size-3.5" /> Convert to account & deal
                </Button>
              ) : null}
            </div>
          </Card>

          <CustomFieldsCard fields={lead.customFields} />

          <Card>
            <CardHeader title="Quick actions" />
            <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
              {[
                { label: "Send email", icon: <Mail className="size-3.5" />, onClick: () => window.open(`mailto:${lead.email ?? ""}`) },
                { label: "Log activity", icon: <CalendarDays className="size-3.5" />, onClick: () => setActivityOpen(true) },
                { label: "Convert", icon: <UserCheck className="size-3.5" />, onClick: () => !isConverted && setConvertOpen(true) },
                { label: "All leads", icon: <Users className="size-3.5" />, onClick: () => router.push("/leads") },
              ].map((action) => (
                <button key={action.label} type="button" onClick={action.onClick} className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-surface p-2.5 text-left text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground">
                  <span className="text-faint">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <LeadDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} onSaved={() => void refresh()} />
      {!isConverted ? (
        <ConvertLeadDialog open={convertOpen} onOpenChange={setConvertOpen} lead={lead} onSaved={() => void refresh()} />
      ) : null}
      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        relatedType="Lead"
        relatedId={lead.id}
        relatedName={lead.fullName}
        onSaved={() => void refresh()}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${lead.fullName}?`}
        description="The lead and its activity history will be archived."
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
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[84px] rounded-xl" />)}
      </div>
      <Skeleton className="mt-3 h-[420px] rounded-xl" />
    </div>
  );
}
