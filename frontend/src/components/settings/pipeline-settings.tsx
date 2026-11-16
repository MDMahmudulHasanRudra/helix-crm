"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CircleDollarSign, GitBranch, MoreHorizontal, Pencil, Plus, Trash2, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, usePipelines } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { Field, Input, NativeSelect } from "@/components/ui/fields";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/overlays";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { money } from "@/lib/utils";
import type { Pipeline, Stage } from "@/lib/types";

export function PipelineSettings() {
  const { me } = useWorkspace();
  const { data: pipelines, isLoading, mutate: refresh } = usePipelines();
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [stageDialog, setStageDialog] = useState<{ pipelineId: string; stage?: Stage } | null>(null);
  const [deletePipeline, setDeletePipeline] = useState<Pipeline | null>(null);
  const [deleteStage, setDeleteStage] = useState<{ pipelineId: string; stage: Stage } | null>(null);
  const [busy, setBusy] = useState(false);

  async function setDefault(pipeline: Pipeline) {
    try {
      await mutate(`/pipelines/${pipeline.id}`, "PUT", { name: pipeline.name, isDefault: true });
      await refresh();
      await globalMutate((key) => typeof key === "string" && key.startsWith("/deals"));
      toast.success(`${pipeline.name} is now the default pipeline`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update pipeline");
    }
  }

  async function removePipeline() {
    if (!deletePipeline) return;
    setBusy(true);
    try {
      await mutate(`/pipelines/${deletePipeline.id}`, "DELETE");
      await refresh();
      toast.success("Pipeline deleted");
      setDeletePipeline(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete pipeline");
    } finally {
      setBusy(false);
    }
  }

  async function removeStage() {
    if (!deleteStage) return;
    setBusy(true);
    try {
      await mutate(`/pipelines/${deleteStage.pipelineId}/stages/${deleteStage.stage.id}`, "DELETE");
      await refresh();
      toast.success("Stage deleted");
      setDeleteStage(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete stage");
    } finally {
      setBusy(false);
    }
  }

  async function reorder(pipeline: Pipeline, stage: Stage, direction: -1 | 1) {
    const stages = [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = stages.findIndex((item) => item.id === stage.id);
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await mutate(`/pipelines/${pipeline.id}/stages/reorder`, "PATCH", { stageIds: next.map((item) => item.id) });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reorder stages");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Pipelines</h2>
          <p className="text-[11.5px] text-muted">Model how deals move from first touch to closed won.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setPipelineOpen(true)}>
          <Plus className="size-3.5" /> New pipeline
        </Button>
      </div>

      {isLoading && !pipelines ? (
        <Skeleton className="h-[360px] rounded-xl" />
      ) : (
        (pipelines ?? []).map((pipeline) => (
          <Card key={pipeline.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {pipeline.name}
                  {pipeline.isDefault ? <Badge tone="brand">Default</Badge> : null}
                </span>
              }
              subtitle={`${pipeline.openDealCount} open deals · ${money(pipeline.openValue, me.organization.currency, { compact: true })} pipeline`}
              icon={<GitBranch className="size-3.5" />}
              action={
                <div className="flex items-center gap-1.5">
                  <Button variant="secondary" size="xs" onClick={() => setStageDialog({ pipelineId: pipeline.id })}>
                    <Plus className="size-3" /> Stage
                  </Button>
                  <Dropdown>
                    <DropdownTrigger asChild>
                      <IconButton size="icon-sm" variant="outline" aria-label={`Manage ${pipeline.name}`}><MoreHorizontal className="size-3.5" /></IconButton>
                    </DropdownTrigger>
                    <DropdownContent>
                      {!pipeline.isDefault ? (
                        <DropdownItem icon={<Trophy />} onSelect={() => void setDefault(pipeline)}>Make default</DropdownItem>
                      ) : null}
                      <DropdownSeparator />
                      <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeletePipeline(pipeline)}>Delete pipeline</DropdownItem>
                    </DropdownContent>
                  </Dropdown>
                </div>
              }
            />
            <div className="border-t border-border">
              {[...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder).map((stage, index, list) => (
                <div key={stage.id} className="group flex items-center gap-2.5 border-b border-border/60 px-4 py-2 last:border-0">
                  <span className="w-4 text-[10px] tabular-nums text-faint">{index + 1}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-foreground">{stage.name}</span>
                      {stage.isWon ? <Badge tone="success" className="h-[18px] px-1.5 text-[9.5px]"><Trophy className="size-2.5" /> Won</Badge> : null}
                      {stage.isLost ? <Badge tone="danger" className="h-[18px] px-1.5 text-[9.5px]"><XCircle className="size-2.5" /> Lost</Badge> : null}
                    </div>
                    <div className="flex items-center gap-2 text-[10.5px] text-muted">
                      <span>{stage.dealCount} deals</span>
                      <span className="text-faint">·</span>
                      <span className="tabular-nums">{money(stage.dealValue, me.organization.currency, { compact: true })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1 w-12 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${stage.probability}%` }} />
                      </div>
                      <span className="w-8 text-right text-[10.5px] tabular-nums text-muted">{stage.probability}%</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton size="icon-sm" variant="ghost" aria-label="Move stage up" disabled={index === 0} onClick={() => void reorder(pipeline, stage, -1)}>
                        <ArrowUp className="size-3" />
                      </IconButton>
                      <IconButton size="icon-sm" variant="ghost" aria-label="Move stage down" disabled={index === list.length - 1} onClick={() => void reorder(pipeline, stage, 1)}>
                        <ArrowDown className="size-3" />
                      </IconButton>
                      <IconButton size="icon-sm" variant="ghost" aria-label="Edit stage" onClick={() => setStageDialog({ pipelineId: pipeline.id, stage })}>
                        <Pencil className="size-3" />
                      </IconButton>
                      <IconButton size="icon-sm" variant="ghost" aria-label="Delete stage" onClick={() => setDeleteStage({ pipelineId: pipeline.id, stage })}>
                        <Trash2 className="size-3" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              ))}
              {pipeline.stages.length === 0 ? (
                <div className="px-4 py-6 text-center text-[11.5px] text-muted">No stages yet — add the first stage for this pipeline.</div>
              ) : null}
            </div>
          </Card>
        ))
      )}

      {!isLoading && (pipelines ?? []).length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center">
            <CircleDollarSign className="mx-auto size-5 text-faint" />
            <h3 className="mt-2 text-[13px] font-semibold">No pipelines yet</h3>
            <p className="mt-1 text-[11.5px] text-muted">Create a pipeline to start tracking deals and forecasting.</p>
            <Button variant="primary" size="sm" className="mt-3" onClick={() => setPipelineOpen(true)}><Plus className="size-3.5" /> New pipeline</Button>
          </div>
        </Card>
      ) : null}

      <PipelineDialog open={pipelineOpen} onOpenChange={setPipelineOpen} onSaved={() => void refresh()} />
      <StageDialog
        open={Boolean(stageDialog)}
        onOpenChange={(open) => !open && setStageDialog(null)}
        pipelineId={stageDialog?.pipelineId}
        stage={stageDialog?.stage}
        onSaved={() => void refresh()}
      />
      <ConfirmDialog
        open={Boolean(deletePipeline)}
        onOpenChange={(open) => !open && setDeletePipeline(null)}
        title={deletePipeline ? `Delete ${deletePipeline.name}?` : "Delete pipeline?"}
        description="Pipelines with open deals cannot be deleted. Close or move those deals first."
        loading={busy}
        onConfirm={removePipeline}
      />
      <ConfirmDialog
        open={Boolean(deleteStage)}
        onOpenChange={(open) => !open && setDeleteStage(null)}
        title={deleteStage ? `Delete ${deleteStage.stage.name}?` : "Delete stage?"}
        description="Stages with open deals cannot be deleted. Move those deals first."
        loading={busy}
        onConfirm={removeStage}
      />
    </div>
  );
}

function PipelineDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Pipeline name is required");
      return;
    }
    setSaving(true);
    try {
      await mutate("/pipelines", "POST", { name, isDefault });
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/pipelines") || key.startsWith("/deals")));
      toast.success("Pipeline created");
      onOpenChange(false);
      setName("");
      setIsDefault(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create pipeline");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader title="New pipeline" description="Give it a name and add stages next." />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <Field label="Pipeline name" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enterprise sales" autoFocus />
            </Field>
            <label className="flex items-center gap-2 text-[12px] text-foreground">
              <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} className="size-3.5 accent-[var(--brand)]" />
              Make this the default pipeline
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>Create pipeline</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StageDialog({
  open,
  onOpenChange,
  pipelineId,
  stage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId?: string;
  stage?: Stage;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    probability: "20",
    color: "#6366f1",
    outcome: "open",
  });

  // Reset when the dialog opens for a different stage.
  useEffect(() => {
    if (!open) return;
    setForm({
      name: stage?.name ?? "",
      probability: String(stage?.probability ?? 20),
      color: stage?.color ?? "#6366f1",
      outcome: stage?.isWon ? "won" : stage?.isLost ? "lost" : "open",
    });
  }, [open, stage, pipelineId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!pipelineId) return;
    if (!form.name.trim()) {
      toast.error("Stage name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        probability: Number(form.probability) || 0,
        color: form.color,
        isWon: form.outcome === "won",
        isLost: form.outcome === "lost",
      };
      if (stage) await mutate(`/pipelines/${pipelineId}/stages/${stage.id}`, "PUT", payload);
      else await mutate(`/pipelines/${pipelineId}/stages`, "POST", payload);
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/pipelines") || key.startsWith("/deals")));
      toast.success(stage ? "Stage updated" : "Stage added");
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save stage");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader title={stage ? `Edit ${stage.name}` : "New stage"} description="Stages define probability and closed-won/lost behaviour." />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <Field label="Stage name" required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Discovery" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Probability %">
                <Input type="number" min="0" max="100" value={form.probability} onChange={(event) => setForm({ ...form, probability: event.target.value })} />
              </Field>
              <Field label="Colour">
                <div className="flex items-center gap-2">
                  <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1" />
                  <Input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="font-mono text-[11.5px]" />
                </div>
              </Field>
            </div>
            <Field label="Stage outcome">
              <NativeSelect value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value })}>
                <option value="open">Open — still in progress</option>
                <option value="won">Closed won</option>
                <option value="lost">Closed lost</option>
              </NativeSelect>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{stage ? "Save stage" : "Add stage"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
