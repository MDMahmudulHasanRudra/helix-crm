"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Clock,
  LifeBuoy,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useAutonomousInsights, useDashboard, useMe } from "@/lib/api";
import { cn, formatDate, money, percent, pluralize, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Progress,
  Skeleton,
  Stat,
  StatusDot,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActivityFeed, ActivityIcon } from "@/components/shared/activity-feed";
import { DonutChart, AreaChart, StageBars } from "@/components/shared/charts";
import { EntityMark, StatusBadge } from "@/components/shared/badges";

const statusColors: Record<string, string> = {
  Open: "#0b7ec4",
  Pending: "#c27a06",
  Resolved: "#0f9f6e",
  Closed: "#a1a1aa",
};

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const { data: me } = useMe();
  const { data: insights } = useAutonomousInsights();

  const firstName = me?.user.firstName ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (isLoading || !data) return <DashboardSkeleton />;

  const kpis = data.kpis;
  const revenueTotal = data.revenueTrend.reduce((acc, item) => acc + item.value, 0);
  const currency = me?.organization.currency ?? "USD";
  const tickets = data.tickets;

  return (
    <div className="animate-in-fade">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={`${formatDate(data.generatedAt, "long")} · Here’s how ${me?.organization.name ?? "your workspace"} is performing.`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/reports">
                <TrendingUp className="size-3.5" /> View reports
              </Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href="/deals">
                <CircleDollarSign className="size-3.5" /> New deal
              </Link>
            </Button>
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <Stat
          label="Open pipeline"
          value={money(kpis.openPipelineValue, currency, { compact: true })}
          detail={`${pluralize(kpis.openDeals, "open deal")} · ${money(kpis.weightedPipelineValue, currency, { compact: true })} weighted`}
          icon={<Wallet className="size-4" />}
          tone="brand"
        />
        <Stat
          label="Won this month"
          value={money(kpis.wonThisMonth, currency, { compact: true })}
          detail={`${percent(kpis.winRate)} win rate · ${money(kpis.avgDealSize, currency, { compact: true })} avg deal`}
          icon={<Target className="size-4" />}
          tone="success"
        />
        <Stat
          label="New leads · 30d"
          value={kpis.newLeads30}
          detail={`${kpis.openLeads} open · ${percent(kpis.conversionRate, 1)} conversion`}
          icon={<Sparkles className="size-4" />}
        />
        <Stat
          label="Open tickets"
          value={kpis.openTickets}
          detail={`${tickets.urgent} urgent · ${tickets.resolved} resolved`}
          icon={<LifeBuoy className="size-4" />}
          tone={tickets.urgent > 0 ? "warning" : "default"}
        />
      </div>

      {insights ? (
        <Card className="mt-2.5">
          <CardHeader
            title="Autonomous insights"
            subtitle={
              insights.items.length
                ? `${pluralize(insights.items.length, "item")} need attention · updated ${relativeTime(insights.generatedAt)}`
                : `All quiet · updated ${relativeTime(insights.generatedAt)}`
            }
            icon={<Sparkles className="size-3.5" />}
            action={
              <Badge tone={insights.enabled ? "success" : "neutral"} dot>
                {insights.enabled ? "Self-driving" : "Paused"}
              </Badge>
            }
          />
          <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-5">
            {[
              { label: "Stalled deals", value: insights.stalledDeals, href: "/deals" },
              { label: "SLA breaches", value: insights.slaBreaches, href: "/tickets" },
              { label: "Stale contacts", value: insights.staleContacts, href: "/contacts" },
              { label: "Duplicates", value: insights.duplicateCandidates, href: "/settings?tab=autonomous" },
              { label: "Leads to route", value: insights.highScoreLeads, href: "/leads" },
            ].map((item) => (
              <Link key={item.label} href={item.href} className="bg-surface px-3 py-2 transition-colors hover:bg-surface-2/60">
                <div className="text-[15px] font-semibold tabular-nums text-foreground">{item.value}</div>
                <div className="text-[10px] text-faint">{item.label}</div>
              </Link>
            ))}
          </div>
          <div className="divide-y divide-border border-t border-border">
            {insights.items.length ? (
              insights.items.slice(0, 6).map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={item.url}
                  className="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-surface-2/50"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      item.severity === "danger" ? "bg-danger" : item.severity === "warning" ? "bg-warning" : "bg-info",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-foreground">{item.title}</div>
                    <div className="truncate text-[10.5px] text-muted">{item.subtitle}</div>
                  </div>
                  <ArrowUpRight className="size-3 shrink-0 text-faint" />
                </Link>
              ))
            ) : (
              <div className="px-4 py-5 text-center text-[11.5px] text-muted">
                Everything looks healthy. The workers will surface issues here as they appear.
              </div>
            )}
          </div>
        </Card>
      ) : null}

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader
            title="Revenue trend"
            subtitle={`Closed-won revenue across the last 6 months · ${money(revenueTotal, currency)}`}
            action={
              <div className="flex items-center gap-2">
                <Badge tone="success" dot>
                  {money(data.revenueTrend[data.revenueTrend.length - 1]?.value ?? 0, currency, { compact: true })} in {data.revenueTrend[data.revenueTrend.length - 1]?.month}
                </Badge>
              </div>
            }
          />
          <div className="px-3 pb-2">
            <AreaChart
              data={data.revenueTrend.map((item) => ({ label: item.month, value: item.value }))}
              currency={currency}
              height={176}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-[11px] text-muted">
            <span className="font-medium text-foreground">{pluralize(kpis.activeAccounts, "active account")}</span>
            <span>·</span>
            <span>{pluralize(kpis.contacts, "contact")}</span>
            <span>·</span>
            <span>{pluralize(data.myTasks.length, "task")} on your list</span>
            <Link href="/reports" className="ml-auto inline-flex items-center gap-1 font-medium text-brand hover:underline">
              Full report <ArrowRight className="size-3" />
            </Link>
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader
            title="Pipeline by stage"
            subtitle={data.pipelineName ?? "Sales pipeline"}
            action={
              <Badge tone="brand">{money(kpis.openPipelineValue, currency, { compact: true })}</Badge>
            }
          />
          <div className="px-4 pb-4 pt-1">
            <StageBars data={data.pipelineByStage} currency={currency} />
          </div>
          <div className="border-t border-border px-4 py-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted">Weighted forecast</span>
              <span className="font-semibold text-foreground">
                {money(kpis.weightedPipelineValue, currency)}
              </span>
            </div>
            <Progress
              value={kpis.openPipelineValue ? (kpis.weightedPipelineValue / kpis.openPipelineValue) * 100 : 0}
              className="mt-1.5"
            />
          </div>
        </Card>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardHeader
            title="My tasks"
            subtitle={`${kpis.tasksDue} due soon · ${kpis.overdueTasks} overdue`}
            icon={<CalendarClock className="size-3.5" />}
            action={
              <Link href="/activities" className="text-[11px] font-medium text-brand hover:underline">
                All
              </Link>
            }
          />
          <div className="border-t border-border">
            {data.myTasks.length ? (
              <ActivityFeed items={data.myTasks} showRelated showComplete />
            ) : (
              <EmptyState title="Inbox zero" description="No open tasks assigned to you." compact />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader
            title="Team leaderboard"
            subtitle="Closed-won, trailing 90 days"
            icon={<Users className="size-3.5" />}
          />
          <div className="border-t border-border">
            {data.leaderboard.slice(0, 5).map((entry, index) => {
              const maxWon = Math.max(1, ...data.leaderboard.map((item) => item.wonValue));
              return (
                <div key={entry.user.id} className="flex items-center gap-2.5 border-b border-border/70 px-3 py-2.5 last:border-0">
                  <span className="w-3 text-[10px] font-semibold tabular-nums text-faint">{index + 1}</span>
                  <Avatar name={entry.user.fullName} src={entry.user.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-medium text-foreground">{entry.user.fullName}</span>
                      <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-foreground">
                        {money(entry.wonValue, currency, { compact: true })}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Progress value={(entry.wonValue / maxWon) * 100} className="h-1" />
                      <span className="shrink-0 text-[10px] text-faint">{entry.wonCount} won · {entry.openCount} open</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader
            title="Support pulse"
            subtitle={`${tickets.total} tickets this period`}
            icon={<LifeBuoy className="size-3.5" />}
            action={
              tickets.urgent > 0 ? <Badge tone="danger" dot>{tickets.urgent} urgent</Badge> : <Badge tone="success" dot>Healthy</Badge>
            }
          />
          <div className="px-4 pb-3 pt-2">
            <DonutChart
              data={tickets.byStatus.map((item) => ({
                label: item.status,
                value: item.count,
                color: statusColors[item.status] ?? "#94a3b8",
              }))}
              totalLabel={String(tickets.total)}
              size={124}
              thickness={13}
            />
          </div>
          <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
            {[
              { label: "Open", value: tickets.open, tone: "text-info" },
              { label: "Pending", value: tickets.pending, tone: "text-warning" },
              { label: "Resolved", value: tickets.resolved, tone: "text-success" },
            ].map((item) => (
              <div key={item.label} className="bg-surface px-3 py-2">
                <div className={cn("text-[15px] font-semibold tabular-nums", item.tone)}>{item.value}</div>
                <div className="text-[10px] text-faint">{item.label}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title="Top open deals"
            subtitle="Largest opportunities by value"
            action={
              <Link href="/deals" className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline">
                Pipeline <ArrowUpRight className="size-3" />
              </Link>
            }
          />
          <div className="border-t border-border">
            {data.topDeals.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="flex items-center gap-3 border-b border-border/70 px-3.5 py-2.5 transition-colors last:border-0 hover:bg-surface-2/50"
              >
                <EntityMark name={deal.accountName ?? deal.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-foreground">{deal.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                    <span className="truncate">{deal.accountName ?? "No account"}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <StatusDot color={deal.stageColor} />
                      {deal.stageName}
                    </span>
                  </div>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <div className="w-14">
                    <Progress value={deal.probability} color={deal.stageColor} className="h-1" />
                  </div>
                  <span className="w-8 text-right text-[10px] tabular-nums text-muted">{deal.probability}%</span>
                </div>
                <div className="w-20 text-right">
                  <div className="text-[12.5px] font-semibold tabular-nums text-foreground">
                    {money(deal.amount, currency, { compact: true })}
                  </div>
                  <div className="truncate text-[10px] text-faint">{deal.ownerName}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader
            title="Recent activity"
            subtitle="Across every account"
            icon={<Clock className="size-3.5" />}
            action={
              <Link href="/activities" className="text-[11px] font-medium text-brand hover:underline">
                View all
              </Link>
            }
          />
          <div className="max-h-[332px] divide-y divide-border overflow-y-auto border-t border-border">
            {data.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                <ActivityIcon type={activity.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-foreground">{activity.subject}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                    <span className="truncate">{activity.relatedName ?? activity.relatedType}</span>
                    <span>·</span>
                    <span>{activity.ownerName}</span>
                    <span>·</span>
                    <span className="shrink-0">{relativeTime(activity.createdAt)}</span>
                  </div>
                </div>
                <StatusBadge status={activity.status} dot={false} className="mt-0.5" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-in-fade">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[86px] rounded-xl" />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-12">
        <Skeleton className="h-[288px] rounded-xl xl:col-span-8" />
        <Skeleton className="h-[288px] rounded-xl xl:col-span-4" />
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[238px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
