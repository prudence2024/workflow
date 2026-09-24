import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAdminAccess } from "@/lib/admin-authorization.server";

export const Route = createFileRoute("/admin/")({
  beforeLoad: async () => {
    const access = await getAdminAccess();
    if (access.status === "authorized") {
      throw redirect({ to: "/dashboard" });
    }
    // Unauthorized users should be at /admin/login
    throw redirect({ href: "/admin/login/$" });
  },
  component: () => null,
});
