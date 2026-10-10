import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { listDownloads } from "@/lib/data";
import { Card, CardBody, EmptyState } from "@/components/ui/Surfaces";
import { LinkButton } from "@/components/ui/Button";
import { TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DownloadsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  const rows = await listDownloads({ user, org });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Downloads</h1>
        <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">Files uploaded by this workspace, ready to download again.</p>
      </div>
      <Card>
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState title="No downloads yet" description="Files uploaded for imports will appear here once they are available." action={<LinkButton href="/imports/new" size="sm">New import</LinkButton>} />
          </CardBody>
        ) : (
          <Table>
            <THead><TH>File</TH><TH>Type</TH><TH>Size</TH><TH>Added</TH><TH /></THead>
            <tbody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-[var(--color-ink)]">{row.fileName}</TD>
                  <TD className="uppercase text-[var(--color-muted)]">{row.kind}</TD>
                  <TD className="font-mono-data text-[var(--color-muted)]">{formatBytes(row.sizeBytes)}</TD>
                  <TD className="text-[var(--color-muted)]">{formatDateTime(row.createdAt)}</TD>
                  <TD><a href={`/api/downloads/${row.id}`} download={row.fileName} className="font-medium text-[var(--color-brand)] hover:underline">Download</a></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
