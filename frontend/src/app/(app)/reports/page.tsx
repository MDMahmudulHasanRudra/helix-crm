"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BarChart3, CircleDollarSign, Clock, Download, Target, TrendingUp, Trophy, Users } from "lucide-react";
import { download, useReports } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { cn, formatDate, money, percent, pluralize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, Progress, Skeleton } from "@/components/ui/primitives";
import { AreaChart, BarChart, DonutChart, StageBars } from "@/components/shared/charts";

const SOURCE_COLORS = ["#5b5bd6", "#0b7ec4", "#0f9f6e", "#c98a0a", "#d4547a", "#7c6cf0", "#6b7280"];
const STATUS_COLORS: Record<string, string> = {
  Open: "#0b7ec4",
  Pending: "#c98a0a",
  Resolved: "#0f9f6e",
  Closed: "#a1a1aa",
};
const TYPE_COLORS = ["#5b5bd6", "#0b7ec4", "#0f9f6e", "#c98a0a", "#d4547a"];

export default function ReportsPage() {
  const { me } = useWorkspace();
  const { data, isLoading } = useReports();
  const currency = me.organization.currency;

  const trend = useMemo(
    () => (data?.months ?? []).map((month) => ({ label: month.month.split(" ")[0], value: month.wonValue, meta: `${month.wonCount} won` })),
    [data],
  );

  if (isLoading && !data) {
    return (
      <div className="animate-in-fade">
        <Skeleton className="h-8 w-52" />
        <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[84px] rounded-xl" />)}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Skeleton className="h-[280px] rounded-xl xl:col-span-2" />
          <Skeleton className="h-[280px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid place-items-center py-24">
        <EmptyState icon={<BarChart3 />} title="No report data" description="Add some deals, leads and tickets to unlock analytics." />
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Reports"
        subtitle={`${formatDate(data.range.from, "long")} – ${formatDate(data.range.to, "long")} · revenue, pipeline, team and support performance`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => download("/deals/export")}>
              <Download className="size-3.5" /> Export deals
            </Button>
            <Button variant="outline" size="sm" onClick={() => download("/quotes/export")}>
              <Download className="size-3.5" /> Export quotes
            </Button>
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Won revenue", value: money(kpis.wonValue, currency, { compact: true }), detail: `${kpis.wonCount} closed-won deals`, icon: <Trophy className="size-3.5" />, tone: "text-success" },
          { label: "Win rate", value: percent(kpis.winRate), detail: `${kpis.lostCount} lost · ${kpis.wonCount} won`, icon: <Target className="size-3.5" />, tone: "text-brand" },
          { label: "Open pipeline", value: money(kpis.openPipeline, currency, { compact: true }), detail: `${money(kpis.weightedPipeline, currency, { compact: true })} weighted`, icon: <CircleDollarSign className="size-3.5" />, tone: "text-info" },
          { label: "Avg. deal size", value: money(kpis.avgDealSize, currency, { compact: true }), detail: `${kpis.newLeads} new leads in range`, icon: <TrendingUp className="size-3.5" />, tone: "text-foreground" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3.5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="truncate text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
              <span className="text-faint">{item.icon}</span>
            </div>
            <div className={cn("mt-1.5 truncate text-[22px] font-semibold leading-none tracking-tight", item.tone)}>{item.value}</div>
            <div className="mt-1.5 truncate text-[11px] text-muted">{item.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Lead conversion", value: percent(kpis.conversionRate), detail: "Lead → qualified", icon: <ArrowUpRight className="size-3.5" /> },
          { label: "Lost value", value: money(kpis.lostValue, currency, { compact: true }), detail: `${kpis.lostCount} deals lost`, icon: <ArrowDownRight className="size-3.5" /> },
          { label: "Avg. resolution", value: `${kpis.avgTicketResolutionHours.toFixed(1)}h`, detail: `${kpis.ticketsResolved} tickets resolved`, icon: <Clock className="size-3.5" /> },
          { label: "New leads", value: kpis.newLeads, detail: "Created in range", icon: <Users className="size-3.5" /> },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-soft">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">{item.icon}</span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-foreground">{item.value}</div>
              <div className="truncate text-[10.5px] text-muted">{item.label} · {item.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue trend" subtitle="Closed-won value by month" icon={<TrendingUp className="size-3.5" />} action={<Badge tone="success">Won</Badge>} />
          <div className="px-3 pb-3">
            <AreaChart data={trend} currency={currency} height={220} />
          </div>
          <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
            {[
              { label: "Total won", value: money(kpis.wonValue, currency, { compact: true }) },
              { label: "Deals won", value: kpis.wonCount },
              { label: "Avg. cycle", value: trend.length ? `${Math.max(1, Math.round(30 / Math.max(1, kpis.conversionRate || 1) * 100))}d` : "—" },
            ].map((item) => (
              <div key={item.label} className="px-4 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint">{item.label}</div>
                <div className="mt-1 text-[13px] font-semibold tabular-nums text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pipeline by stage" subtitle="Open value across the board" icon={<CircleDollarSign className="size-3.5" />} />
          <div className="px-4 pb-4">
            {data.pipelineByStage.length ? <StageBars data={data.pipelineByStage} currency={currency} /> : <div className="text-[11.5px] text-faint">No open pipeline.</div>}
          </div>
          <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted">
            {pluralize(data.pipelineByStage.reduce((acc, stage) => acc + stage.count, 0), "open deal")}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Team performance" subtitle="Pipeline, wins and conversion by owner" icon={<Users className="size-3.5" />} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-y border-border bg-surface-2/40">
                  <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Owner</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Open</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Won</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Win rate</th>
                  <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Progress</th>
                </tr>
              </thead>
              <tbody>
                {data.dealsByOwner.length ? data.dealsByOwner.map((owner) => (
                  <tr key={owner.ownerId} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar name={owner.name} src={owner.avatarUrl} size="sm" />
                        <span className="truncate text-[12.5px] font-medium">{owner.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{money(owner.openValue, currency, { compact: true })}<span className="ml-1 text-[10px] text-faint">({owner.openCount})</span></td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-success">{money(owner.wonValue, currency, { compact: true })}<span className="ml-1 text-[10px] text-faint">({owner.wonCount})</span></td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-medium tabular-nums">{percent(owner.winRate)}</td>
                    <td className="px-4 py-2.5"><Progress value={owner.winRate} color="#0f9f6e" /></td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-[12px] text-muted">No owner performance in range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Top accounts" subtitle="By open + won value" icon={<CircleDollarSign className="size-3.5" />} />
          {data.topAccounts.length ? (
            <div className="divide-y divide-border">
              {data.topAccounts.map((account, index) => (
                <Link key={account.accountId} href={`/accounts/${account.accountId}`} className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-2/50">
                  <span className="w-4 text-[10.5px] font-semibold tabular-nums text-faint">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-foreground">{account.name}</div>
                    <div className="truncate text-[10.5px] text-muted">{account.industry ?? "—"} · {pluralize(account.dealCount, "deal")}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] font-semibold tabular-nums">{money(account.openValue + account.wonValue, currency, { compact: true })}</div>
                    <div className="text-[10px] text-success">{money(account.wonValue, currency, { compact: true })} won</div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-[12px] text-muted">No account activity yet.</div>
          )}
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Lead funnel" subtitle="Where leads are today" icon={<Target className="size-3.5" />} />
          <div className="space-y-2.5 px-4 pb-4">
            {data.leadFunnel.map((stage) => {
              const max = Math.max(1, ...data.leadFunnel.map((item) => item.count));
              return (
                <div key={stage.status}>
                  <div className="mb-1 flex items-center justify-between text-[11.5px]">
                    <span className="text-foreground">{stage.status}</span>
                    <span className="tabular-nums text-muted">{stage.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(stage.count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Leads by source" subtitle="Volume and estimated value" icon={<Users className="size-3.5" />} />
          <div className="px-4 pb-4">
            <BarChart
              data={data.leadsBySource.map((source) => ({ label: source.source.split(" ")[0], value: source.value, secondary: source.count, color: SOURCE_COLORS[data.leadsBySource.indexOf(source) % SOURCE_COLORS.length] }))}
              currency={currency}
              height={150}
            />
            <div className="mt-3 space-y-1.5">
              {data.leadsBySource.slice(0, 4).map((source, index) => (
                <div key={source.source} className="flex items-center gap-2 text-[11px]">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[index % SOURCE_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate text-muted">{source.source}</span>
                  <span className="tabular-nums text-foreground">{source.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Support mix" subtitle="Tickets by status" icon={<BarChart3 className="size-3.5" />} />
          <div className="px-4 pb-4">
            <DonutChart
              data={data.ticketsByStatus.map((status) => ({ label: status.status, value: status.count, color: STATUS_COLORS[status.status] ?? "#a1a1aa" }))}
              size={120}
              thickness={13}
            />
            <div className="mt-4 space-y-1.5 border-t border-border pt-3">
              {data.ticketsByChannel.map((channel) => (
                <div key={channel.channel} className="flex items-center justify-between text-[11.5px]">
                  <span className="text-muted">{channel.channel}</span>
                  <span className="tabular-nums font-medium text-foreground">{channel.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader title="Pipeline movement" subtitle="Deals created vs won by month" icon={<TrendingUp className="size-3.5" />} />
          <div className="px-4 pb-4">
            <BarChart
              data={data.months.map((month) => ({ label: month.month.split(" ")[0], value: month.wonValue, secondary: month.pipelineCreated }))}
              currency={currency}
              height={170}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Activity mix" subtitle="Logged interactions by type" icon={<Target className="size-3.5" />} />
          <div className="px-4 pb-4">
            <DonutChart
              data={data.activityByType.map((type, index) => ({ label: type.type, value: type.count, color: TYPE_COLORS[index % TYPE_COLORS.length] }))}
              size={120}
              thickness={13}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
