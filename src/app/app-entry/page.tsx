import { redirect } from "next/navigation";
import { getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { hasPendingInvitationsForEmail } from "@/lib/data";
import { resolvePostAuthRoute } from "@/lib/postAuthRouting";

/**
 * Application-owned entry point for the isolated TWA experiment.
 *
 * This route deliberately renders no UI. It resolves the same trusted Clerk,
 * membership, invitation and profile state used by the existing application
 * and redirects into the existing signup, onboarding, profile-completion or
 * dashboard routes.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppEntryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signup");

  const organizations = await getUserOrganizations(user);
  const hasPendingInvitation = organizations.length === 0
    ? await hasPendingInvitationsForEmail(user.email)
    : false;

  redirect(
    resolvePostAuthRoute({
      authenticated: true,
      hasPendingInvitation,
      hasWorkspace: organizations.length > 0,
      profileComplete: user.profileComplete,
    }),
  );
}
