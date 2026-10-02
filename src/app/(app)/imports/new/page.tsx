import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { uploadImportAction } from "@/app/(app)/imports/actions";
import { Card, CardBody, CardHeader, Alert } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldGroup, HelpText, Label } from "@/components/ui/Field";

// Authenticated page: reads session cookies and tenant context at request time.
export const dynamic = "force-dynamic";

export default async function NewImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">New import</h1>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title="Upload a spreadsheet" description="XLSX or CSV. We'll inspect the columns before you map anything." />
        <CardBody>
          <form action={uploadImportAction} className="space-y-4">
            <FieldGroup>
              <Label htmlFor="file">Spreadsheet file</Label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,.xlsx,.xls"
                required
                className="block w-full rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas)] px-3 py-8 text-center text-[13px] text-[var(--color-ink-soft)] file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--color-brand)] file:px-3 file:py-2 file:text-[12.5px] file:font-medium file:text-white"
              />
              <HelpText>The original file is retained for audit — nothing is imported until you validate and confirm.</HelpText>
            </FieldGroup>
            <Button type="submit" className="w-full">
              Upload & inspect
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
