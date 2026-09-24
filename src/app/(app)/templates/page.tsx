import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { messageTemplates } from "@/db/schema";
import { createTemplateAction, deleteTemplateAction } from "@/app/(app)/templates/actions";
import { Card, CardBody, CardHeader, Alert, EmptyState } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldGroup, HelpText, Input, Label, Textarea } from "@/components/ui/Field";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  const { error } = await searchParams;

  const templates = await db.select().from(messageTemplates).where(eq(messageTemplates.orgId, org.orgId)).orderBy(desc(messageTemplates.updatedAt));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Email templates</h1>
        <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">Personalized confirmation and follow-up messages</p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title="New template" description="Use {{first_name}}, {{last_name}}, {{campaign}}, {{organization}}, {{registration_status}}" />
        <CardBody>
          <form action={createTemplateAction} className="space-y-4">
            <FieldGroup>
              <Label htmlFor="name">Template name</Label>
              <Input id="name" name="name" placeholder="Registration confirmation" required />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="subject">Subject line</Label>
              <Input id="subject" name="subject" placeholder="You're confirmed for {{campaign}}!" required />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="body">Email body (HTML supported)</Label>
              <Textarea id="body" name="body" rows={6} placeholder={"Hi {{first_name}},\n\nYou're confirmed for {{campaign}}. We'll be in touch with next steps."} required />
              <HelpText>Variables are replaced automatically when the email is sent.</HelpText>
            </FieldGroup>
            <div className="flex justify-end">
              <Button type="submit">Save template</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your templates" />
        <CardBody className="p-0">
          {templates.length === 0 ? (
            <EmptyState title="No templates yet" description="Create your first confirmation email template above." />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {templates.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{t.name}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-muted)]">{t.subject}</p>
                  </div>
                  <form action={deleteTemplateAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Delete
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
