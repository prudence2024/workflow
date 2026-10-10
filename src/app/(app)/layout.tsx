import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getRequestWorkspaceContext } from "@/lib/requestContext";
import { authMode, hasClerkSessionHint } from "@/lib/auth";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { WorkflowAiPanel } from "@/components/app/WorkflowAiPanel";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, orgs, currentOrg } = await getRequestWorkspaceContext();
  if (!user) {
    // The cookie is only a routing hint. /auth/complete still requires the
    // trusted server status endpoint before allowing any protected page.
    if (authMode() === "clerk" && await hasClerkSessionHint()) {
      redirect(`/auth/complete?next=${encodeURIComponent("/dashboard")}`);
    }
    redirect("/login");
  }
  if (orgs.length === 0 || !currentOrg) redirect("/onboarding");
  if (!user.profileComplete) redirect("/profile-completion?next=/dashboard");


  return (
    <div className="flex min-h-screen w-full min-w-0 max-w-full">
      <Sidebar isPlatformAdmin={user.isPlatformAdmin} />
      {/* min-w-0 lets this flex child shrink below its content's intrinsic
          width — without it, wide tables/cards force whole-page horizontal
          scroll. Tables keep their own overflow-x-auto wrappers. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar user={user} orgs={orgs} currentOrg={currentOrg} isPlatformAdmin={user.isPlatformAdmin} />
        <main className="min-w-0 w-full max-w-full flex-1 bg-[var(--color-canvas)] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <WorkflowAiPanel />
      </div>
    </div>
  );
}
