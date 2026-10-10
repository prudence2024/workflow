import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { getCampaignAudienceCandidates, getCampaignImportBatches } from "@/lib/data";
import { addContactsToCampaignAction } from "@/app/(app)/campaigns/actions";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Surfaces";
import { Button, LinkButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Data";

// Authenticated page: reads session cookies and tenant context at request time.
export const dynamic = "force-dynamic";

export default async function AddContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const { id } = await params;
  const { page: pageParam, search = "" } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const [{ campaign, availableContacts, total, page: resolvedPage, pageSize, search: resolvedSearch }, importBatches] = await Promise.all([
    getCampaignAudienceCandidates({ user, org }, id, { page, search }),
    getCampaignImportBatches({ user, org }),
  ]);
  if (!campaign) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[20px] font-semibold text-[var(--color-ink)]">Add contacts to {campaign.name}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">{total} eligible contacts not already in this campaign</p>
        </div>
        <LinkButton href={`/campaigns/${id}`} variant="outline" size="sm">
          Back to campaign
        </LinkButton>
      </div>

      <Card>
        <CardHeader
          title="Bulk add"
          description="Add every active contact in your workspace to this campaign in one step."
          action={
            <form action={addContactsToCampaignAction}>
              <input type="hidden" name="campaignId" value={id} />
              <input type="hidden" name="mode" value="all" />
              <Button type="submit" size="sm">
                Add all active contacts
              </Button>
            </form>
          }
        />
      </Card>

      <Card>
        <CardHeader title="Add an import batch" description="Target only contacts linked to one completed import." />
        <CardBody>
          {importBatches.length === 0 ? (
            <EmptyState title="No completed imports yet" description="Commit an import before targeting its contacts here." />
          ) : (
            <form action={addContactsToCampaignAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="campaignId" value={id} />
              <input type="hidden" name="mode" value="import" />
              <label className="min-w-[240px] flex-1 text-[12px] font-medium text-[var(--color-muted)]">
                Imported file
                <select name="importId" required className="mt-1 block h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[13px] text-[var(--color-ink)]">
                  <option value="">Select an import batch</option>
                  {importBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>{batch.fileName} ({batch.validRows} valid rows)</option>
                  ))}
                </select>
              </label>
              <Button type="submit">Add batch contacts</Button>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Select contacts" />
        <CardBody>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <label className="min-w-[220px] flex-1 text-[12px] font-medium text-[var(--color-muted)]">
              Search contacts
              <input
                name="search"
                defaultValue={resolvedSearch}
                placeholder="Name, email, or phone"
                className="mt-1 block h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[13px] text-[var(--color-ink)]"
              />
            </label>
            <Button type="submit" variant="outline">Search</Button>
            {resolvedSearch && <Link href={`/campaigns/${id}/add-contacts`} className="pb-2 text-[12px] font-medium text-[var(--color-brand)] hover:underline">Clear</Link>}
          </form>
          {availableContacts.length === 0 ? (
            <EmptyState title="No eligible contacts" description="Every active contact is already part of this campaign, or you have none yet." />
          ) : (
            <form action={addContactsToCampaignAction} className="space-y-4">
              <input type="hidden" name="campaignId" value={id} />
              <input type="hidden" name="mode" value="selected" />
              <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2">
                {availableContacts.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 hover:bg-[var(--color-canvas)]">
                    <input type="checkbox" name="contactIds" value={c.id} className="h-4 w-4 rounded border-[var(--color-border-strong)] text-[var(--color-brand)]" />
                    <Avatar name={`${c.firstName} ${c.lastName}`} size={26} />
                    <div>
                      <p className="text-[13px] font-medium text-[var(--color-ink)]">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="text-[11.5px] text-[var(--color-muted)]">{c.email ?? c.phone ?? "No contact info"}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="submit">Add selected contacts</Button>
              </div>
            </form>
          )}
          {total > pageSize && (
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-[12px] text-[var(--color-muted)]">
              <span>Page {resolvedPage}</span>
              <div className="flex gap-2">
                {resolvedPage > 1 && <Link href={`/campaigns/${id}/add-contacts?page=${resolvedPage - 1}${resolvedSearch ? `&search=${encodeURIComponent(resolvedSearch)}` : ""}`} className="font-medium text-[var(--color-brand)] hover:underline">Previous</Link>}
                {resolvedPage * pageSize < total && <Link href={`/campaigns/${id}/add-contacts?page=${resolvedPage + 1}${resolvedSearch ? `&search=${encodeURIComponent(resolvedSearch)}` : ""}`} className="font-medium text-[var(--color-brand)] hover:underline">Next</Link>}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
