import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { customFieldDefinitions } from "@/db/schema";
import { createCustomFieldAction, deleteCustomFieldAction } from "@/app/(app)/contacts/actions";
import { Card, CardBody, CardHeader, Alert, EmptyState } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldGroup, HelpText, Input, Label, Select } from "@/components/ui/Field";
import { SettingsTabs } from "@/components/app/SettingsTabs";

export default async function CustomFieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  const { error } = await searchParams;

  const definitions = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, org.orgId));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Settings</h1>
        <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">Custom fields for {org.orgName}</p>
      </div>
      <SettingsTabs />

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader
          title="Custom fields"
          description="Define organization-specific fields without any database schema changes — e.g. Student ID, Church, T-Shirt Size."
        />
        <CardBody className="space-y-6">
          <form action={createCustomFieldAction} className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1.2fr_auto] sm:items-end">
            <FieldGroup>
              <Label htmlFor="label">Field label</Label>
              <Input id="label" name="label" placeholder="Student ID" required />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="fieldType">Type</Label>
              <Select id="fieldType" name="fieldType" defaultValue="text">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="select">Select</option>
                <option value="boolean">Yes / No</option>
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="options">Options (for select)</Label>
              <Input id="options" name="options" placeholder="Small, Medium, Large" />
            </FieldGroup>
            <Button type="submit">Add field</Button>
          </form>
          <HelpText>Field keys are generated automatically from the label and used when mapping imports.</HelpText>

          {definitions.length === 0 ? (
            <EmptyState title="No custom fields yet" description="Add your first custom field to start capturing organization-specific data." />
          ) : (
            <div className="divide-y divide-[var(--color-border)] rounded-[var(--radius-sm)] border border-[var(--color-border)]">
              {definitions.map((def) => (
                <div key={def.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{def.label}</p>
                    <p className="text-[11.5px] text-[var(--color-muted)]">
                      key: <span className="font-mono-data">{def.key}</span> · type: {def.fieldType}
                      {def.options && def.options.length > 0 ? ` · ${def.options.join(", ")}` : ""}
                    </p>
                  </div>
                  <form action={deleteCustomFieldAction}>
                    <input type="hidden" name="id" value={def.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
