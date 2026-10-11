import { redirect } from "next/navigation";
import { desc, ilike, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { auditPlatformAdminAttempt, requireWorkflowAdminOwner } from "@/lib/authorization";
// Intentionally privileged: this operator console is the ONE customer-app route
// that reads across tenants. Access is gated by the exact server-side Clerk
// owner identity in addition to the normal authenticated app shell.
import { db } from "@/db";
import { auditLogs, campaigns, contacts, organizationMembers, organizations, outboxEvents, productSurveys } from "@/db/schema";
import { Card, CardBody, CardHeader, Alert } from "@/components/ui/Surfaces";
import { Stat, TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { StatusPill } from "@/components/ui/Status";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ workspace?: string; campaign?: string }>;

export default async function PlatformAdminPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) {
    await auditPlatformAdminAttempt(null, "denied", "unauthenticated");
    redirect("/login");
  }
  try {
    await requireWorkflowAdminOwner({
      clerkUserId: user.clerkUserId,
      email: user.email,
      emailVerified: user.emailVerified,
      userId: user.id,
    });
  } catch {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const workspaceSearch = params?.workspace?.trim().slice(0, 80) ?? "";
  const campaignSearch = params?.campaign?.trim().slice(0, 80) ?? "";
  const [metrics, planRows, campaignStatusRows, orgRows, campaignRows, queueRows, errorRows, surveyRows] = await Promise.all([
    db.execute<{
      org_count: number;
      user_count: number;
      active_user_count: number;
      campaign_count: number;
      contact_count: number;
      failed_jobs: number;
      email_count: number;
      sms_count: number;
      verified_payment_count: number;
      verified_revenue: number;
    }>(sql`
      select
        (select count(*)::int from public.organizations) as org_count,
        (select count(*)::int from public.users) as user_count,
        (select count(distinct user_id)::int from public.organization_members where status = 'active') as active_user_count,
        (select count(*)::int from public.campaigns) as campaign_count,
        (select count(*)::int from public.contacts) as contact_count,
        (select count(*)::int from public.campaign_records where status in ('failed','human_action_required')) as failed_jobs,
        (select count(*)::int from public.messages where channel = 'email') as email_count,
        (select count(*)::int from public.messages where channel = 'sms') as sms_count,
        (select count(*)::int from public.payments where status = 'verified') as verified_payment_count,
        (select coalesce(sum(amount), 0)::bigint from public.payments where status = 'verified') as verified_revenue
    `),
    db.execute<{ plan: string; count: number }>(sql`select plan_key as plan, count(*)::int as count from public.organizations group by plan_key order by plan_key`),
    db.execute<{ status: string; count: number }>(sql`select status, count(*)::int as count from public.campaigns group by status order by status`),
    db.select({
      id: organizations.id,
      name: organizations.name,
      planKey: organizations.planKey,
      createdAt: organizations.createdAt,
      memberCount: sql<number>`(select count(*)::int from ${organizationMembers} where ${organizationMembers.orgId} = ${organizations.id})`,
      contactCount: sql<number>`(select count(*)::int from ${contacts} where ${contacts.orgId} = ${organizations.id})`,
      campaignCount: sql<number>`(select count(*)::int from ${campaigns} where ${campaigns.orgId} = ${organizations.id})`,
    }).from(organizations).where(workspaceSearch ? ilike(organizations.name, `%${workspaceSearch}%`) : undefined).orderBy(desc(organizations.createdAt)).limit(50),
    db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, orgId: campaigns.orgId, updatedAt: campaigns.updatedAt })
      .from(campaigns).where(campaignSearch ? ilike(campaigns.name, `%${campaignSearch}%`) : undefined).orderBy(desc(campaigns.updatedAt)).limit(25),
    db.select({ eventType: outboxEvents.eventType, provider: outboxEvents.provider, status: outboxEvents.status, createdAt: outboxEvents.createdAt })
      .from(outboxEvents).where(sql`${outboxEvents.status} in ('failed','exhausted','ambiguous')`).orderBy(desc(outboxEvents.createdAt)).limit(12),
    db.select({ action: auditLogs.action, entityType: auditLogs.entityType, createdAt: auditLogs.createdAt })
      .from(auditLogs).where(ilike(auditLogs.action, "%error%")).orderBy(desc(auditLogs.createdAt)).limit(12),
    db.select({ id: productSurveys.id, orgId: productSurveys.orgId, status: productSurveys.status, featureUsed: productSurveys.featureUsed, satisfaction: productSurveys.satisfaction, requestedFeature: productSurveys.requestedFeature, createdAt: productSurveys.createdAt })
      .from(productSurveys).orderBy(desc(productSurveys.createdAt)).limit(25),
  ]);

  const metric = metrics.rows[0] ?? { org_count: 0, user_count: 0, active_user_count: 0, campaign_count: 0, contact_count: 0, failed_jobs: 0, email_count: 0, sms_count: 0, verified_payment_count: 0, verified_revenue: 0 };
  const providerStatus = [
    ["Resend", Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)],
    ["Termii", Boolean(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID)],
    ["Paystack", Boolean(process.env.PAYSTACK_SECRET_KEY)],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-5 py-3">
        <p className="text-[13px] font-semibold text-[var(--color-warning)]">Platform Administration</p>
        <p className="text-[12.5px] text-[var(--color-warning)]/80">Owner-only operational view. Counts are aggregate; provider secrets and raw payloads are never displayed.</p>
      </div>

      <Card><CardBody>
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-[12px] font-medium text-[var(--color-ink)]">Workspace search<input name="workspace" defaultValue={workspaceSearch} placeholder="Name contains…" className="mt-1 block h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[13px]" /></label>
          <label className="text-[12px] font-medium text-[var(--color-ink)]">Campaign search<input name="campaign" defaultValue={campaignSearch} placeholder="Name contains…" className="mt-1 block h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[13px]" /></label>
          <button type="submit" className="h-9 rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-4 text-[12px] font-semibold text-white">Filter</button>
        </form>
      </CardBody></Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Organizations" value={metric.org_count} /><Stat label="Users" value={metric.user_count} /><Stat label="Active members" value={metric.active_user_count} /><Stat label="Contacts" value={metric.contact_count} />
        <Stat label="Campaigns" value={metric.campaign_count} /><Stat label="Jobs needing attention" value={metric.failed_jobs} /><Stat label="Email messages" value={metric.email_count} /><Stat label="SMS messages" value={metric.sms_count} />
        <Stat label="Verified payments" value={metric.verified_payment_count} /><Stat label="Verified revenue (minor units)" value={metric.verified_revenue} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card><CardHeader title="Plan distribution" /><CardBody className="space-y-2">{planRows.rows.map((row) => <div key={row.plan} className="flex justify-between text-[13px]"><span className="capitalize">{row.plan}</span><span className="font-mono-data">{row.count}</span></div>)}</CardBody></Card>
        <Card><CardHeader title="Campaign status" /><CardBody className="space-y-2">{campaignStatusRows.rows.map((row) => <div key={row.status} className="flex justify-between text-[13px]"><span className="capitalize">{row.status}</span><span className="font-mono-data">{row.count}</span></div>)}</CardBody></Card>
        <Card><CardHeader title="Provider readiness" description="Configuration presence only" /><CardBody className="space-y-2">{providerStatus.map(([name, ready]) => <div key={name} className="flex items-center justify-between text-[13px]"><span>{name}</span><StatusPill status={ready ? "active" : "pending"} /></div>)}</CardBody></Card>
      </div>

      <Card><CardHeader title="Organizations" description="Most recently created workspaces" /><CardBody className="p-0"><Table><THead><TH>Organization</TH><TH>Plan</TH><TH>Members</TH><TH>Contacts</TH><TH>Campaigns</TH><TH>Created</TH></THead><tbody>{orgRows.map((o) => <TR key={o.id}><TD className="font-medium text-[var(--color-ink)]">{o.name}</TD><TD><StatusPill status={o.planKey === "free" ? "draft" : "active"} /></TD><TD className="font-mono-data">{o.memberCount}</TD><TD className="font-mono-data">{o.contactCount}</TD><TD className="font-mono-data">{o.campaignCount}</TD><TD className="text-[var(--color-muted)]">{formatDate(o.createdAt)}</TD></TR>)}</tbody></Table></CardBody></Card>

      <Card><CardHeader title="Campaign queue" description="Only failed or ambiguous provider work is surfaced here." /><CardBody className="p-0">{queueRows.length === 0 ? <p className="p-5 text-[13px] text-[var(--color-muted)]">No queue failures.</p> : <Table><THead><TH>Event</TH><TH>Provider</TH><TH>Status</TH><TH>Created</TH></THead><tbody>{queueRows.map((row, index) => <TR key={`${row.eventType}-${row.createdAt.toISOString()}-${index}`}><TD>{row.eventType}</TD><TD>{row.provider}</TD><TD><StatusPill status={row.status} /></TD><TD>{formatDate(row.createdAt)}</TD></TR>)}</tbody></Table>}</CardBody></Card>

      {campaignSearch && <Card><CardHeader title={`Campaigns matching “${campaignSearch}”`} /><CardBody className="p-0"><Table><THead><TH>Name</TH><TH>Status</TH><TH>Workspace</TH><TH>Updated</TH></THead><tbody>{campaignRows.map((row) => <TR key={row.id}><TD>{row.name}</TD><TD><StatusPill status={row.status} /></TD><TD className="font-mono-data text-[11px]">{row.orgId.slice(0, 8)}…</TD><TD>{formatDate(row.updatedAt)}</TD></TR>)}</tbody></Table></CardBody></Card>}

      <Card><CardHeader title="Recent system errors" description="Sanitized audit metadata only." /><CardBody className="p-0">{errorRows.length === 0 ? <p className="p-5 text-[13px] text-[var(--color-muted)]">No recent error actions.</p> : <Table><THead><TH>Action</TH><TH>Entity</TH><TH>When</TH></THead><tbody>{errorRows.map((row, index) => <TR key={`${row.action}-${row.createdAt.toISOString()}-${index}`}><TD>{row.action}</TD><TD>{row.entityType}</TD><TD>{formatDate(row.createdAt)}</TD></TR>)}</tbody></Table>}</CardBody></Card>

      <Card><CardHeader title="Product feedback" description="Tenant-scoped weekly survey responses. No provider secrets or raw identity tokens are shown." /><CardBody className="p-0">{surveyRows.length === 0 ? <p className="p-5 text-[13px] text-[var(--color-muted)]">No survey responses yet.</p> : <Table><THead><TH>Workspace</TH><TH>Status</TH><TH>Feature</TH><TH>Satisfaction</TH><TH>Requested</TH><TH>When</TH></THead><tbody>{surveyRows.map((survey) => <TR key={survey.id}><TD className="font-mono-data text-[11px]">{survey.orgId.slice(0, 8)}…</TD><TD><StatusPill status={survey.status} /></TD><TD>{survey.featureUsed ?? "—"}</TD><TD>{survey.satisfaction ? `${survey.satisfaction}/5` : "—"}</TD><TD className="max-w-[260px] truncate">{survey.requestedFeature ?? "—"}</TD><TD className="whitespace-nowrap text-[12px] text-[var(--color-muted)]">{formatDate(survey.createdAt)}</TD></TR>)}</tbody></Table>}</CardBody></Card>

      <Alert tone="info" title="Operator safety">This console is server-authorized for the single Workflow owner. Customer workspace routes and actions remain tenant-scoped.</Alert>
    </div>
  );
}
