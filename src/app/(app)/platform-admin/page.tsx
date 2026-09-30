import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
// Intentionally privileged: this operator console is the ONE customer-app route
// that reads across tenants. Access is gated by isPlatformAdmin, which is
// resolved from the database allowlist (app.is_platform_admin_user) — never from
// a request value. Every ordinary customer page reads through @/lib/data.
import { db } from "@/db";
import { campaignRecords, campaigns, contacts, messages, organizationMembers, organizations, users } from "@/db/schema";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";
import { Stat, TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { StatusPill } from "@/components/ui/Status";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isPlatformAdmin) redirect("/dashboard");

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
    </div>
  );
}
