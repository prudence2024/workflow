import { SignIn, useUser } from "@clerk/tanstack-react-start";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { getAdminAccess } from "@/lib/admin-authorization.server";
import { resolveAdminRedirectTarget } from "@/lib/admin/redirect-target";
import { AdminAuthShell } from "@/components/admin-auth-shell";

const searchSchema = z.object({
  // Requested post-login destination, carried by the dashboard guard. Only a
  // safe internal path is ever honored (see resolveAdminRedirectTarget).
  redirect: z.string().max(512).optional(),
});

export const Route = createFileRoute("/admin/login/$")({
  validateSearch: searchSchema,
  beforeLoad: async ({ location }) => {
    // Authorization check — NOT mere authentication.
    // A valid Clerk session does NOT grant admin access; the user must also
    // have an active admin_users row with a valid role.
    //
    // Reuses the same centralized getAdminAccess() used by /dashboard and
    // the /admin layout, so authorization rules are never duplicated.
    //
    // States:
    //   authorized       → redirect to /dashboard (user is already an admin)
    //   forbidden        → show login page (Clerk session exists but user is
    //                       not in admin_users; the SignIn component will
    //                       handle sign-out / different account)
    //   unauthenticated  → show login page (no Clerk session)
    //   unconfigured / unavailable / setup_required → show login page
    try {
      const access = await getAdminAccess();
      const destination = resolveAdminRedirectTarget(
        (location.search as { redirect?: string }).redirect,
      );
      if (access.status === "authorized") {
        throw redirect({ href: destination });
      }
      // All other states: render the login page. Do NOT redirect a
      // forbidden/unauthenticated user to /dashboard.
    } catch (err) {
      // Re-throw TanStack Router redirects (expected)
      if (err && typeof err === "object" && "isRedirect" in err) throw err;
      // If getAdminAccess() itself fails, render the login page
    }
  },
  head: () => ({
    meta: [
      { title: "Admin login — Diplomat Global" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const configured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  const { isSignedIn, isLoaded } = useUser();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const destination = resolveAdminRedirectTarget(redirect);

  // If the user is already signed in on the client, redirect immediately
  // instead of rendering <SignIn /> which causes a Clerk warning and flash.
  // The server beforeLoad handles the case where the user is authorized;
  // this handles the case where the client picks up the session after SSR
  // rendered the page as unauthenticated.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    // Common case: honor the default dashboard via the SPA router. When the
    // user arrived from a deep link, do a document navigation so the server
    // re-authorizes the requested route with the now-established session.
    if (destination === "/dashboard") {
      navigate({ to: "/dashboard", replace: true });
    } else {
      window.location.replace(destination);
    }
  }, [isLoaded, isSignedIn, destination, navigate]);

  // Don't render SignIn until Clerk has loaded — show branded skeleton
  // that matches the Clerk form layout to prevent CLS.
  if (!isLoaded) {
    return (
      <AdminAuthShell
        eyebrow="Administration"
        title="Secure administrator access"
        description="Authentication is handled by Clerk. Database permissions are verified separately before the dashboard opens."
      >
        <div className="space-y-4 animate-pulse">
          {/* Email input skeleton */}
          <div>
            <div className="mb-1.5 h-4 w-24 rounded bg-muted/60" />
            <div className="h-11 w-full rounded-xl border border-border bg-surface" />
          </div>
          {/* Password input skeleton */}
          <div>
            <div className="mb-1.5 h-4 w-28 rounded bg-muted/60" />
            <div className="h-11 w-full rounded-xl border border-border bg-surface" />
          </div>
          {/* Submit button skeleton */}
          <div className="h-11 w-full rounded-xl bg-brand/20" />
          {/* Forgot password link skeleton */}
          <div className="h-4 w-32 rounded bg-muted/40" />
        </div>
      </AdminAuthShell>
    );
  }

  // Already signed in — redirect is happening, show minimal state
  if (isSignedIn) {
    return (
      <AdminAuthShell
        eyebrow="Administration"
        title="Secure administrator access"
        description="Redirecting to dashboard…"
      >
        <div className="flex justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-brand" />
        </div>
      </AdminAuthShell>
    );
  }

  return (
    <AdminAuthShell
      eyebrow="Administration"
      title="Secure administrator access"
      description="Authentication is handled by Clerk. Database permissions are verified separately before the dashboard opens."
    >
      {configured ? (
        <div className="flex justify-center">
          <SignIn routing="path" path="/admin/login" forceRedirectUrl="/dashboard" />
        </div>
      ) : (
        <div
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6"
        >
          Clerk is not configured yet. Add the Clerk publishable and secret keys to the Preview
          environment before testing administrator sign-in.
        </div>
      )}
    </AdminAuthShell>
  );
}
