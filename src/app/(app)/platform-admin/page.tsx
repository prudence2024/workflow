import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { auditPlatformAdminAttempt, requireWorkflowAdminOwner } from "@/lib/authorization";
// Intentionally privileged: this operator console is the ONE customer-app route
// that reads across tenants. Access is gated by the exact server-side Clerk
// owner identity in addition to the normal authenticated app shell.
import { db } from "@/db";
import { campaignRecords, campaigns, contacts, messages, organizationMembers, organizations, productSurveys, users } from "@/db/schema";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";
import { Stat, TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { StatusPill } from "@/components/ui/Status";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
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

  const [[orgCount], [userCount], [campaignCount], [contactCount], [failedJobs], [emailCount]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(organizations),
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(campaigns),
    db.select({ count: sql<number>`count(*)::int` }).from(contacts),
    db.select({ count: sql<number>`count(*)::int` }).from(campaignRecords).where(sql`status in ('failed','human_action_required')`),
    db.select({ count: sql<number>`count(*)::int` }).from(messages),
  ]);

  const orgRows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      planKey: organizations.planKey,
      createdAt: organizations.createdAt,
      memberCount: sql<number>`(select count(*)::int from ${organizationMembers} where ${organizationMembers.orgId} = ${organizations.id})`,
      contactCount: sql<number>`(select count(*)::int from ${contacts} where ${contacts.orgId} = ${organizations.id})`,
      campaignCount: sql<number>`(select count(*)::int from ${campaigns} where ${campaigns.orgId} = ${organizations.id})`,
    })
    .from(organizations)
    .orderBy(desc(organizations.createdAt))
    .limit(50);

  let surveyRows: Array<{
    id: string;
    orgId: string;
    status: string;
    featureUsed: string | null;
    satisfaction: number | null;
    requestedFeature: string | null;
    createdAt: Date;
  }> = [];
  try {
    surveyRows = await db
      .select({
        id: productSurveys.id,
        orgId: productSurveys.orgId,
        status: productSurveys.status,
        featureUsed: productSurveys.featureUsed,
        satisfaction: productSurveys.satisfaction,
        requestedFeature: productSurveys.requestedFeature,
        createdAt: productSurveys.createdAt,
      })
      .from(productSurveys)
      .orderBy(desc(productSurveys.createdAt))
      .limit(25);
  } catch {
    // Keep the operator console available while the additive survey migration
    // is being rolled through environments.
    surveyRows = [];
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-5 py-3">
        <p className="text-[13px] font-semibold text-[var(--color-warning)]">Platform Administration</p>
        <p className="text-[12.5px] text-[var(--color-warning)]/80">
          Internal operator view across all organizations. Customer administrators never see this area.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Organizations" value={orgCount.count} />
        <Stat label="Users" value={userCount.count} />
        <Stat label="Campaigns" value={campaignCount.count} />
        <Stat label="Contacts" value={contactCount.count} />
        <Stat label="Jobs needing attention" value={failedJobs.count} />
        <Stat label="Emails sent" value={emailCount.count} />
      </div>

      <Card>
        <CardHeader title="Organizations" description="Most recently created workspaces" />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TH>Organization</TH>
              <TH>Plan</TH>
              <TH>Members</TH>
              <TH>Contacts</TH>
              <TH>Campaigns</TH>
              <TH>Created</TH>
            </THead>
            <tbody>
              {orgRows.map((o) => (
                <TR key={o.id}>
                  <TD className="font-medium text-[var(--color-ink)]">{o.name}</TD>
                  <TD>
                    <StatusPill status={o.planKey === "free" ? "draft" : "active"} />
                  </TD>
                  <TD className="font-mono-data">{o.memberCount}</TD>
                  <TD className="font-mono-data">{o.contactCount}</TD>
                  <TD className="font-mono-data">{o.campaignCount}</TD>
                  <TD className="text-[var(--color-muted)]">{formatDate(o.createdAt)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Product feedback" description="Tenant-scoped weekly survey responses. No provider secrets or raw identity tokens are shown." />
        <CardBody className="p-0">
          {surveyRows.length === 0 ? <p className="p-5 text-[13px] text-[var(--color-muted)]">No survey responses yet.</p> : (
            <Table>
              <THead><TH>Workspace</TH><TH>Status</TH><TH>Feature</TH><TH>Satisfaction</TH><TH>Requested</TH><TH>When</TH></THead>
              <tbody>{surveyRows.map((survey) => <TR key={survey.id}><TD className="font-mono-data text-[11px]">{survey.orgId.slice(0, 8)}…</TD><TD><StatusPill status={survey.status} /></TD><TD>{survey.featureUsed ?? "—"}</TD><TD>{survey.satisfaction ? `${survey.satisfaction}/5` : "—"}</TD><TD className="max-w-[260px] truncate">{survey.requestedFeature ?? "—"}</TD><TD className="whitespace-nowrap text-[12px] text-[var(--color-muted)]">{formatDate(survey.createdAt)}</TD></TR>)}</tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
