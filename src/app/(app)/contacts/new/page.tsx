import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { listCustomFields } from "@/lib/data";
import { createContactAction } from "@/app/(app)/contacts/actions";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";
import { Alert } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label } from "@/components/ui/Field";

// Authenticated page: reads session cookies and tenant context at request time.
export const dynamic = "force-dynamic";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  const { error } = await searchParams;

  const definitions = await listCustomFields({ user, org });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Add contact</h1>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title="Contact details" description="Every contact becomes a persistent record with its own timeline." />
        <CardBody>
          <form action={createContactAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup>
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" name="firstName" required />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" name="lastName" />
              </FieldGroup>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" />
              </FieldGroup>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup>
                <Label htmlFor="company">Organization / company</Label>
                <Input id="company" name="company" />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" />
              </FieldGroup>
            </div>
            <FieldGroup>
              <Label htmlFor="nextAction">Next action</Label>
              <Input id="nextAction" name="nextAction" placeholder="e.g. Confirm payment" />
            </FieldGroup>

            {definitions.length > 0 && (
              <div className="space-y-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] p-4">
                <p className="text-[12.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Custom fields</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {definitions.map((def) => (
                    <FieldGroup key={def.id}>
                      <Label htmlFor={`custom__${def.key}`}>{def.label}</Label>
                      <Input id={`custom__${def.key}`} name={`custom__${def.key}`} />
                    </FieldGroup>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit">Create contact</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
