import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentOrg, getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { listImports } from "@/lib/data";
import { Card, CardBody, EmptyState } from "@/components/ui/Surfaces";
import { LinkButton } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Status";
import { TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgs = await getUserOrganizations(user);
  if (orgs.length === 0) redirect("/onboarding");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  // Tenant-scoped read through the restricted role — not the owner connection.
  const rows = await listImports({ user, org });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Imports</h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">Upload → Inspect → Map → Validate → Preview → Import</p>
        </div>
        <LinkButton href="/imports/new" size="sm">
          New import
        </LinkButton>
      </div>

      <Card>
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState title="No imports yet" description="Upload an XLSX or CSV file to bring records into your workspace." action={<LinkButton href="/imports/new" size="sm">New import</LinkButton>} />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TH>File</TH>
              <TH>Rows</TH>
              <TH>Valid</TH>
              <TH>Invalid</TH>
              <TH>Duplicate</TH>
              <TH>Status</TH>
              <TH>Uploaded</TH>
            </THead>
            <tbody>
              {rows.map((imp) => (
                <TR key={imp.id}>
                  <TD>
                    <Link href={`/imports/${imp.id}`} className="font-medium text-[var(--color-ink)]">
                      {imp.fileName}
                    </Link>
                  </TD>
                  <TD className="font-mono-data">{imp.totalRows}</TD>
                  <TD className="font-mono-data text-[var(--color-success)]">{imp.validRows}</TD>
                  <TD className="font-mono-data text-[var(--color-danger)]">{imp.invalidRows}</TD>
                  <TD className="font-mono-data text-[var(--color-warning)]">{imp.duplicateRows}</TD>
                  <TD>
                    <StatusPill status={imp.status} />
                  </TD>
                  <TD className="text-[var(--color-muted)]">{formatDateTime(imp.createdAt)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
