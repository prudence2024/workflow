import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAdminAccess } from "@/lib/admin-authorization.server";
import { adminLogSecurityEvent } from "@/lib/admin/server-fns";
import DashboardLayout from "@/components/dashboard/layout";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async ({ location }) => {
    // Both serverFns resolve the caller's identity independently from Clerk, so
    // they are started concurrently: awaiting them in series added a whole
    // extra round-trip to EVERY dashboard navigation (measured live: ~1.0s
    // getAdminAccess + ~0.6s adminGetMyPermissions, serial). Each endpoint
    // still enforces its own server-side authorization — this only removes the
    // client-side waterfall, not a check.
    const permissionsPromise = import("@/lib/admin/server-fns")
      .then((m) => m.adminGetMyPermissions())
      .then((res) => res.permissions || [])
      .catch(() => [] as string[]);

    const access = await getAdminAccess();

    if (access.status === "authorized") {
      // NOTE: Do NOT log "admin_session_started" here — beforeLoad runs on
      // every dashboard navigation, which would create false login events.
      // Actual login/logout tracking is handled by Clerk webhooks and the
      // dedicated login page check in the sidebar/layout component.
      //
      // Permissions for RBAC content filtering — already in flight above.
      // A failed fetch leaves permissions empty; admin access stays valid.
      const permissions = await permissionsPromise;
      return { admin: access, permissions };
    }

    // DENIED — log security event (single logging point for the dashboard boundary).
    if (access.status === "forbidden") {
      const action =
        access.reason === "inactive" ? "inactive_admin_access" : "unauthorized_admin_access";
      adminLogSecurityEvent({
        data: {
          action,
          metadata: {
            reason: access.reason || "not_in_admin_users",
            result: "blocked",
            route: location.pathname,
            method: "GET",
            role: access.role || null,
          },
        },
      }).catch(() => {});
      throw redirect({ to: "/admin/unauthorized" });
    }

    if (access.status === "setup_required")
      throw redirect({ to: "/admin/unavailable", search: { reason: "setup" } });
    if (access.status === "unconfigured" || access.status === "unavailable")
      throw redirect({ to: "/admin/unavailable", search: { reason: access.status } });
    if (access.status === "network_unavailable")
      throw redirect({
        to: "/admin/unavailable",
        search: { reason: "network" as const },
      });
    // Carry the requested destination so the login route can return the user
    // to the page they asked for once the session is (re-)established —
    // without it, a deep link resolved during a session hand-off landed on
    // the dashboard instead. The login route validates this value.
    throw redirect({
      href: `/admin/login/$?redirect=${encodeURIComponent(location.href)}`,
    });
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}
