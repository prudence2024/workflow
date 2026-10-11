"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const ITEMS = [
  ["Dashboard", "See activity, attention items, and plan usage.", "/dashboard"],
  ["Contacts", "Import records, edit details, add tags and notes.", "/contacts"],
  ["Forms", "Connect an authorized form and map its fields.", "/form-operations"],
  ["Campaigns", "Create a cohort, validate it, and queue a controlled run.", "/campaigns"],
  ["Automations", "Review durable jobs and their evidence.", "/form-operations"],
  ["Communications", "Send consent-aware email and SMS through the outbox.", "/communications"],
  ["Downloads", "Install the app and access workspace files.", "/downloads"],
  ["Reports", "Review truthful outcomes and follow-up work.", "/reports"],
  ["Billing", "Review your plan, usage, payments, and receipts.", "/settings/usage"],
  ["Settings", "Manage workspace details, fields, members, and account access.", "/settings/organization"],
  ["Help", "Return to this guide whenever you need a refresher.", "/help"],
] as const;

type GuideState = "active" | "dismissed" | "complete";

export function FirstRunGuide({
  workspaceId,
  forceOpen = false,
  showRestart = false,
}: {
  workspaceId: string;
  forceOpen?: boolean;
  showRestart?: boolean;
}) {
  const storageKey = useMemo(() => `workflow:first-run-guide:${workspaceId}`, [workspaceId]);
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<GuideState>("active");
  const [step, setStep] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedState = window.localStorage.getItem(`${storageKey}:state`);
      const savedStep = Number(window.localStorage.getItem(`${storageKey}:step`));
      if (savedState === "dismissed" || savedState === "complete") setState(savedState);
      if (Number.isInteger(savedStep) && savedStep >= 0 && savedStep < ITEMS.length) setStep(savedStep);
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  if (!hydrated || (!forceOpen && state !== "active")) return null;

  const [label, description, href] = ITEMS[step];
  const persist = (nextStep: number, nextState: GuideState = "active") => {
    window.localStorage.setItem(`${storageKey}:step`, String(nextStep));
    window.localStorage.setItem(`${storageKey}:state`, nextState);
    setStep(nextStep);
    setState(nextState);
  };
  const dismiss = () => persist(step, "dismissed");
  const restart = () => persist(0, "active");
  const next = () => {
    if (step === ITEMS.length - 1) persist(step, "complete");
    else persist(step + 1);
  };
  const back = () => persist(Math.max(0, step - 1));

  return (
    <section aria-labelledby="first-run-guide-title" className="rounded-[var(--radius-lg)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand-strong)]">First steps</p>
          <h2 id="first-run-guide-title" className="mt-1 font-display text-[18px] font-semibold text-[var(--color-ink)]">Put your first operation in flow</h2>
          <p className="mt-1 text-[13px] text-[var(--color-ink-soft)]">A short, resumable path from records to a measurable result.</p>
        </div>
        <div className="flex items-center gap-2">
          {showRestart && <button type="button" onClick={restart} className="rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium text-[var(--color-brand)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]">Restart</button>}
          <button type="button" onClick={dismiss} className="rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]">Skip for now</button>
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between gap-3 text-[11.5px] text-[var(--color-muted)]"><span>Guide progress</span><span>{step + 1} of {ITEMS.length}</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]" aria-hidden="true"><div className="h-full rounded-full bg-[var(--color-accent)] transition-[width]" style={{ width: `${((step + 1) / ITEMS.length) * 100}%` }} /></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-medium text-[var(--color-ink)]">{label}</p><p className="mt-1 text-[12px] text-[var(--color-muted)]">{description}</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={back} disabled={step === 0} className="rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-3 py-2 text-[12px] font-semibold text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40">Back</button>
            <Link href={href} className="rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-3 py-2 text-[12px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]">Open step</Link>
            <button type="button" onClick={next} className="rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-3 py-2 text-[12px] font-semibold text-[var(--color-ink)]">{step === ITEMS.length - 1 ? "Finish" : "Next"}</button>
          </div>
        </div>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(([itemLabel, itemDescription, itemHref], index) => (
          <li key={itemLabel}>
            <Link href={itemHref} aria-current={index === step ? "step" : undefined} className={`flex h-full items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] ${index === step ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-brand)]/40" : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-[var(--color-brand)] hover:text-[var(--color-ink)]"}`} title={itemDescription}>
              <span className="font-mono-data text-[11px] text-[var(--color-brand)]">{String(index + 1).padStart(2, "0")}</span>{itemLabel}
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] text-[var(--color-muted)]">You can skip this guide and reopen it from Help at any time.</p>
    </section>
  );
}
