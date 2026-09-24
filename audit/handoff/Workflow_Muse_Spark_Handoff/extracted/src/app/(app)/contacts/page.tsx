import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { contactTags, contacts, tags } from "@/db/schema";
import { Card, CardBody, EmptyState } from "@/components/ui/Surfaces";
import { LinkButton } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Status";
import { Avatar, TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { Input, Select } from "@/components/ui/Field";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user.id);
  if (!org) redirect("/onboarding");

  const { q, status, page } = await searchParams;
  const currentPage = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const showArchived = status === "archived";

  const conditions = [eq(contacts.orgId, org.orgId), showArchived ? sql`${contacts.archivedAt} is not null` : isNull(contacts.archivedAt)];
  if (q) {
    conditions.push(
      or(
        ilike(contacts.firstName, `%${q}%`),
        ilike(contacts.lastName, `%${q}%`),
        ilike(contacts.email, `%${q}%`),
        ilike(contacts.phone, `%${q}%`),
      )!,
    );
  }

  const whereClause = and(...conditions);

  const [totalRow] = await db.select({ value: count() }).from(contacts).where(whereClause);
  const total = totalRow?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows = await db
    .select()
    .from(contacts)
    .where(whereClause)
    .orderBy(desc(contacts.createdAt))
    .limit(PAGE_SIZE)
    .offset((currentPage - 1) * PAGE_SIZE);

  const contactIds = rows.map((r) => r.id);
  const tagRows = contactIds.length
    ? await db
        .select({ contactId: contactTags.contactId, name: tags.name })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(sql`${contactTags.contactId} in (${sql.join(contactIds.map((id) => sql`${id}`), sql`, `)})`)
    : [];
  const tagsByContact = new Map<string, string[]>();
  for (const t of tagRows) {
    tagsByContact.set(t.contactId, [...(tagsByContact.get(t.contactId) ?? []), t.name]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Contacts</h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">{total.toLocaleString()} {showArchived ? "archived" : "active"} records</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/imports/new" variant="outline" size="sm">
            Import contacts
          </LinkButton>
          <LinkButton href="/contacts/new" size="sm">
            Add contact
          </LinkButton>
        </div>
      </div>

      <Card>
        <form className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] p-4">
          <Input name="q" defaultValue={q} placeholder="Search name, email, or phone…" className="max-w-xs" />
          <Select name="status" defaultValue={status ?? "active"} className="max-w-[160px]">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </Select>
          <button type="submit" className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-4 text-[13px] font-medium text-[var(--color-ink-soft)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]">
            Filter
          </button>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            title={q ? "No contacts match your search" : "No contacts yet"}
            description="Add a contact manually or import a spreadsheet to get started."
            action={<LinkButton href="/contacts/new" size="sm">Add contact</LinkButton>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Phone</TH>
                <TH>Tags</TH>
                <TH>Status</TH>
                <TH>Added</TH>
              </THead>
              <tbody>
                {rows.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/contacts/${c.id}`} className="flex items-center gap-2.5">
                        <Avatar name={`${c.firstName} ${c.lastName}`} size={28} />
                        <span className="font-medium text-[var(--color-ink)]">
                          {c.firstName} {c.lastName}
                        </span>
                      </Link>
                    </TD>
                    <TD className="text-[var(--color-ink-soft)]">{c.email ?? "—"}</TD>
                    <TD className="text-[var(--color-ink-soft)]">{c.phone ?? "—"}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {(tagsByContact.get(c.id) ?? []).slice(0, 2).map((t) => (
                          <span key={t} className="rounded-full bg-[var(--color-canvas)] px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]">
                            {t}
                          </span>
                        ))}
                      </div>
                    </TD>
                    <TD>
                      <StatusPill status={c.status} />
                    </TD>
                    <TD className="text-[var(--color-muted)]">{formatDate(c.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
              <p className="text-[12.5px] text-[var(--color-muted)]">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <LinkButton
                  href={`/contacts?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), page: String(Math.max(1, currentPage - 1)) }).toString()}`}
                  variant="outline"
                  size="sm"
                >
                  Previous
                </LinkButton>
                <LinkButton
                  href={`/contacts?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), page: String(Math.min(totalPages, currentPage + 1)) }).toString()}`}
                  variant="outline"
                  size="sm"
                >
                  Next
                </LinkButton>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
