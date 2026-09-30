import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser, getUserOrganizations } from "@/lib/auth";
// Tenant-scoped read: executes as the restricted `workflow_app` role inside a
// transaction whose organisation context was verified by the database.
import { listContactsPage } from "@/lib/data";
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
  const orgs = await getUserOrganizations(user);
  if (orgs.length === 0) redirect("/onboarding");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const { q, status, page } = await searchParams;
  const currentPage = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const showArchived = status === "archived";

  const { rows, total } = await listContactsPage({ user, org }, {
    search: q,
    showArchived,
    page: currentPage,
    pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageParams = (p: number) =>
    new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), page: String(p) }).toString();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Records</h1>
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
                        {c.tags.slice(0, 2).map((t) => (
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
                <LinkButton href={`/contacts?${pageParams(Math.max(1, currentPage - 1))}`} variant="outline" size="sm">
                  Previous
                </LinkButton>
                <LinkButton href={`/contacts?${pageParams(Math.min(totalPages, currentPage + 1))}`} variant="outline" size="sm">
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
