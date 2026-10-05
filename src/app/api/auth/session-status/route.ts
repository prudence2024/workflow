import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * A deliberately small readiness probe. It exposes no identity, token, or
 * profile data; the browser only learns whether the trusted server path is
 * ready to accept the next navigation.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json(
      { authenticated: Boolean(user), userReady: Boolean(user) },
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
