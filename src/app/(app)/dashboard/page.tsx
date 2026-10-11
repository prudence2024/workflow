import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser, getUserOrganizations } from "@/lib/auth";
// Reads run as the restricted `workflow_app` role with a database-verified
// tenant context — never through the owner connection.
import { getDashboardSummary, getUsageCounters } from "@/lib/data";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Surfaces";
import { Stat } from "@/components/ui/Data";
import { StatusPill } from "@/components/ui/Status";
import { LinkButton } from "@/components/ui/Button";
import { formatDateTime, pct, timeAgo } from "@/lib/utils";
import { canonicalPlanKey, PLANS } from "@/lib/plans";
import { FirstRunGuide } from "@/components/app/FirstRunGuide";
import { WeeklySurvey } from "./WeeklySurvey";
import { getWeeklySurveyState } from "@/lib/surveys";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgs = await getUserOrganizations(user);
  if (orgs.length === 0) redirect("/onboarding");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const survey = await getWeeklySurveyState({ user, org });

  const summary = await getDashboardSummary({ user, org });
  const contactCount = { count: summary.contacts };
  const activeCampaignCount = { count: summary.activeCampaigns };
  const submissionsThisMonth = { count: summary.attemptsThisMonth };
  const successfulThisMonth = { count: summary.successfulThisMonth };
  const currentCampaigns = summary.campaigns;
  const recentImports = summary.recentImports;
  const failedRecords = summary.attentionRecords;
  const recentActivity = summary.activity;

  const successRate = pct(successfulThisMonth.count, submissionsThisMonth.count || 1);

  const usage = await getUsageCounters({ user, org });
  const plan = PLANS[canonicalPlanKey(org.planKey)];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Dashboard</h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">
            Operational overview for <span className="font-medium text-[var(--color-ink-soft)]">{org.orgName}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/campaigns/new" size="sm" variant="outline">
            New campaign
          </LinkButton>
          <LinkButton href="/imports/new" size="sm" variant="outline">
            Import records
          </LinkButton>
          <LinkButton href="/contacts/new" size="sm" variant="outline">
            Add contact
          </LinkButton>
          <LinkButton href="/form-operations" size="sm">
            Test a form
          </LinkButton>
        </div>
      </div>

      {contactCount.count === 0 && currentCampaigns.length === 0 && recentImports.length === 0 && recentActivity.length === 0 && (
        <FirstRunGuide workspaceId={org.orgId} />
      )}
      {survey.due && <WeeklySurvey message={params.survey === "error" ? "We couldn't save that feedback. Please try again." : undefined} />}
      {params.survey === "thanks" && <p role="status" className="rounded-[var(--radius-sm)] bg-[var(--color-success-soft)] px-4 py-3 text-[13px] text-[var(--color-success)]">Thanks for helping improve Workflow.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total contacts" value={contactCount.count.toLocaleString()} hint={`Limit ${plan.limits.contacts.toLocaleString()}`} />
        <Stat label="Active campaigns" value={activeCampaignCount.count} hint={`Limit ${plan.limits.activeCampaigns}`} />
        <Stat label="Submissions this month" value={submissionsThisMonth.count} hint={`Limit ${plan.limits.submissionsPerMonth.toLocaleString()}`} />
        <Stat label="Success rate" value={`${successRate}%`} hint="This month" trend={{ direction: successRate >= 80 ? "up" : successRate >= 50 ? "flat" : "down", label: "of processed" }} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Current campaigns" description="Campaigns currently ready, running, or paused" action={<Link href="/campaigns" className="text-[12.5px] font-medium text-[var(--color-brand)]">View all →</Link>} />
          <CardBody className="p-0">
            {currentCampaigns.length === 0 ? (
              <EmptyState
                title="No active campaigns yet"
                description="Create a campaign to start importing and submitting records."
                action={<LinkButton href="/campaigns/new" size="sm">New campaign</LinkButton>}
              />
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {currentCampaigns.map((c) => {
                  const stats = (c.stats as Record<string, number>) ?? {};
                  const total = stats.total ?? 0;
                  const done = (stats.successful ?? 0) + (stats.failed ?? 0) + (stats.skipped ?? 0);
                  return (
                    <Link key={c.id} href={`/campaigns/${c.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[var(--color-canvas)]/60">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-[var(--color-ink)]">{c.name}</p>
                        <p className="text-[12px] text-[var(--color-muted)]">
                          {done}/{total} processed
                        </p>
                      </div>
                      <StatusPill status={c.status} />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Jobs requiring attention" description="Failed or blocked submissions" />
          <CardBody className="p-0">
            {failedRecords.length === 0 ? (
              <EmptyState title="Nothing needs attention" description="All recent submissions are healthy." />
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {failedRecords.map((r) => (
                  <Link key={r.id} href={`/campaigns/${r.campaignId}`} className="block px-5 py-3.5 hover:bg-[var(--color-canvas)]/60">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">{r.campaignName}</p>
                      <StatusPill status={r.status} />
                    </div>
                    <p className="mt-1 truncate text-[12px] text-[var(--color-muted)]">{r.resultMessage ?? "—"}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" description="Latest events across your workspace" />
          <CardBody className="p-0">
            {recentActivity.length === 0 ? (
              <EmptyState title="No activity yet" description="Activity from imports, campaigns, and messages will appear here." />
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {recentActivity.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <p className="truncate text-[13px] text-[var(--color-ink-soft)]">{a.message}</p>
                    <span className="shrink-0 text-[11.5px] text-[var(--color-muted)]">{timeAgo(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent imports" action={<Link href="/imports" className="text-[12.5px] font-medium text-[var(--color-brand)]">View all →</Link>} />
          <CardBody className="p-0">
            {recentImports.length === 0 ? (
              <EmptyState title="No imports yet" action={<LinkButton href="/imports/new" size="sm">Import records</LinkButton>} />
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {recentImports.map((imp) => (
                  <Link key={imp.id} href={`/imports/${imp.id}`} className="block px-5 py-3 hover:bg-[var(--color-canvas)]/60">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">{imp.fileName}</p>
                      <StatusPill status={imp.status} />
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-[var(--color-muted)]">{formatDateTime(imp.createdAt)}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Usage this month" description={`${plan.name} plan limits`} action={<Link href="/settings/usage" className="text-[12.5px] font-medium text-[var(--color-brand)]">Manage plan →</Link>} />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UsageMeter label="Contacts" used={contactCount.count} limit={plan.limits.contacts} />
          <UsageMeter label="Submissions" used={usage.submissions ?? 0} limit={plan.limits.submissionsPerMonth} />
          <UsageMeter label="Imports" used={usage.imports ?? 0} limit={200} />
          <UsageMeter label="Emails sent" used={usage.emails ?? 0} limit={500} />
        </CardBody>
      </Card>
    </div>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percentage = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-medium text-[var(--color-ink-soft)]">{label}</span>
        <span className="font-mono-data text-[var(--color-muted)]">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
        <div
          className="h-full rounded-full bg-[var(--color-brand)]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
