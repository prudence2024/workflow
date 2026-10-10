import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { listReportCampaigns } from "@/lib/data";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Surfaces";
import { StatusPill } from "@/components/ui/Status";
import { TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const rows = await listReportCampaigns({ user, org });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Reports</h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">Success rate, failures, and exports per campaign</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/exports/contacts?format=csv" download="contacts.csv" className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-ink)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]">
            Export contacts (CSV)
          </a>
          <a href="/api/exports/contacts?format=xlsx" download="contacts.xlsx" className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-ink)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]">
            Export contacts (XLSX)
          </a>
        </div>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No campaigns yet" description="Reports appear here once you run your first campaign." />
        ) : (
          <Table>
            <THead>
              <TH>Campaign</TH>
              <TH>Total</TH>
              <TH>Successful</TH>
              <TH>Failed</TH>
              <TH>Skipped</TH>
              <TH>Success rate</TH>
              <TH>Status</TH>
              <TH />
            </THead>
            <tbody>
              {rows.map((c) => {
                const stats = c.stats ?? {};
                const total = stats.total ?? 0;
                const successful = stats.successful ?? 0;
                const processed = successful + (stats.failed ?? 0) + (stats.skipped ?? 0);
                return (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-[var(--color-ink)]">
                        {c.name}
                      </Link>
                    </TD>
                    <TD className="font-mono-data">{total}</TD>
                    <TD className="font-mono-data text-[var(--color-success)]">{successful}</TD>
                    <TD className="font-mono-data text-[var(--color-danger)]">{stats.failed ?? 0}</TD>
                    <TD className="font-mono-data text-[var(--color-muted)]">{stats.skipped ?? 0}</TD>
                    <TD className="font-mono-data">{pct(successful, processed || 1)}%</TD>
                    <TD>
                      <StatusPill status={c.status} />
                    </TD>
                    <TD>
                      <div className="flex gap-2">
                        <a href={`/api/exports/campaigns/${c.id}?format=csv`} download={`${c.name}-report.csv`} className="inline-flex items-center justify-center whitespace-nowrap px-3 py-2 text-[13px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-brand)]">
                          CSV
                        </a>
                        <a href={`/api/exports/campaigns/${c.id}?format=xlsx`} download={`${c.name}-report.xlsx`} className="inline-flex items-center justify-center whitespace-nowrap px-3 py-2 text-[13px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-brand)]">
                          XLSX
                        </a>
                      </div>
                    </TD>
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
