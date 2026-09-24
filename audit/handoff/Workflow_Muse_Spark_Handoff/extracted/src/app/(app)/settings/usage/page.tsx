import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { getUsageForOrg } from "@/lib/usage";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";
import { SettingsTabs } from "@/components/app/SettingsTabs";
import { LinkButton } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user.id);
  if (!org) redirect("/onboarding");

  const usage = await getUsageForOrg(org.orgId);
  const plan = PLANS[org.planKey as keyof typeof PLANS] ?? PLANS.free;

  const metrics = [
    { key: "contacts", label: "Contacts", limit: plan.limits.contacts },
    { key: "submissions", label: "Submissions", limit: plan.limits.submissionsPerMonth },
    { key: "imports", label: "Imports", limit: 200 },
    { key: "emails", label: "Emails sent", limit: 500 },
    { key: "form_analyses", label: "Form analyses", limit: 100 },
    { key: "reports", label: "Reports generated", limit: 100 },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Settings</h1>
        <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">Usage and plan</p>
      </div>
      <SettingsTabs />

      <Card>
        <CardHeader title="Current plan" description={`${plan.name} — $${plan.priceMonthly}/month`} action={<LinkButton href="/pricing" size="sm" variant="outline">Compare plans</LinkButton>} />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((m) => {
            const used = usage[m.key] ?? 0;
            const percentage = Math.min(100, Math.round((used / m.limit) * 100));
            return (
              <div key={m.key} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-4">
                <p className="text-[12.5px] font-medium text-[var(--color-ink-soft)]">{m.label}</p>
                <p className="mt-1 font-mono-data text-[20px] font-semibold text-[var(--color-ink)]">
                  {used.toLocaleString()} <span className="text-[13px] font-normal text-[var(--color-muted)]">/ {m.limit.toLocaleString()}</span>
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div className={cn("h-full rounded-full", percentage > 90 ? "bg-[var(--color-danger)]" : "bg-[var(--color-brand)]")} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Plans" description="Upgrade anytime — this preview manages plan tags without live billing." />
        <CardBody className="grid gap-4 md:grid-cols-3">
          {PLAN_ORDER.map((key) => {
            const p = PLANS[key];
            const isCurrent = key === org.planKey;
            return (
              <div key={key} className={cn("rounded-[var(--radius-sm)] border p-4", isCurrent ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]" : "border-[var(--color-border)]")}>
                <p className="font-display text-[14.5px] font-semibold text-[var(--color-ink)]">{p.name}</p>
                <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">${p.priceMonthly}/mo</p>
                {isCurrent && <p className="mt-2 text-[11.5px] font-semibold text-[var(--color-brand)]">Current plan</p>}
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
