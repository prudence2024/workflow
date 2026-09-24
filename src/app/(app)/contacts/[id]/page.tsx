import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import {
  activityEvents,
  campaignRecords,
  campaigns,
  contactTags,
  contacts,
  customFieldDefinitions,
  notes,
  tags,
} from "@/db/schema";
import {
  addNoteAction,
  addTagAction,
  archiveContactAction,
  removeTagAction,
  restoreContactAction,
  updateContactAction,
} from "@/app/(app)/contacts/actions";
import { Card, CardBody, CardHeader, Alert } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label, Textarea } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/Status";
import { Avatar } from "@/components/ui/Data";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const { id } = await params;
  const { error } = await searchParams;

  const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, org.orgId))).limit(1);
  if (!contact) notFound();

  const [definitions, contactTagRows, allTags, timeline, contactNotes, campaignHistory] = await Promise.all([
    db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, org.orgId)),
    db
      .select({ id: tags.id, name: tags.name })
      .from(contactTags)
      .innerJoin(tags, eq(contactTags.tagId, tags.id))
      .where(eq(contactTags.contactId, id)),
    db.select().from(tags).where(eq(tags.orgId, org.orgId)),
    db.select().from(activityEvents).where(eq(activityEvents.contactId, id)).orderBy(desc(activityEvents.createdAt)).limit(30),
    db.select().from(notes).where(eq(notes.contactId, id)).orderBy(desc(notes.createdAt)),
    db
      .select({
        id: campaignRecords.id,
        status: campaignRecords.status,
        resultMessage: campaignRecords.resultMessage,
        updatedAt: campaignRecords.updatedAt,
        campaignId: campaigns.id,
        campaignName: campaigns.name,
      })
      .from(campaignRecords)
      .innerJoin(campaigns, eq(campaignRecords.campaignId, campaigns.id))
      .where(eq(campaignRecords.contactId, id))
      .orderBy(desc(campaignRecords.updatedAt)),
  ]);

  const customFields = (contact.customFields as Record<string, string>) ?? {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={`${contact.firstName} ${contact.lastName}`} size={48} />
          <div>
            <h1 className="font-display text-[20px] font-semibold text-[var(--color-ink)]">
              {contact.firstName} {contact.lastName}
            </h1>
            <p className="text-[13px] text-[var(--color-muted)]">
              {contact.email ?? "No email"} {contact.phone ? `· ${contact.phone}` : ""}
            </p>
          </div>
          <StatusPill status={contact.status} />
        </div>
        <div className="flex gap-2">
          {contact.archivedAt ? (
            <form action={restoreContactAction}>
              <input type="hidden" name="contactId" value={contact.id} />
              <Button variant="outline" size="sm" type="submit">
                Restore contact
              </Button>
            </form>
          ) : (
            <form action={archiveContactAction}>
              <input type="hidden" name="contactId" value={contact.id} />
              <Button variant="outline" size="sm" type="submit">
                Archive contact
              </Button>
            </form>
          )}
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Contact information" />
            <CardBody>
              <form action={updateContactAction} className="space-y-4">
                <input type="hidden" name="contactId" value={contact.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldGroup>
                    <Label htmlFor="firstName">First name</Label>
                    <Input id="firstName" name="firstName" defaultValue={contact.firstName} required />
                  </FieldGroup>
                  <FieldGroup>
                    <Label htmlFor="lastName">Last name</Label>
                    <Input id="lastName" name="lastName" defaultValue={contact.lastName} />
                  </FieldGroup>
                  <FieldGroup>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" defaultValue={contact.email ?? ""} />
                  </FieldGroup>
                  <FieldGroup>
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" defaultValue={contact.phone ?? ""} />
                  </FieldGroup>
                  <FieldGroup>
                    <Label htmlFor="company">Organization / company</Label>
                    <Input id="company" name="company" defaultValue={contact.company ?? ""} />
                  </FieldGroup>
                  <FieldGroup>
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" name="address" defaultValue={contact.address ?? ""} />
                  </FieldGroup>
                  <FieldGroup>
                    <Label htmlFor="nextAction">Next action</Label>
                    <Input id="nextAction" name="nextAction" defaultValue={contact.nextAction ?? ""} />
                  </FieldGroup>
                </div>

                {definitions.length > 0 && (
                  <div className="space-y-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] p-4">
                    <p className="text-[12.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Custom fields</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {definitions.map((def) => (
                        <FieldGroup key={def.id}>
                          <Label htmlFor={`custom__${def.key}`}>{def.label}</Label>
                          <Input id={`custom__${def.key}`} name={`custom__${def.key}`} defaultValue={customFields[def.key] ?? ""} />
                        </FieldGroup>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button type="submit" size="sm">
                    Save changes
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Campaign history" description="Every campaign this contact has participated in" />
            <CardBody className="p-0">
              {campaignHistory.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-[var(--color-muted)]">No campaign activity yet.</p>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {campaignHistory.map((h) => (
                    <Link key={h.id} href={`/campaigns/${h.campaignId}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-[var(--color-canvas)]/60">
                      <div>
                        <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{h.campaignName}</p>
                        <p className="text-[12px] text-[var(--color-muted)]">{h.resultMessage ?? "—"}</p>
                      </div>
                      <StatusPill status={h.status} />
                    </Link>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timeline" description="Everything that has happened to this record" />
            <CardBody>
              {timeline.length === 0 ? (
                <p className="text-[13px] text-[var(--color-muted)]">No activity recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {timeline.map((event, i) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="h-2 w-2 rounded-full bg-[var(--color-brand)]" />
                        {i < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-[var(--color-border)]" />}
                      </div>
                      <div className="pb-3">
                        <p className="font-mono-data text-[11px] text-[var(--color-muted)]">{formatDateTime(event.createdAt)}</p>
                        <p className="text-[13px] text-[var(--color-ink)]">{event.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Tags" />
            <CardBody>
              <div className="flex flex-wrap gap-2">
                {contactTagRows.length === 0 && <p className="text-[12.5px] text-[var(--color-muted)]">No tags yet.</p>}
                {contactTagRows.map((t) => (
                  <form key={t.id} action={removeTagAction} className="inline-flex">
                    <input type="hidden" name="contactId" value={contact.id} />
                    <input type="hidden" name="tagId" value={t.id} />
                    <button type="submit" className="flex items-center gap-1.5 rounded-full bg-[var(--color-brand-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-brand)]">
                      {t.name} <span aria-hidden>×</span>
                    </button>
                  </form>
                ))}
              </div>
              <form action={addTagAction} className="mt-3 flex gap-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <Input name="tagName" placeholder="Add a tag…" list="all-tags" className="h-9" />
                <datalist id="all-tags">
                  {allTags.map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
                <Button type="submit" size="sm" variant="outline">
                  Add
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <CardBody>
              <form action={addNoteAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <Textarea name="body" placeholder="Add an internal note…" required />
                <div className="flex justify-end">
                  <Button type="submit" size="sm">
                    Add note
                  </Button>
                </div>
              </form>
              <div className="mt-4 space-y-3">
                {contactNotes.map((n) => (
                  <div key={n.id} className="rounded-[var(--radius-sm)] bg-[var(--color-canvas)] p-3">
                    <p className="text-[13px] text-[var(--color-ink)]">{n.body}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-muted)]">{timeAgo(n.createdAt)}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
