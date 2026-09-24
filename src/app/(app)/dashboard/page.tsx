import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { activityEvents, campaignRecords, campaigns, contacts, imports } from "@/db/schema";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Surfaces";
import { Stat } from "@/components/ui/Data";
import { StatusPill } from "@/components/ui/Status";
import { LinkButton } from "@/components/ui/Button";
import { formatDateTime, pct, timeAgo } from "@/lib/utils";
import { PLANS } from "@/lib/plans";
import { getUsageForOrg } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [[contactCount], [activeCampaignCount], [submissionsThisMonth], [successfulThisMonth]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(and(eq(contacts.orgId, org.orgId), sql`${contacts.archivedAt} is null`)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(and(eq(campaigns.orgId, org.orgId), eq(campaigns.status, "running"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignRecords)
      .where(and(eq(campaignRecords.orgId, org.orgId), gte(campaignRecords.createdAt, startOfMonth), ne(campaignRecords.status, "queued"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignRecords)
      .where(
        and(
          eq(campaignRecords.orgId, org.orgId),
          gte(campaignRecords.createdAt, startOfMonth),
          eq(campaignRecords.status, "successful"),
        ),
      ),
  ]);

  const successRate = pct(successfulThisMonth.count, submissionsThisMonth.count || 1);

  const currentCampaigns = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.orgId, org.orgId), sql`${campaigns.status} in ('running','ready','paused')`))
    .orderBy(desc(campaigns.updatedAt))
    .limit(5);

  const recentImports = await db
    .select()
    .from(imports)
    .where(eq(imports.orgId, org.orgId))
    .orderBy(desc(imports.createdAt))
    .limit(5);

  const failedRecords = await db
    .select({
      id: campaignRecords.id,
      campaignId: campaignRecords.campaignId,
      resultMessage: campaignRecords.resultMessage,
      failureCategory: campaignRecords.failureCategory,
      status: campaignRecords.status,
      updatedAt: campaignRecords.updatedAt,
      campaignName: campaigns.name,
    })
    .from(campaignRecords)
    .innerJoin(campaigns, eq(campaignRecords.campaignId, campaigns.id))
    .where(and(eq(campaignRecords.orgId, org.orgId), sql`${campaignRecords.status} in ('failed','human_action_required')`))
    .orderBy(desc(campaignRecords.updatedAt))
    .limit(6);

  const recentActivity = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.orgId, org.orgId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(8);

  const usage = await getUsageForOrg(org.orgId);
  const plan = PLANS[org.planKey as keyof typeof PLANS] ?? PLANS.free;

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
          <LinkButton href="/campaigns/new?analyze=1" size="sm">
            Analyze form
          </LinkButton>
        </div>
      </div>

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
                    <p className="mt-1 truncate text-[12px] text-[var(--color-muted)]">{r.resultMessage ?? r.failureCategory ?? "—"}</p>
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
