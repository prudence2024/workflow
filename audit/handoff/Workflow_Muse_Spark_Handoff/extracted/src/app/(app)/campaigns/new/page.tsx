import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createCampaignAction } from "@/app/(app)/campaigns/actions";
import { Card, CardBody, CardHeader, Alert } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldGroup, HelpText, Input, Label, Select } from "@/components/ui/Field";

const TYPES = [
  "Event Registration",
  "School Enrollment",
  "Survey Submission",
  "Membership Registration",
  "Employee Onboarding",
  "Conference Registration",
  "Application Processing",
  "Customer Onboarding",
  "Appointment Registration",
  "Custom Campaign",
];

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">New campaign</h1>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title="Campaign details" description="You can connect an authorized external form now or later." />
        <CardBody>
          <form action={createCampaignAction} className="space-y-4">
            <FieldGroup>
              <Label htmlFor="name">Campaign name</Label>
              <Input id="name" name="name" placeholder="Youth Conference 2026" required />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="type">Campaign type</Label>
              <Select id="type" name="type" defaultValue="Event Registration">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="formUrl">Authorized external form URL (optional)</Label>
              <Input id="formUrl" name="formUrl" type="url" placeholder="https://forms.example.org/registration" />
              <HelpText>Only submit to forms and destinations you are authorized to interact with.</HelpText>
            </FieldGroup>
            <div className="flex justify-end">
              <Button type="submit">Create campaign</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
