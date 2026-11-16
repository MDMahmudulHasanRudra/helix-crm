"use client";

import { History } from "lucide-react";
import type { AuditEntry, CustomFieldValue } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { DetailField } from "@/components/ui/layout";

export function CustomFieldsCard({ fields }: { fields: CustomFieldValue[] }) {
  if (!fields.length) return null;
  return (
    <Card>
      <CardHeader title="Custom fields" subtitle="Workspace-specific data" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border px-4 py-3.5">
        {fields.map((field) => (
          <DetailField key={field.key} label={field.label}>
            <CustomValue field={field} />
          </DetailField>
        ))}
      </div>
    </Card>
  );
}

export function CustomValue({ field }: { field: CustomFieldValue }) {
  const value = field.value;
  if (!value) return <span className="text-faint">—</span>;
  if (field.fieldType === "date") return formatDate(value, "long");
  if (field.fieldType === "checkbox") return value === "true" ? "Yes" : "No";
  if (field.fieldType === "currency") {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : `$${numeric.toLocaleString()}`;
  }
  return <span className="whitespace-pre-line">{value}</span>;
}

export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader title="Change history" subtitle="Every edit is recorded for compliance" icon={<History className="size-3.5" />} />
      {entries.length === 0 ? (
        <EmptyState
          title="No changes yet"
          description="Edits to this record will appear here with the actor and previous values."
          compact
        />
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {entries.map((entry) => (
            <div key={entry.id} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-medium text-foreground">{entry.actorName}</span>
                <span className="shrink-0 text-[10px] text-faint">{formatDateTime(entry.createdAt)}</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {parseChanges(entry.changesJson).map((change, index) => (
                  <p key={index} className="text-[11px] text-muted">
                    <span className="font-medium text-foreground/80">{change.field}</span>
                    {change.from ? (
                      <>
                        {" "}
                        changed from <span className="line-through opacity-70">{change.from}</span> to{" "}
                        <span className="text-foreground">{change.to || "empty"}</span>
                      </>
                    ) : (
                      <> set to <span className="text-foreground">{change.to || "empty"}</span></>
                    )}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function parseChanges(json: string): { field: string; from: string; to: string }[] {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(parsed).map(([field, value]) => {
      if (Array.isArray(value)) {
        return { field: label(field), from: String(value[0] ?? ""), to: String(value[1] ?? "") };
      }
      return { field: label(field), from: "", to: String(value ?? "") };
    });
  } catch {
    return [{ field: "Record", from: "", to: "updated" }];
  }
}

function label(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()).replace(" Id", "");
}
