import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";
import { LinkButton } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

const GUIDE = [
  ["Dashboard", "See activity, current campaigns, attention items, and plan usage.", "/dashboard"],
  ["Records", "Import contacts, maintain details, tags, notes, and history.", "/contacts"],
  ["Forms", "Analyze authorized forms, map fields, and track submissions.", "/form-operations"],
  ["Campaigns", "Move a cohort through validation, queueing, and reporting.", "/campaigns"],
  ["Communications", "Queue consent-aware email and SMS through the durable outbox.", "/communications"],
  ["Downloads", "Install the PWA and access workspace files.", "/downloads"],
  ["Reports", "Review truthful operational outcomes and follow-up.", "/reports"],
  ["Billing", "Review plan, usage, verified payments, and receipts.", "/settings/usage"],
] as const;

export default async function HelpPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  return <div className="mx-auto max-w-4xl space-y-6">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand)]">New user guide</p>
      <h1 className="mt-1 font-display text-[24px] font-semibold text-[var(--color-ink)]">Put your first operation in flow</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] text-[var(--color-muted)]">Start with contacts, connect a form, create a campaign, send a test, and review the result.</p>
    </div>
    <Card><CardHeader title="Workflow at a glance" description="You can return to this guide any time from Help and guide." /><CardBody className="grid gap-3 sm:grid-cols-2">
      {GUIDE.map(([title, description, href], index) => <Link key={title} href={href} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-4 transition hover:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"><span className="font-mono-data text-[11px] text-[var(--color-brand)]">0{index + 1}</span><p className="mt-2 font-medium text-[var(--color-ink)]">{title}</p><p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-muted)]">{description}</p></Link>)}
    </CardBody></Card>
    <Card><CardHeader title="Recommended first action" /><CardBody className="flex flex-wrap items-center justify-between gap-4"><p className="max-w-xl text-[13px] text-[var(--color-muted)]">Import a small list of contacts, review the mapped fields, then create a campaign and send a controlled test.</p><LinkButton href="/imports/new" size="sm">Import contacts</LinkButton></CardBody></Card>
  </div>;
}
