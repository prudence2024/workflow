import type { ReactNode } from "react";
import { PLANS, type SelectablePlanKey } from "@/lib/plans";
import { formatNgnPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export function PlanCard({ planKey, action, featured = planKey === "pro" }: { planKey: SelectablePlanKey; action: ReactNode; featured?: boolean }) {
  const plan = PLANS[planKey];
  return <div className={cn("flex h-full min-w-0 flex-col rounded-[var(--radius-lg)] border p-4 sm:p-6", featured ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white shadow-[var(--shadow-lg)]" : "border-[var(--color-border)] bg-[var(--color-surface)]")}>
    {featured && <span className="mb-3 inline-flex w-fit items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">Most popular</span>}
    <p className={cn("font-display text-[18px] font-semibold", featured ? "text-white" : "text-[var(--color-ink)]")}>{plan.name}</p>
    <p className={cn("mt-1 text-[13px]", featured ? "text-white/75" : "text-[var(--color-muted)]")}>{plan.tagline}</p>
    <div className="mt-4 flex min-w-0 items-baseline gap-x-1"><span className="shrink-0 whitespace-nowrap font-display text-[clamp(1.55rem,2.2vw,2.5rem)] font-semibold leading-none tracking-tight">{formatNgnPrice(planKey)}</span><span className={cn("shrink-0 whitespace-nowrap text-[13px]", featured ? "text-white/70" : "text-[var(--color-muted)]")}>/ month</span></div>
    <div className={cn("mt-4 text-[12px] font-medium", featured ? "text-white/80" : "text-[var(--color-muted)]")}>Includes {plan.limits.contacts.toLocaleString()} contacts · {plan.limits.users} user{plan.limits.users === 1 ? "" : "s"}</div>
    <ul className="mt-5 flex-1 space-y-2">{plan.features.slice(0, 6).map((feature) => <li key={feature} className={cn("flex items-start gap-2 text-[12.5px]", featured ? "text-white/90" : "text-[var(--color-ink-soft)]")}><span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", featured ? "bg-white" : "bg-[var(--color-brand)]")} />{feature}</li>)}</ul>
    <div className="mt-6">{action}</div>
  </div>;
}
