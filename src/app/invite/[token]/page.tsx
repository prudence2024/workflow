import Link from "next/link";
import { eq } from "drizzle-orm";
// Intentionally privileged: an invitee is not yet a member of the inviting
// workspace, so no tenant context can exist. The secret token in the URL is the
// authorisation, and it is matched against the signed-in identity by the
// database in app.accept_invitation when the form is submitted.
import { db } from "@/db";
import { organizationInvitations, organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { acceptInvitationAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Surfaces";

// Authenticated page: reads session cookies and tenant context at request time.
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const user = await getCurrentUser();

  const [invitation] = await db.select().from(organizationInvitations).where(eq(organizationInvitations.token, token)).limit(1);
  const org = invitation ? (await db.select().from(organizations).where(eq(organizations.id, invitation.orgId)).limit(1))[0] : null;

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-canvas)] px-6">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-[var(--shadow-md)]">
        {!invitation || !org ? (
          <>
            <h1 className="font-display text-[20px] font-semibold text-[var(--color-ink)]">Invitation not found</h1>
            <p className="mt-2 text-[13.5px] text-[var(--color-muted)]">This invitation link is invalid or has expired.</p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">Workspace invitation</p>
            <h1 className="mt-2 font-display text-[20px] font-semibold text-[var(--color-ink)]">Join {org.name}</h1>
            <p className="mt-2 text-[13.5px] text-[var(--color-muted)]">
              You've been invited as <strong>{invitation.role}</strong> to work with {invitation.email}.
            </p>
            {error && (
              <div className="mt-4 text-left">
                <Alert tone="danger">{error}</Alert>
              </div>
            )}
            <div className="mt-6">
              {user ? (
                <form action={acceptInvitationAction}>
                  <input type="hidden" name="token" value={token} />
                  <Button type="submit" className="w-full" size="lg">
                    Accept invitation
                  </Button>
                </form>
              ) : (
                <div className="space-y-2">
                  <Link href="/login" className="block w-full rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-4 py-3 text-[14px] font-medium text-white">
                    Log in to accept
                  </Link>
                  <Link href="/signup" className="block w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-4 py-3 text-[14px] font-medium text-[var(--color-ink)]">
                    Create an account
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
