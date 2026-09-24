import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { customFieldDefinitions, importErrors, imports } from "@/db/schema";
import { commitImportAction, saveMappingAndValidateAction } from "@/app/(app)/imports/actions";
import { Card, CardBody, CardHeader, Alert, EmptyState } from "@/components/ui/Surfaces";
import { Button, LinkButton } from "@/components/ui/Button";
import { FieldGroup, Label, Select } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/Status";
import { Stat, TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { formatDateTime } from "@/lib/utils";

const CONTACT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Organization / company" },
  { key: "address", label: "Address" },
];

function guessColumn(columns: string[], key: string): string {
  const normalized = columns.find((c) => c.toLowerCase().replace(/[^a-z]/g, "") === key.toLowerCase());
  if (normalized) return normalized;
  const partial = columns.find((c) => c.toLowerCase().includes(key.toLowerCase()));
  return partial ?? "";
}

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user.id);
  if (!org) redirect("/onboarding");

  const { id } = await params;
  const [record] = await db.select().from(imports).where(and(eq(imports.id, id), eq(imports.orgId, org.orgId))).limit(1);
  if (!record) notFound();

  const columns = (record.columns as string[]) ?? [];
  const mapping = (record.mapping as Record<string, string>) ?? {};
  const definitions = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, org.orgId));

  const errors = record.status === "validated" || record.status === "imported"
    ? await db.select().from(importErrors).where(eq(importErrors.importId, id)).limit(50)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[20px] font-semibold text-[var(--color-ink)]">{record.fileName}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">{record.totalRows} rows detected · Uploaded {formatDateTime(record.createdAt)}</p>
        </div>
        <StatusPill status={record.status} />
      </div>

      <div className="flex gap-1.5">
        {["uploaded", "validated", "imported"].map((step, i) => {
          const order = ["uploaded", "validated", "imported"];
          const currentIndex = order.indexOf(record.status);
          const active = i <= currentIndex;
          return (
            <div key={step} className="flex flex-1 items-center gap-1.5">
              <div className={`h-1.5 flex-1 rounded-full ${active ? "bg-[var(--color-brand)]" : "bg-[var(--color-border)]"}`} />
            </div>
          );
        })}
      </div>

      {record.status === "uploaded" && (
        <Card>
          <CardHeader title="Map columns" description="Match spreadsheet columns to contact fields. Unmapped fields are left blank." />
          <CardBody>
            <form action={saveMappingAndValidateAction} className="space-y-5">
              <input type="hidden" name="importId" value={record.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                {CONTACT_FIELDS.map((field) => (
                  <FieldGroup key={field.key}>
                    <Label htmlFor={`map__${field.key}`}>
                      {field.label} {field.required && <span className="text-[var(--color-danger)]">*</span>}
                    </Label>
                    <Select id={`map__${field.key}`} name={`map__${field.key}`} defaultValue={mapping[field.key] ?? guessColumn(columns, field.key)}>
                      <option value="">— Not mapped —</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </FieldGroup>
                ))}
              </div>

              {definitions.length > 0 && (
                <div className="space-y-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] p-4">
                  <p className="text-[12.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Custom fields</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {definitions.map((def) => (
                      <FieldGroup key={def.id}>
                        <Label htmlFor={`map__custom__${def.key}`}>{def.label}</Label>
                        <Select id={`map__custom__${def.key}`} name={`map__custom__${def.key}`} defaultValue={mapping[`custom__${def.key}`] ?? guessColumn(columns, def.label)}>
                          <option value="">— Not mapped —</option>
                          {columns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                      </FieldGroup>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-[var(--radius-sm)] bg-[var(--color-canvas)] p-4">
                <p className="text-[12.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Detected columns</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {columns.map((c) => (
                    <span key={c} className="rounded-full bg-white px-2.5 py-1 text-[11.5px] text-[var(--color-ink-soft)]">
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit">Validate mapping</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {(record.status === "validated" || record.status === "imported") && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Total rows" value={record.totalRows} />
            <Stat label="Valid" value={record.validRows} />
            <Stat label="Invalid" value={record.invalidRows} />
            <Stat label="Duplicate" value={record.duplicateRows} />
          </div>

          {record.status === "validated" && (
            <Alert tone={record.invalidRows > 0 ? "warning" : "success"} title="Validation complete">
              {record.validRows} rows are ready to import. {record.invalidRows > 0 && `${record.invalidRows} rows have errors and will be skipped.`}{" "}
              {record.duplicateRows > 0 && `${record.duplicateRows} duplicate rows detected within this file.`}
            </Alert>
          )}

          <Card>
            <CardHeader title="Row issues" description="Rows that will be skipped during import" />
            <CardBody className="p-0">
              {errors.length === 0 ? (
                <EmptyState title="No issues found" description="Every row passed validation." />
              ) : (
                <Table>
                  <THead>
                    <TH>Row</TH>
                    <TH>Issues</TH>
                    <TH>Raw data</TH>
                  </THead>
                  <tbody>
                    {errors.map((e) => (
                      <TR key={e.id}>
                        <TD className="font-mono-data">{e.rowNumber}</TD>
                        <TD className="text-[var(--color-danger)]">{(e.errors as string[]).join(", ")}</TD>
                        <TD className="max-w-sm truncate text-[var(--color-muted)]">{JSON.stringify(e.rawData)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>

          {record.status === "validated" ? (
            <div className="flex justify-end gap-2">
              <LinkButton href={`/imports/${record.id}`} variant="outline">
                Re-map
              </LinkButton>
              <form action={commitImportAction}>
                <input type="hidden" name="importId" value={record.id} />
                <Button type="submit">Confirm import ({record.validRows} contacts)</Button>
              </form>
            </div>
          ) : (
            <Alert tone="success" title="Import complete">
              This import has been committed to your contacts.{" "}
              <Link href="/contacts" className="font-semibold underline">
                View contacts
              </Link>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
