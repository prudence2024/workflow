"use client";

import { useEffect, useState } from "react";
import { FieldGroup, Input, Label } from "@/components/ui/Field";
import { countryForPhone, localPhoneForCountry } from "@/lib/phoneNumber";
import { InternationalPhoneInput } from "@/app/onboarding/InternationalPhoneInput";

const WORKSPACE_DRAFT = "workflow:draft:onboarding:workspace:v1";
const DETAILS_DRAFT = "workflow:draft:onboarding:details:v1";

type WorkspaceType = "personal" | "organization";

function readDraft<T>(key: string): T | null {
  try {
    const value = sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Draft persistence is a convenience and must never block onboarding.
  }
}

export function clearOnboardingDraft(step: "workspace" | "details") {
  try {
    sessionStorage.removeItem(step === "workspace" ? WORKSPACE_DRAFT : DETAILS_DRAFT);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function OnboardingDraftCleanup({ step }: { step?: "workspace" | "details" }) {
  useEffect(() => {
    if (step) clearOnboardingDraft(step);
  }, [step]);
  return null;
}

export function WorkspaceDraftFields({ initialType }: { initialType?: WorkspaceType | null }) {
  const [accountType, setAccountType] = useState<WorkspaceType>(initialType ?? "personal");

  useEffect(() => {
    if (initialType) {
      clearOnboardingDraft("workspace");
      return;
    }
    const draft = readDraft<{ accountType?: WorkspaceType }>(WORKSPACE_DRAFT);
    if (draft?.accountType === "personal" || draft?.accountType === "organization") setAccountType(draft.accountType);
  }, [initialType]);

  function updateAccountType(value: WorkspaceType) {
    setAccountType(value);
    writeDraft(WORKSPACE_DRAFT, { accountType: value });
  }

  return (
    <div className="space-y-3">
      <Label>How will you use Workflow?</Label>
      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 transition-colors has-checked:border-[var(--color-brand)] has-checked:bg-[var(--color-brand-soft)]">
        <input type="radio" name="accountType" value="personal" checked={accountType === "personal"} onChange={() => updateAccountType("personal")} className="mt-1" />
        <span><span className="block text-[13.5px] font-semibold text-[var(--color-ink)]">For myself</span><span className="block text-[12.5px] text-[var(--color-muted)]">A personal workspace — still a real tenant, convertible to a team later.</span></span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 transition-colors has-checked:border-[var(--color-brand)] has-checked:bg-[var(--color-brand-soft)]">
        <input type="radio" name="accountType" value="organization" checked={accountType === "organization"} onChange={() => updateAccountType("organization")} className="mt-1" />
        <span><span className="block text-[13.5px] font-semibold text-[var(--color-ink)]">For an organization</span><span className="block text-[12.5px] text-[var(--color-muted)]">A team workspace you own — invite teammates after setup.</span></span>
      </label>
      {accountType === "personal" ? <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas)] p-4"><p className="text-[13px] font-semibold text-[var(--color-ink)]">Personal workspace</p><p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-muted)]">We will name this workspace from your profile. No organization name is needed.</p></div> : <p className="text-[12.5px] text-[var(--color-muted)]">You will name the organization on the next step.</p>}
    </div>
  );
}

export function DetailsDraftFields({
  initialFirstName,
  initialLastName,
  initialPhone,
  initialWorkspaceName,
  organization,
}: {
  initialFirstName?: string | null;
  initialLastName?: string | null;
  initialPhone?: string | null;
  initialWorkspaceName?: string | null;
  organization: boolean;
}) {
  const [values, setValues] = useState({ firstName: initialFirstName ?? "", lastName: initialLastName ?? "", phone: localPhoneForCountry(initialPhone, countryForPhone(initialPhone)) ?? "", phoneCountry: countryForPhone(initialPhone)?.code ?? "", name: initialWorkspaceName ?? "" });

  useEffect(() => {
    const hasServerDetails = Boolean(initialPhone || initialWorkspaceName);
    if (hasServerDetails) {
      clearOnboardingDraft("details");
      return;
    }
    const draft = readDraft<Partial<typeof values>>(DETAILS_DRAFT);
    if (draft) setValues((current) => ({ ...current, ...draft }));
  }, [initialPhone, initialWorkspaceName]);

  function update(field: keyof typeof values, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    writeDraft(DETAILS_DRAFT, next);
  }

  return <>
    <FieldGroup><Label htmlFor="firstName">First name</Label><Input id="firstName" name="firstName" value={values.firstName} onChange={(event) => update("firstName", event.target.value)} autoComplete="given-name" required /></FieldGroup>
    <FieldGroup><Label htmlFor="lastName">Last name</Label><Input id="lastName" name="lastName" value={values.lastName} onChange={(event) => update("lastName", event.target.value)} autoComplete="family-name" required /></FieldGroup>
    <InternationalPhoneInput value={values.phone} countryCode={values.phoneCountry} onChange={(phone, phoneCountry) => { const next = { ...values, phone, phoneCountry }; setValues(next); writeDraft(DETAILS_DRAFT, next); }} />
    {organization && <FieldGroup><Label htmlFor="name">Organization name <span className="text-[var(--color-danger)]" aria-hidden="true">*</span></Label><Input id="name" name="name" value={values.name} onChange={(event) => update("name", event.target.value)} minLength={2} required autoComplete="organization" placeholder="Your organization" /></FieldGroup>}
  </>;
}
