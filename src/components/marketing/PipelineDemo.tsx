"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    key: "import",
    label: "Excel rows",
    title: "Import your spreadsheet",
    detail: "247 rows detected · 3 columns need review",
  },
  {
    key: "map",
    label: "Field mapping",
    title: "Map columns to form fields",
    detail: "Full Name → Applicant Name · Email → Email",
  },
  {
    key: "queue",
    label: "Submission queue",
    title: "Validate & queue for submission",
    detail: "241 valid · 4 duplicates · 2 need attention",
  },
  {
    key: "success",
    label: "Successful records",
    title: "Track every outcome",
    detail: "233 successful · 6 retrying · 2 human action required",
  },
  {
    key: "confirm",
    label: "Confirmation",
    title: "Confirm & notify",
    detail: "Confirmation emails delivered to 233 contacts",
  },
];

const ROWS = [
  { name: "Grace Johnson", email: "grace.j@mail.com", status: "successful" },
  { name: "Daniel Okafor", email: "d.okafor@mail.com", status: "successful" },
  { name: "Amara Chukwu", email: "amara.c@mail.com", status: "processing" },
  { name: "Femi Adeyemi", email: "femi.a@mail.com", status: "queued" },
  { name: "Sarah Bello", email: "sarah.b@mail.com", status: "human" },
];

const STATUS_DOT: Record<string, string> = {
  successful: "bg-emerald-500",
  processing: "bg-blue-500",
  queued: "bg-slate-300",
  human: "bg-amber-500",
};

const STATUS_LABEL: Record<string, string> = {
  successful: "Successful",
  processing: "Processing",
  queued: "Queued",
  human: "Human action required",
};

export function PipelineDemo() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const id = setInterval(() => setActive((v) => (v + 1) % STEPS.length), 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-lg)] sm:p-4">
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border)] pb-3">
        {STEPS.map((step, i) => (
          <button
            key={step.key}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={cn(
              "flex-1 min-w-[120px] rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors",
              i === active ? "bg-[var(--color-brand-soft)]" : "hover:bg-[var(--color-canvas)]",
            )}
          >
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wide",
                i === active ? "text-[var(--color-brand)]" : "text-[var(--color-muted)]",
              )}
            >
              0{i + 1}
            </p>
            <p className={cn("text-[12.5px] font-medium", i === active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]")}>
              {step.label}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-display text-[16px] font-semibold text-[var(--color-ink)]">{STEPS[active].title}</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">{STEPS[active].detail}</p>

          <div className="mt-4 space-y-2">
            {ROWS.map((row, i) => (
              <div
                key={row.email}
                className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2.5"
                style={{ opacity: active >= 2 || i < 2 ? 1 : 0.55 }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-canvas)] text-[11px] font-semibold text-[var(--color-ink-soft)]">
                    {row.name.split(" ").map((p) => p[0]).join("")}
                  </span>
                  <div>
                    <p className="text-[12.5px] font-medium text-[var(--color-ink)]">{row.name}</p>
                    <p className="text-[11.5px] text-[var(--color-muted)]">{row.email}</p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--color-ink-soft)]">
                  <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[active >= 3 ? row.status : "queued"])} />
                  {active >= 3 ? STATUS_LABEL[row.status] : "Queued"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Live campaign stats</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metric label="Total" value="247" />
            <Metric label="Queued" value={active < 2 ? "247" : "12"} />
            <Metric label="Successful" value={active >= 3 ? "233" : "0"} tone="success" />
            <Metric label="Needs attention" value={active >= 3 ? "8" : "0"} tone="warning" />
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-700"
              style={{ width: `${((active + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-[11.5px] text-[var(--color-muted)]">Step {active + 1} of {STEPS.length}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] px-3 py-2.5">
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p
        className={cn(
          "font-mono-data text-[18px] font-semibold",
          tone === "success" && "text-[var(--color-success)]",
          tone === "warning" && "text-[var(--color-warning)]",
          !tone && "text-[var(--color-ink)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}
