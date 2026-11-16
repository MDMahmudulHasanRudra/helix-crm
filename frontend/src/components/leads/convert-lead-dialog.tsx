"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useAccounts, usePipelines } from "@/lib/api";
import type { LeadDetail } from "@/lib/types";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/utils";

export function ConvertLeadDialog({
  open,
  onOpenChange,
  lead,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadDetail;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { me, users } = useWorkspace();
  const { data: accounts } = useAccounts({ page: 1, pageSize: 200 });
  const { data: pipelines } = usePipelines();
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [createDeal, setCreateDeal] = useState(true);
  const [dealName, setDealName] = useState("");
  const [amount, setAmount] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const pipeline = pipelines?.find((item) => item.id === pipelineId) ?? pipelines?.[0];

  useEffect(() => {
    if (!open) return;
    setAccountId("");
    setCreateDeal(true);
    setDealName(lead.company ? `${lead.company} — New opportunity` : `${lead.fullName} — New opportunity`);
    setAmount(lead.estimatedValue ? String(lead.estimatedValue) : "");
    setPipelineId(pipelines?.[0]?.id ?? "");
    setStageId("");
    setOwnerId(lead.ownerId ?? me.user.id);
  }, [open, lead, pipelines, me.user.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await mutate<{ accountId: string; contactId: string; dealId?: string; message: string }>(
        `/leads/${lead.id}/convert`,
        "POST",
        {
          accountId: accountId || null,
          createDeal,
          dealName: dealName || null,
          amount: amount ? Number(amount) : null,
          pipelineId: pipelineId || null,
          stageId: stageId || null,
          ownerId: ownerId || null,
        },
      );
      await globalMutate((key) =>
        typeof key === "string" &&
        (key.startsWith("/leads") || key.startsWith("/accounts") || key.startsWith("/contacts") || key.startsWith("/deals") || key.startsWith("/dashboard")),
      );
      toast.success(result.message);
      onOpenChange(false);
      onSaved?.();
      router.push(result.dealId ? `/deals/${result.dealId}` : `/accounts/${result.accountId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to convert lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          title={`Convert ${lead.fullName}`}
          description="Create an account and contact, and optionally open a deal — all in one step."
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-[12px]">
              <div className="font-medium text-foreground">{lead.fullName}</div>
              <div className="mt-0.5 text-muted">
                {lead.company ?? "No company"} · {lead.email ?? "No email"} · {money(lead.estimatedValue, me.organization.currency)}
              </div>
            </div>

            <Field label="Account" hint="Leave blank to create one">
              <NativeSelect value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">Create new account{lead.company ? ` — ${lead.company}` : ""}</option>
                {(accounts?.items ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <label className="flex items-center gap-2 text-[12px] text-foreground">
              <input
                type="checkbox"
                checked={createDeal}
                onChange={(event) => setCreateDeal(event.target.checked)}
                className="size-3.5 accent-[var(--brand)]"
              />
              Create an open deal from this lead
            </label>

            {createDeal ? (
              <div className="space-y-3 rounded-lg border border-border bg-surface-2/30 p-3">
                <Field label="Deal name">
                  <Input value={dealName} onChange={(event) => setDealName(event.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Amount (${me.organization.currency})`}>
                    <Input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} />
                  </Field>
                  <Field label="Pipeline">
                    <NativeSelect
                      value={pipelineId}
                      onChange={(event) => {
                        setPipelineId(event.target.value);
                        setStageId("");
                      }}
                    >
                      {(pipelines ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Stage">
                    <NativeSelect value={stageId} onChange={(event) => setStageId(event.target.value)}>
                      <option value="">First open stage</option>
                      {(pipeline?.stages ?? []).filter((stage) => !stage.isWon && !stage.isLost).map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Owner">
                    <NativeSelect value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.fullName}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Convert lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
