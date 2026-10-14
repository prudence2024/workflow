import { getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { pendingInvitationsForEmail } from "@/lib/data";
import { resolvePostAuthRoute } from "@/lib/postAuthRouting";

export const dynamic = "force-dynamic";

/**
 * A deliberately small readiness probe. It exposes no identity, token, or
 * profile data; the browser only learns whether the trusted server path is
 * ready to accept the next navigation.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json(
        { authenticated: false, userReady: false, destination: "/login" },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        },
      );
    }

    const organizations = await getUserOrganizations(user);
    const pendingInvitations = organizations.length === 0
      ? await pendingInvitationsForEmail(user.email)
      : [];
    const destination = resolvePostAuthRoute({
      authenticated: true,
      hasPendingInvitation: pendingInvitations.length > 0,
      hasWorkspace: organizations.length > 0,
      profileComplete: user.profileComplete,
    });
    return Response.json(
      { authenticated: true, userReady: true, destination },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch {
    // Operational Clerk errors are already sanitized and logged by auth.ts.
    // A 503 lets the bounded client retry without treating the request as a
    // definitive sign-out.
    return Response.json(
      { authenticated: false, userReady: false },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
