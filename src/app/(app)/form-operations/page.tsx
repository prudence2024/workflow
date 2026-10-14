import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { getFormOperationsOverview } from "@/lib/data";
import { Card, CardBody, CardHeader, EmptyState, Alert } from "@/components/ui/Surfaces";
import { Stat, TD, TH, THead, TR, Table, ProgressBar } from "@/components/ui/Data";
import { StatusPill } from "@/components/ui/Status";
import { LinkButton } from "@/components/ui/Button";
import { formatDateTime, pct, timeAgo } from "@/lib/utils";
import { campaignPresentation } from "@/lib/campaignStatus";

export const dynamic = "force-dynamic";

/**
 * Form Operations — the operational console for form-driven campaigns.
 *
 * One screen that answers: which campaigns have an analyzed form, is the field
 * mapping complete, what happened on the last run, and what is stuck waiting on
 * a human. Reads go through the tenant gateway (workflow_app + RLS), never the
 * owner connection.
 */
export default async function FormOperationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgs = await getUserOrganizations(user);
  if (orgs.length === 0) redirect("/onboarding");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const overview = await getFormOperationsOverview({ user, org });
  const unresolved = overview.attention.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Form operations</h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">
            Analyze → map → submit → track, for every form-driven campaign in {org.orgName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/campaigns" variant="outline" size="sm">
            All campaigns
          </LinkButton>
          <LinkButton href="/campaigns/new?analyze=1" size="sm">
            Analyze a form
          </LinkButton>
        </div>
      </div>

      <Alert tone="info">
        Form analysis performs a single authorized fetch of the form you point to — no CAPTCHA or anti-bot
        bypass is attempted, and a submission is never reported successful without the destination confirming it.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Campaigns with a form" value={overview.campaigns.length} hint="analyzed definitions" />
        <Stat
          label="Mapped fields"
          value={`${overview.mappedFields}/${overview.totalFields}`}
          hint="form fields with a data source"
        />
        <Stat
          label="Submission success"
          value={`${pct(overview.successful, overview.attempts || 1)}%`}
          hint={`${overview.attempts} attempts recorded`}
        />
        <Stat
          label="Needs a human"
          value={unresolved}
          hint="failed or blocked records"
          trend={unresolved > 0 ? { direction: "down", label: "review below" } : undefined}
        />
      </div>

      <Card>
        <CardHeader
          title="Campaign operations"
          description="Mapping coverage and last-run outcome per campaign"
        />
        {overview.campaigns.length === 0 ? (
          <CardBody>
            <EmptyState
              title="No form campaigns yet"
              description="Create a campaign and analyze an authorized form URL to generate its field definition."
              action={<LinkButton href="/campaigns/new?analyze=1" size="sm">Analyze a form</LinkButton>}
            />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TH>Campaign</TH>
              <TH>Status</TH>
              <TH>Fields</TH>
              <TH>Mapped</TH>
              <TH>Successful</TH>
              <TH>Needs attention</TH>
              <TH>Updated</TH>
              <TH>Outcome</TH>
              <TH>{""}</TH>
            </THead>
            <tbody>
              {overview.campaigns.map((c) => (
                (() => {
                  const presentation = campaignPresentation(c.status, c.stats);
                  return <TR key={c.id}>
                  <TD className="max-w-[280px]">
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand)]">
                      {c.name}
                    </Link>
                    <p className="max-w-[260px] truncate text-[11.5px] text-[var(--color-muted)]">{c.formUrl}</p>
                  </TD>
                  <TD>
                    <StatusPill status={presentation.key} label={presentation.label} />
                  </TD>
                  <TD className="font-mono-data">{c.totalFields}</TD>
                  <TD className="min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <div className="w-16">
                        <ProgressBar
                          value={pct(c.mappedFields, c.totalFields || 1)}
                          tone={c.mappedFields === c.totalFields ? "success" : "warning"}
                        />
                      </div>
                      <span className="font-mono-data text-[11.5px] text-[var(--color-muted)]">
                        {c.mappedFields}/{c.totalFields}
                      </span>
                    </div>
                  </TD>
                  <TD className="font-mono-data text-[var(--color-success)]">{c.successful}</TD>
                  <TD className="font-mono-data text-[var(--color-warning)]">
                    {c.needsAttention}
                  </TD>
                  <TD className="whitespace-nowrap text-[var(--color-muted)]">{formatDateTime(c.updatedAt)}</TD>
                  <TD className="max-w-[260px] text-[12px] text-[var(--color-muted)]">{presentation.message}</TD>
                  <TD>
                    <LinkButton href={`/campaigns/${c.id}`} variant="ghost" size="sm">
                      Open
                    </LinkButton>
                  </TD>
                  </TR>;
                })()
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Records needing a human"
          description="Automation stopped safely — these submissions were never completed by the system"
        />
        <CardBody className="p-0">
          {overview.attention.length === 0 ? (
            <EmptyState
              title="Nothing is waiting on a human"
              description="Failed and blocked submissions appear here so they can be resolved deliberately."
            />
          ) : (
            <Table>
              <THead>
                <TH>Contact</TH>
                <TH>Campaign</TH>
                <TH>Status</TH>
                <TH>Attempts</TH>
                <TH>Reason</TH>
                <TH>Since</TH>
              </THead>
              <tbody>
                {overview.attention.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/contacts/${r.contactId}`} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand)]">
                        {r.contactName}
                      </Link>
                    </TD>
                    <TD className="max-w-[220px] truncate text-[var(--color-ink-soft)]">
                      <Link href={`/campaigns/${r.campaignId}`}>{r.campaignName}</Link>
                    </TD>
                    <TD>
                      <StatusPill status={r.status} />
                    </TD>
                    <TD className="font-mono-data">{r.attempts}</TD>
                    <TD className="max-w-[320px] truncate text-[var(--color-muted)]">{r.resultMessage ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-[var(--color-muted)]">{timeAgo(r.updatedAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
