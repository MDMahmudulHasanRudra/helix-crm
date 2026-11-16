"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { toast } from "sonner";
import { mutate } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { fromDateInput, toDateInput } from "@/lib/utils";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";

const types = ["Task", "Call", "Email", "Meeting", "Note"];

export function ActivityDialog({
  open,
  onOpenChange,
  activity,
  relatedType,
  relatedId,
  relatedName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity | null;
  relatedType?: string;
  relatedId?: string;
  relatedName?: string;
  onSaved?: () => void;
}) {
  const { me, users } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState("Task");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("09:00");
  const [priority, setPriority] = useState("Normal");
  const [ownerId, setOwnerId] = useState(me.user.id);
  const [linkType, setLinkType] = useState(relatedType ?? "Account");
  const [linkId, setLinkId] = useState(relatedId ?? "");
  const [duration, setDuration] = useState("");

  const { data: records } = useSWR<{ items: Record<string, unknown>[] }>(
    open && !relatedId ? `/${recordPath(linkType)}?page=1&pageSize=200` : null,
  );

  useEffect(() => {
    if (!open) return;
    setType(activity?.type ?? "Task");
    setSubject(activity?.subject ?? "");
    setBody(activity?.body ?? "");
    setDueDate(toDateInput(activity?.dueAt));
    setDueTime(activity?.dueAt ? new Date(activity.dueAt).toTimeString().slice(0, 5) : "09:00");
    setPriority(activity?.priority ?? "Normal");
    setOwnerId(activity?.ownerId ?? me.user.id);
    setLinkType(relatedType ?? activity?.relatedType ?? "Account");
    setLinkId(relatedId ?? activity?.relatedId ?? "");
    setDuration(activity?.durationMinutes ? String(activity.durationMinutes) : "");
  }, [open, activity, relatedType, relatedId, me.user.id]);

  function recordLabel(record: Record<string, unknown>) {
    return String(record.fullName ?? record.name ?? record.subject ?? record.number ?? "Untitled");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!linkId) {
      toast.error("Choose a record to link this to");
      return;
    }
    setSaving(true);
    try {
      const dueAt = dueDate && type !== "Note" ? `${dueDate}T${dueTime || "09:00"}:00` : null;
      const payload = {
        type,
        subject,
        body: body || null,
        dueAt,
        priority,
        relatedType: linkType,
        relatedId: linkId,
        ownerId,
        durationMinutes: duration ? Number(duration) : null,
        status: activity?.status,
      };
      if (activity) await mutate(`/activities/${activity.id}`, "PUT", payload);
      else await mutate("/activities", "POST", payload);
      await globalMutate((key) =>
        typeof key === "string" &&
        (key.startsWith("/activities") || key.startsWith("/dashboard") || key.includes(linkId ?? "__")),
      );
      toast.success(activity ? "Activity updated" : `${type} logged`);
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save activity");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          title={activity ? "Edit activity" : "Log activity"}
          description={
            relatedName
              ? `On ${relatedName}`
              : "Capture a call, email, meeting, task or note against any record."
          }
        />
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-5 gap-1.5">
              {types.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  className={
                    "h-8 rounded-lg border text-[12px] font-medium transition-colors " +
                    (type === option
                      ? "border-brand/40 bg-brand-soft text-brand"
                      : "border-border bg-surface text-muted hover:text-foreground")
                  }
                >
                  {option}
                </button>
              ))}
            </div>

            <Field label="Subject" required>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder={type === "Note" ? "What happened?" : "e.g. Discovery call with procurement"}
                autoFocus
              />
            </Field>

            <Field label="Details">
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Add context, decisions or next steps…"
                rows={3}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              {type !== "Note" ? (
                <>
                  <Field label="Due date">
                    <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                  </Field>
                  <Field label="Due time">
                    <Input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
                  </Field>
                </>
              ) : null}
              <Field label="Priority">
                <NativeSelect value={priority} onChange={(event) => setPriority(event.target.value)}>
                  {["Low", "Normal", "High", "Urgent"].map((option) => (
                    <option key={option} value={option}>
                      {option}
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
              {type === "Call" || type === "Meeting" ? (
                <Field label="Duration (minutes)">
                  <Input type="number" min="0" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="30" />
                </Field>
              ) : null}
            </div>

            {!relatedId ? (
              <div className="grid grid-cols-[130px_1fr] gap-3">
                <Field label="Related to">
                  <NativeSelect
                    value={linkType}
                    onChange={(event) => {
                      setLinkType(event.target.value);
                      setLinkId("");
                    }}
                  >
                    {["Account", "Contact", "Lead", "Deal", "Ticket"].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={`${linkType} record`} required>
                  <NativeSelect value={linkId} onChange={(event) => setLinkId(event.target.value)}>
                    <option value="">Select a {linkType.toLowerCase()}…</option>
                    {(records?.items ?? []).map((record) => (
                      <option key={String(record.id)} value={String(record.id)}>
                        {recordLabel(record)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {activity ? "Save activity" : `Log ${type.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function recordPath(type: string) {
  switch (type) {
    case "Contact":
      return "contacts";
    case "Lead":
      return "leads";
    case "Deal":
      return "deals";
    case "Ticket":
      return "tickets";
    default:
      return "accounts";
  }
}
