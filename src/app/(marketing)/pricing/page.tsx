import { Section, SectionHeading } from "@/components/marketing/Section";
import { LinkButton } from "@/components/ui/Button";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

export default function PricingPage() {
  return (
    <Section className="pt-16">
      <SectionHeading
        eyebrow="Pricing"
        title="Start free. Grow when the workload demands it."
        description="Exact limits are tuned to real infrastructure cost. Every plan includes the full operational workflow — imports, campaigns, tracking, and reporting."
      />
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLAN_ORDER.map((key) => {
          const plan = PLANS[key];
          const featured = key === "pro";
          return (
            <div
              key={key}
              className={cn(
                "flex flex-col rounded-[var(--radius-lg)] border p-7",
                featured
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white shadow-[var(--shadow-lg)]"
                  : "border-[var(--color-border)] bg-white",
              )}
            >
              {featured && (
                <span className="mb-3 inline-flex w-fit items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                  Most popular
                </span>
              )}
              <p className={cn("font-display text-[18px] font-semibold", featured ? "text-white" : "text-[var(--color-ink)]")}>
                {plan.name}
              </p>
              <p className={cn("mt-1 text-[13px]", featured ? "text-white/75" : "text-[var(--color-muted)]")}>{plan.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-[36px] font-semibold">${plan.priceMonthly}</span>
                <span className={cn("text-[13px]", featured ? "text-white/70" : "text-[var(--color-muted)]")}>/ month</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className={cn("flex items-start gap-2 text-[13px]", featured ? "text-white/90" : "text-[var(--color-ink-soft)]")}>
                    <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", featured ? "bg-white" : "bg-[var(--color-brand)]")} />
                    {f}
                  </li>
                ))}
              </ul>
              <LinkButton
                href={`/signup?plan=${key}`}
                variant={featured ? "secondary" : "outline"}
                className={cn("mt-7 w-full", featured && "!bg-white !text-[var(--color-brand)] hover:!bg-white/90")}
              >
                Get started
              </LinkButton>
            </div>
          );
        })}
      </div>
      <p className="mt-10 text-center text-[12.5px] text-[var(--color-muted)]">
        Need custom limits, dedicated infrastructure, or invoicing? <a href="/contact" className="font-medium text-[var(--color-brand)]">Talk to us</a>.
      </p>
    </Section>
  );
}
