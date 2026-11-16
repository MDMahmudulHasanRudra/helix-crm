"use client";

import { useState } from "react";
import { ArrowRight, Bot, Copy, GitMerge, Play, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useAutonomousInsights, useAutonomousSettings, useDuplicates } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/fields";
import type { AutonomousRunResult, AutonomousSettings, DuplicateCandidate } from "@/lib/types";

const AUTONOMOUS_KEYS = (key: unknown) =>
  typeof key === "string" &&
  (key.startsWith("/autonomous") ||
    key.startsWith("/duplicates") ||
    key.startsWith("/leads") ||
    key.startsWith("/deals") ||
    key.startsWith("/tickets") ||
    key.startsWith("/contacts") ||
    key.startsWith("/accounts") ||
    key.startsWith("/dashboard"));

export function AutonomousSettingsPanel() {
  const { me } = useWorkspace();
  const canManage = me.user.role === "Admin" || me.user.role === "Manager";
  const { data: settings, isLoading, mutate: refreshSettings } = useAutonomousSettings();
  const { data: insights } = useAutonomousInsights();
  const { data: duplicates, isLoading: duplicatesLoading, mutate: refreshDuplicates } = useDuplicates();
  const [running, setRunning] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  async function refreshEverything() {
    await Promise.all([refreshSettings(), refreshDuplicates(), globalMutate(AUTONOMOUS_KEYS)]);
  }

  async function runNow() {
    setRunning(true);
    try {
      const result = await mutate<AutonomousRunResult>("/autonomous/run", "POST");
      await refreshEverything();
      toast.success(
        `Reviewed ${result.dealsReviewed} deals, ${result.ticketsReviewed} tickets and ${result.contactsReviewed} contacts. ${result.dealsFlaggedStalled} stalled, ${result.ticketsEscalated} escalated, ${result.leadsRouted} lead(s) routed, ${result.duplicatesCreated} new duplicates.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to run the workers");
    } finally {
      setRunning(false);
    }
  }

  async function rescore() {
    setRescoring(true);
    try {
      const result = await mutate<{ changed: number; message: string }>("/autonomous/leads/rescore", "POST");
      await refreshEverything();
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to re-score leads");
    } finally {
      setRescoring(false);
    }
  }

  async function merge(candidate: DuplicateCandidate) {
    setActionId(`${candidate.id}:merge`);
    try {
      const result = await mutate<{ message: string }>(`/duplicates/${candidate.id}/merge`, "POST");
      await refreshEverything();
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to merge records");
    } finally {
      setActionId(null);
    }
  }

  async function dismiss(candidate: DuplicateCandidate) {
    setActionId(`${candidate.id}:dismiss`);
    try {
      await mutate(`/duplicates/${candidate.id}/dismiss`, "POST");
      await refreshEverything();
      toast.success("Duplicate suggestion dismissed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to dismiss suggestion");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Autonomous revenue operations</h2>
          <p className="text-[11.5px] text-muted">
            Background workers score and route leads, chase stalled deals, escalate SLA breaches and keep the data clean.
          </p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => void rescore()} loading={rescoring}>
              <RefreshCw className="size-3.5" /> Re-score leads
            </Button>
            <Button variant="primary" size="sm" onClick={() => void runNow()} loading={running}>
              <Play className="size-3.5" /> Run now
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Stalled deals", value: insights?.stalledDeals ?? 0, detail: "Needs a next step" },
          { label: "SLA breaches", value: insights?.slaBreaches ?? 0, detail: `${insights?.escalations ?? 0} escalations` },
          { label: "Stale contacts", value: insights?.staleContacts ?? 0, detail: "Past freshness window" },
          { label: "Duplicates", value: insights?.duplicateCandidates ?? 0, detail: "Awaiting review" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
              <Bot className="size-3.5 text-faint" />
            </div>
            <div className="mt-1.5 text-[19px] font-semibold leading-none tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1.5 text-[11px] text-muted">{item.detail}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Engine settings"
          subtitle="Thresholds apply to every autonomous worker in this workspace."
          icon={<Sparkles className="size-3.5" />}
          action={insights?.enabled ? <Badge tone="success" dot>Running</Badge> : <Badge tone="neutral">Paused</Badge>}
        />
        <div className="border-t border-border">
          {isLoading && !settings ? (
            <div className="space-y-1.5 p-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : settings ? (
            <EngineSettingsForm
              settings={settings}
              canManage={canManage}
              highScoreLeads={insights?.highScoreLeads ?? 0}
              onSaved={refreshEverything}
            />
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Duplicate review"
          subtitle="Fuzzy-matched accounts and contacts. Merging keeps the older record and relinks every related item."
          icon={<Copy className="size-3.5" />}
          action={<Badge tone={duplicates && duplicates.total > 0 ? "warning" : "success"} dot>{duplicates?.total ?? 0} pending</Badge>}
        />
        <div className="border-t border-border">
          {duplicatesLoading && !duplicates ? (
            <div className="space-y-1.5 p-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : duplicates?.items.length ? (
            <div className="divide-y divide-border">
              {duplicates.items.map((candidate) => (
                <div key={candidate.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                    {candidate.entityType === "Account" ? <Copy className="size-3.5" /> : <GitMerge className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="outline">{candidate.entityType}</Badge>
                      <Badge tone={candidate.similarity >= 0.95 ? "danger" : "warning"}>
                        {Math.round(candidate.similarity * 100)}% match
                      </Badge>
                      <span className="text-[10.5px] text-faint">{candidate.reason}</span>
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px]">
                      <span className="truncate font-medium text-foreground">{candidate.primaryName}</span>
                      <ArrowRight className="size-3 shrink-0 text-faint" />
                      <span className="truncate text-muted">{candidate.duplicateName}</span>
                    </div>
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="primary"
                        loading={actionId === `${candidate.id}:merge`}
                        disabled={actionId !== null}
                        onClick={() => void merge(candidate)}
                      >
                        <GitMerge className="size-3" /> Merge
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        loading={actionId === `${candidate.id}:dismiss`}
                        disabled={actionId !== null}
                        onClick={() => void dismiss(candidate)}
                      >
                        <X className="size-3" /> Dismiss
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ShieldCheck />}
              title="No duplicate suggestions"
              description="The hygiene worker keeps scanning. New fuzzy matches will appear here for review."
              compact
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function EngineSettingsForm({
  settings,
  canManage,
  highScoreLeads,
  onSaved,
}: {
  settings: AutonomousSettings;
  canManage: boolean;
  highScoreLeads: number;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<AutonomousSettings>(settings);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await mutate<AutonomousSettings>("/autonomous/settings", "PUT", form);
      await onSaved();
      toast.success("Autonomous settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2/40 p-3">
          <input
            type="checkbox"
            checked={form.autonomousEnabled}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, autonomousEnabled: event.target.checked })}
            className="mt-0.5 size-3.5 accent-[var(--brand)]"
          />
          <span>
            <span className="block text-[12.5px] font-medium text-foreground">Enable the autonomous daemon</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
              Runs velocity, SLA, freshness and duplicate sweeps in the background.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2/40 p-3">
          <input
            type="checkbox"
            checked={form.autoRouteLeads}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, autoRouteLeads: event.target.checked })}
            className="mt-0.5 size-3.5 accent-[var(--brand)]"
          />
          <span>
            <span className="block text-[12.5px] font-medium text-foreground">Auto-route high-score leads</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
              Assigns leads above the routing threshold to the least-loaded rep.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Stale deal threshold" hint="days">
          <Input
            type="number"
            min={3}
            max={365}
            value={form.staleDealDays}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, staleDealDays: Number(event.target.value) })}
          />
        </Field>
        <Field label="Stale probability penalty" hint="points">
          <Input
            type="number"
            min={0}
            max={80}
            value={form.staleDealProbabilityPenalty}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, staleDealProbabilityPenalty: Number(event.target.value) })}
          />
        </Field>
        <Field label="Data freshness window" hint="days">
          <Input
            type="number"
            min={30}
            max={730}
            value={form.dataFreshnessDays}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, dataFreshnessDays: Number(event.target.value) })}
          />
        </Field>
        <Field label="Lead routing threshold" hint="0–100">
          <Input
            type="number"
            min={0}
            max={100}
            value={form.leadScoreRoutingThreshold}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, leadScoreRoutingThreshold: Number(event.target.value) })}
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-[11px] text-muted">{highScoreLeads} high-score lead(s) currently waiting for an owner.</p>
        {canManage ? (
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            <ShieldCheck className="size-3.5" /> Save settings
          </Button>
        ) : (
          <span className="text-[11px] text-faint">Admin or Manager role required to change settings.</span>
        )}
      </div>
    </form>
  );
}
