"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import type { FormField } from "@/db/schema";

type MappingEditorProps = {
  campaignId: string;
  fields: FormField[];
  initialMapping: Record<string, string>;
  options: Array<{ key: string; label: string }>;
  active: boolean;
  saved: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
};

export function MappingEditor({ campaignId, fields, initialMapping, options, active, saved, saveAction }: MappingEditorProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);
  const initial = useMemo(() => JSON.stringify(initialMapping), [initialMapping]);
  const dirty = JSON.stringify(mapping) !== initial;

  return (
    <form action={saveAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      {saved && !dirty && (
        <p role="status" className="rounded-[var(--radius-sm)] border border-[var(--color-success)]/25 bg-[var(--color-success-soft)] px-3 py-2 text-[12px] text-[var(--color-success)]">
          Mapping saved.
        </p>
      )}
      <div className="grid gap-3">
        {fields.map((field) => (
          <div key={field.name} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
            <div>
              <p className="text-[13px] font-medium text-[var(--color-ink)]">
                {field.label} {field.required && <span className="text-[var(--color-danger)]">*</span>}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{field.type}</p>
            </div>
            <span className="text-[var(--color-muted)]">→</span>
            <Select
              disabled={active}
              name={`map__${field.name}`}
              value={mapping[field.name] ?? ""}
              onChange={(event) => setMapping((current) => ({ ...current, [field.name]: event.target.value }))}
            >
              <option value="">— Not mapped —</option>
              {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </Select>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-[var(--color-muted)]">
          {active ? "Mapping is locked while execution is active." : dirty ? "Unsaved mapping changes" : "Mapping is up to date."}
        </p>
        <Button type="submit" disabled={active || !dirty}>{dirty ? "Save changes" : "Save mapping"}</Button>
      </div>
    </form>
  );
}
