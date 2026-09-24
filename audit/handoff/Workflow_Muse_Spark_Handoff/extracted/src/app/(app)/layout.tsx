import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const orgs = await getUserOrganizations(user.id);
  if (orgs.length === 0) redirect("/onboarding");

  const currentOrg = await getCurrentOrg(user.id);
  if (!currentOrg) redirect("/onboarding");

  return (
    <div className="flex min-h-screen">
      <Sidebar isPlatformAdmin={user.isPlatformAdmin} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar user={user} orgs={orgs} currentOrg={currentOrg} isPlatformAdmin={user.isPlatformAdmin} />
        <main className="flex-1 bg-[var(--color-canvas)] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
