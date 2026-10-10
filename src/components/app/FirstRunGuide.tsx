"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { FlowArrow } from "@/components/ui/FlowIcon";

const ITEMS = [
  ["Add or import contacts", "/contacts/new"],
  ["Create your first campaign", "/campaigns/new"],
  ["Analyze or connect a form", "/campaigns/new?analyze=1"],
  ["Send or test communication", "/communications"],
  ["Review your reports", "/reports"],
] as const;

export function FirstRunGuide({ workspaceId }: { workspaceId: string }) {
  const key = `workflow:first-run-guide:${workspaceId}`;
  const subscribe = (onChange: () => void) => {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  };
  const dismissed = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key) === "dismissed",
    () => true,
  );

  if (dismissed) return null;

  return (
    <section aria-labelledby="first-run-guide-title" className="rounded-[var(--radius-lg)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand-strong)]">First steps</p>
          <h2 id="first-run-guide-title" className="mt-1 font-display text-[18px] font-semibold text-[var(--color-ink)]">Put your first operation in flow</h2>
          <p className="mt-1 text-[13px] text-[var(--color-ink-soft)]">A short path from records to a measurable result.</p>
        </div>
        <button type="button" onClick={() => { window.localStorage.setItem(key, "dismissed"); window.dispatchEvent(new StorageEvent("storage", { key })); }} className="rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]">Dismiss</button>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {ITEMS.map(([label, href], index) => <li key={href}><Link href={href} className="flex h-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[12.5px] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"><span className="font-mono-data text-[11px] text-[var(--color-brand)]">0{index + 1}</span>{label}<FlowArrow className="ml-auto shrink-0" /></Link></li>)}
      </ol>
      <p className="mt-3 text-[11.5px] text-[var(--color-muted)]">What is this? Workflow connects every step so your team can see what happened and what needs attention.</p>
    </section>
  );
}
