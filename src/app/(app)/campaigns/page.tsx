import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { listCampaigns } from "@/lib/data";
import { Card, EmptyState } from "@/components/ui/Surfaces";
import { LinkButton } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Status";
import { ProgressBar, TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { formatDate, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgs = await getUserOrganizations(user);
  if (orgs.length === 0) redirect("/onboarding");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const rows = await listCampaigns({ user, org });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Campaigns</h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">{rows.length} total</p>
        </div>
        <LinkButton href="/campaigns/new" size="sm">
          New campaign
        </LinkButton>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No campaigns yet" description="Create a campaign to connect a form, map fields, and start submitting records." action={<LinkButton href="/campaigns/new" size="sm">New campaign</LinkButton>} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH>Type</TH>
                <TH>Progress</TH>
                <TH>Status</TH>
                <TH>Updated</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((c) => {
                const total = c.stats.total ?? 0;
                const done = (c.stats.successful ?? 0) + (c.stats.failed ?? 0) + (c.stats.skipped ?? 0);
                return (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-[var(--color-ink)]">
                        {c.name}
                      </Link>
                    </TD>
                    <TD className="text-[var(--color-ink-soft)] capitalize">{c.type.replace(/_/g, " ")}</TD>
                    <TD className="min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <div className="w-24">
                          <ProgressBar value={pct(done, total || 1)} tone="success" />
                        </div>
                        <span className="font-mono-data text-[11.5px] text-[var(--color-muted)]">
                          {done}/{total}
                        </span>
                      </div>
                    </TD>
                    <TD>
                      <StatusPill status={c.status} />
                    </TD>
                    <TD className="text-[var(--color-muted)]">{formatDate(c.updatedAt)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
