"use client";

import { useState } from "react";
import { FieldGroup, Label } from "@/components/ui/Field";

export function WorkspaceTypeFields() {
  const [accountType, setAccountType] = useState<"personal" | "organization">("personal");

  return (
    <>
      <FieldGroup>
        <Label>How will you use Workflow?</Label>
        <div className="grid gap-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 transition-colors has-checked:border-[var(--color-brand)] has-checked:bg-[var(--color-brand-soft)]">
            <input
              type="radio"
              name="accountType"
              value="personal"
              checked={accountType === "personal"}
              onChange={() => setAccountType("personal")}
              className="mt-1"
            />
            <span>
              <span className="block text-[13.5px] font-semibold text-[var(--color-ink)]">For myself</span>
              <span className="block text-[12.5px] text-[var(--color-muted)]">
                A personal workspace — still a real tenant, convertible to a team later.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 transition-colors has-checked:border-[var(--color-brand)] has-checked:bg-[var(--color-brand-soft)]">
            <input
              type="radio"
              name="accountType"
              value="organization"
              checked={accountType === "organization"}
              onChange={() => setAccountType("organization")}
              className="mt-1"
            />
            <span>
              <span className="block text-[13.5px] font-semibold text-[var(--color-ink)]">For an organization</span>
              <span className="block text-[12.5px] text-[var(--color-muted)]">
                A team workspace you own — invite teammates after setup.
              </span>
            </span>
          </label>
        </div>
      </FieldGroup>
      {accountType === "personal" ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas)] p-4">
          <p className="text-[13px] font-semibold text-[var(--color-ink)]">Personal workspace</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-muted)]">We will name this workspace from your profile. No organization name is needed.</p>
        </div>
      ) : <p className="text-[12.5px] text-[var(--color-muted)]">You will name the organization on the next step.</p>}
    </>
  );
}
