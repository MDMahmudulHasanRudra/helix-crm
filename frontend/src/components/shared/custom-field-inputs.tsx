"use client";

import type { CustomFieldValue } from "@/lib/types";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/fields";

export function CustomFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldValue[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (!fields.length) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field) => {
        const value = values[field.key] ?? "";
        if (field.fieldType === "select") {
          return (
            <Field key={field.key} label={field.label} required={field.isRequired} hint={field.helpText ?? undefined}>
              <NativeSelect value={value} onChange={(event) => onChange(field.key, event.target.value)}>
                <option value="">{field.placeholder ?? "Select…"}</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          );
        }
        if (field.fieldType === "textarea") {
          return (
            <Field key={field.key} label={field.label} required={field.isRequired} hint={field.helpText ?? undefined} className="sm:col-span-2">
              <Textarea
                value={value}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={field.placeholder ?? undefined}
              />
            </Field>
          );
        }
        if (field.fieldType === "checkbox") {
          return (
            <label key={field.key} className="flex items-center gap-2 self-end rounded-lg border border-border px-3 py-2 text-[12px]">
              <input
                type="checkbox"
                checked={value === "true"}
                onChange={(event) => onChange(field.key, event.target.checked ? "true" : "false")}
                className="size-3.5 accent-[var(--brand)]"
              />
              {field.label}
            </label>
          );
        }
        return (
          <Field key={field.key} label={field.label} required={field.isRequired} hint={field.helpText ?? undefined}>
            <Input
              type={field.fieldType === "date" ? "date" : field.fieldType === "number" || field.fieldType === "currency" ? "number" : "text"}
              value={value}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder ?? undefined}
            />
          </Field>
        );
      })}
    </div>
  );
}
