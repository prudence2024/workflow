"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { FlowCheck } from "@/components/ui/FlowIcon";

const STEPS = [
  ["Reading form fields", "12 fields detected"],
  ["Suggesting mappings", "3 suggestions ready"],
  ["Checking campaign conflicts", "No conflicts found"],
  ["Preparing campaign proposal", "Ready for review"],
] as const;

export function AiDemo() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const advance = () => setActive((value) => (value + 1) % STEPS.length);
    const id = window.setInterval(advance, 2800);
    const onVisibilityChange = () => {
      if (document.hidden) return;
      setActive((value) => value % STEPS.length);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-5 shadow-[var(--shadow-sm)]" aria-label="Illustrative Workflow AI product demo">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="font-display text-[14px] font-semibold text-[var(--color-ink)]">AI agent working</p>
          <p className="text-[11.5px] text-[var(--color-muted)]">Illustrative preview · review stays with you</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2 py-1 text-[10.5px] font-semibold text-[var(--color-accent-strong)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" /> PREVIEW
        </span>
      </div>
      <ol className="mt-5 space-y-3" aria-live="polite">
        {STEPS.map(([label, detail], index) => {
          const complete = index < active;
          const current = index === active;
          return (
            <li key={label} className={cn("flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors", current && "bg-[var(--color-brand-soft)]")}>
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", complete && "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]", current && "border-[var(--color-brand)] bg-[var(--color-brand)] text-white", !complete && !current && "border-[var(--color-border-strong)] text-[var(--color-muted)]")}>
                {complete ? <FlowCheck /> : `0${index + 1}`}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[12.5px] font-medium", current ? "text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]")}>{label}</span>
                <span className="block text-[11.5px] text-[var(--color-muted)]">{detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4 text-[11.5px] text-[var(--color-muted)]">
        <span>Nothing runs without confirmation</span>
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-border)]"><span className="block h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-700" style={{ width: `${((active + 1) / STEPS.length) * 100}%` }} /></span>
      </div>
    </div>
  );
}
