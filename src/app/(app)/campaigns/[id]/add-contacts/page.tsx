import { notFound, redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { getCampaignAudienceCandidates } from "@/lib/data";
import { addContactsToCampaignAction } from "@/app/(app)/campaigns/actions";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Surfaces";
import { Button, LinkButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Data";

// Authenticated page: reads session cookies and tenant context at request time.
export const dynamic = "force-dynamic";

export default async function AddContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const { id } = await params;
  const { campaign, availableContacts } = await getCampaignAudienceCandidates({ user, org }, id);
  if (!campaign) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[20px] font-semibold text-[var(--color-ink)]">Add contacts to {campaign.name}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">{availableContacts.length} eligible contacts not already in this campaign</p>
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
        <CardHeader title="Select contacts" />
        <CardBody>
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
        </CardBody>
      </Card>
    </div>
  );
}
