"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/Reveal";

const STAGES = [
  ["01", "Import", "Bring in the records your operation already has."],
  ["02", "Organize", "Keep every person, field, and cohort in context."],
  ["03", "Validate", "Catch missing data and duplicates before work moves."],
  ["04", "Automate", "Run authorized workflows through durable workers."],
  ["05", "Communicate", "Send relevant email and SMS at the right moment."],
  ["06", "Track", "See truthful status, evidence, and next actions."],
  ["07", "Report", "Turn completed work into a clear operational picture."],
] as const;

export function WorkflowProcess() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;
    const id = window.setInterval(() => setActive((value) => (value + 1) % STAGES.length), 2800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mt-10 grid gap-3 md:grid-cols-7">
      {STAGES.map(([number, title, body], index) => (
        <Reveal key={number} delay={index * 45} className="h-full">
          <button
            type="button"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
            className={cn(
              "flex h-full w-full flex-col rounded-[var(--radius-md)] border p-4 text-left transition-all duration-200",
              active === index
                ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] shadow-[var(--shadow-sm)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)]",
            )}
          >
            <span className="font-mono-data text-[11px] font-semibold text-[var(--color-brand)]">{number}</span>
            <span className="mt-3 font-display text-[14px] font-semibold text-[var(--color-ink)]">{title}</span>
            <span className="mt-2 text-[12px] leading-relaxed text-[var(--color-muted)]">{body}</span>
          </button>
        </Reveal>
      ))}
    </div>
  );
}
