import { Section, SectionHeading } from "@/components/marketing/Section";
import { LinkButton } from "@/components/ui/Button";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { canonicalPlanKey, type SelectablePlanKey } from "@/lib/plans";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { hasMarketingSession } from "@/lib/marketingAuth";
import { NGN_PRICES } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { PlanCard } from "@/components/pricing/PlanCard";

export default async function PricingPage() {
  const user = (await hasMarketingSession()) ? await getCurrentUser().catch(() => null) : null;
  const currentOrg = user ? await getCurrentOrg(user).catch(() => null) : null;
  const currentPlan = currentOrg ? canonicalPlanKey(currentOrg.planKey) : null;

  function ctaFor(key: SelectablePlanKey) {
    if (!user) return { label: "Get started", href: `/signup?plan=${key}`, disabled: false };
    if (!currentPlan) return { label: "Continue setup", href: `/onboarding?step=workspace&plan=${key}`, disabled: false };
    if (currentPlan === key) return { label: "Current plan", href: "/settings/usage", disabled: false };
    if (key === "free" || (currentPlan === "pro" && key === "pro") || (currentPlan === "plus" && key === "pro")) return { label: "Included", href: "/settings/usage", disabled: true };
    return { label: `Upgrade to ${PLANS[key].name}`, href: `/pricing?requestedPlan=${key}`, disabled: false };
  }

  return (
    <Section className="pt-16">
      <SectionHeading
        eyebrow="Pricing"
        title="Start free. Grow when the workload demands it."
        description="Exact limits are tuned to real infrastructure cost. Every plan includes the full operational workflow — imports, campaigns, tracking, and reporting."
      />
      <div className="mt-12 grid gap-6 lg:grid-cols-3">{PLAN_ORDER.map((key) => <PlanCard key={key} planKey={key} action={<LinkButton href={ctaFor(key).href} variant={key === "pro" ? "secondary" : "outline"} className={cn("w-full", ctaFor(key).disabled && "pointer-events-none opacity-60", key === "pro" && "!bg-white !text-[var(--color-brand)] hover:!bg-white/90")}>{ctaFor(key).label}</LinkButton>} />)}</div>
      <p className="mt-10 text-center text-[12.5px] text-[var(--color-muted)]">
        {Object.values(NGN_PRICES).some((price) => price === null) ? "NGN launch prices will be published once approved. " : ""}Need custom limits, dedicated infrastructure, or invoicing? <a href="/contact" className="font-medium text-[var(--color-brand)]">Talk to us</a>.
      </p>
    </Section>
  );
}
