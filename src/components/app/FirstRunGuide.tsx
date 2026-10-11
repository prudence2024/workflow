"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlowArrow } from "@/components/ui/FlowIcon";

const ITEMS = [
  ["Dashboard overview", "/dashboard"],
  ["Add or import contacts", "/contacts/new"],
  ["Create a form", "/form-operations"],
  ["Create your first campaign", "/campaigns/new"],
  ["Run an automation", "/form-operations"],
  ["Send or test communication", "/communications"],
  ["Review your reports", "/reports"],
] as const;

export function FirstRunGuide({ workspaceId }: { workspaceId: string }) {
  const key = `workflow:first-run-guide:${workspaceId}`;
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem(key);
    setDismissed(saved === "dismissed");
    const savedStep = Number(window.localStorage.getItem(`${key}:step`));
    if (Number.isInteger(savedStep) && savedStep >= 0 && savedStep < ITEMS.length) setStep(savedStep);
  }, [key]);

  if (dismissed) return null;

  const [label, href] = ITEMS[step];
  const dismiss = () => {
    window.localStorage.setItem(key, "dismissed");
    setDismissed(true);
  };
  const advance = () => {
    const next = Math.min(step + 1, ITEMS.length - 1);
    window.localStorage.setItem(`${key}:step`, String(next));
    setStep(next);
  };

  return (
    <section aria-labelledby="first-run-guide-title" className="rounded-[var(--radius-lg)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand-strong)]">First steps</p>
          <h2 id="first-run-guide-title" className="mt-1 font-display text-[18px] font-semibold text-[var(--color-ink)]">Put your first operation in flow</h2>
          <p className="mt-1 text-[13px] text-[var(--color-ink-soft)]">A short path from records to a measurable result.</p>
        </div>
        <button type="button" onClick={dismiss} className="rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]">Dismiss</button>
      </div>
      <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between gap-3 text-[11.5px] text-[var(--color-muted)]"><span>Guide progress</span><span>{step + 1} of {ITEMS.length}</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]"><div className="h-full rounded-full bg-[var(--color-accent)] transition-[width]" style={{ width: `${((step + 1) / ITEMS.length) * 100}%` }} /></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-[var(--color-ink)]">{label}</p><p className="mt-1 text-[12px] text-[var(--color-muted)]">Complete this step, then come back here to resume.</p></div><div className="flex gap-2"><Link href={href} className="rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-3 py-2 text-[12px] font-semibold text-white">Open step</Link>{step < ITEMS.length - 1 && <button type="button" onClick={advance} className="rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-3 py-2 text-[12px] font-semibold text-[var(--color-ink)]">Mark next</button>}</div></div>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(([label, href], index) => <li key={href}><Link href={href} className="flex h-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[12.5px] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"><span className="font-mono-data text-[11px] text-[var(--color-brand)]">0{index + 1}</span>{label}<FlowArrow className="ml-auto shrink-0" /></Link></li>)}
      </ol>
      <p className="mt-3 text-[11.5px] text-[var(--color-muted)]">What is this? Workflow connects every step so your team can see what happened and what needs attention.</p>
    </section>
  );
}
