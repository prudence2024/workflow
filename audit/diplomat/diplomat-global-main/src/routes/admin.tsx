import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAdminAccess } from "@/lib/admin-authorization.server";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    const access = await getAdminAccess();

    if (access.status === "authorized") {
      throw redirect({ to: "/dashboard" });
    }

    // Forbidden (has Clerk session but not admin): show access-denied page,
    // not the login page. Prevents confusion where authenticated non-admin
    // users see <SignIn> showing their already-authenticated account.
    if (access.status === "forbidden") {
      throw redirect({ to: "/admin/unauthorized" });
    }

    // Unauthenticated / unconfigured / unavailable / setup_required:
    // let child routes (login, unavailable) handle rendering.
  },
  component: AdminLayout,
});

function AdminLayout() {
  return <Outlet />;
}
