import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { listDownloads } from "@/lib/data";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";
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
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand)]">Workflow app</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold text-[var(--color-ink)]">Get the app</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-[var(--color-muted)]">Keep your workspace close at hand with the installable Workflow app experience.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Install Workflow" description="The responsive web app is the current supported release." />
          <CardBody className="space-y-4">
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-4">
              <p className="font-medium text-[var(--color-ink)]">Progressive web app</p>
              <p className="mt-1 text-[13px] text-[var(--color-muted)]">Open Workflow in a supported browser and use “Add to home screen” or “Install Workflow” from the browser menu.</p>
              <p className="mt-3 text-[12px] text-[var(--color-muted)]">Current release · Web app · Offline shell ready</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/dashboard" size="sm">Open dashboard</LinkButton>
              <LinkButton href="/" variant="outline" size="sm">View web app</LinkButton>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Release notes" />
          <CardBody>
            <p className="text-[13px] text-[var(--color-muted)]">Installable app foundation is available. Native Android packaging will be published here when a signed release is ready.</p>
          </CardBody>
        </Card>
      </div>
      {rows.length > 0 && <Card>
        <CardHeader title="Workspace files" description="Exports and uploaded files remain available here." />
        <Table>
          <THead><TH>File</TH><TH>Type</TH><TH>Size</TH><TH>Added</TH><TH /></THead>
          <tbody>{rows.map((row) => <TR key={row.id}><TD className="font-medium text-[var(--color-ink)]">{row.fileName}</TD><TD className="uppercase text-[var(--color-muted)]">{row.kind}</TD><TD className="font-mono-data text-[var(--color-muted)]">{formatBytes(row.sizeBytes)}</TD><TD className="text-[var(--color-muted)]">{formatDateTime(row.createdAt)}</TD><TD><a href={`/api/downloads/${row.id}`} download={row.fileName} className="font-medium text-[var(--color-brand)] hover:underline">Download</a></TD></TR>)}</tbody>
        </Table>
      </Card>}
    </div>
  );
}
