import { OrgSwitcher } from "@/components/app/OrgSwitcher";
import { UserMenu } from "@/components/app/UserMenu";
import { RoleBadge } from "@/components/ui/Status";
import type { OrgMembership, CurrentUser } from "@/lib/auth";
import { MobileSidebar } from "@/components/app/MobileSidebar";

export function Topbar({
  user,
  orgs,
  currentOrg,
  isPlatformAdmin,
}: {
  user: CurrentUser;
  orgs: OrgMembership[];
  currentOrg: OrgMembership;
  isPlatformAdmin: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-white/90 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <MobileSidebar isPlatformAdmin={isPlatformAdmin} />
        <OrgSwitcher orgs={orgs} currentOrgId={currentOrg.orgId} />
        <RoleBadge role={currentOrg.role} />
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-[12.5px] text-[var(--color-muted)] sm:inline">{currentOrg.planKey.toUpperCase()} plan</span>
        <UserMenu name={user.name} email={user.email} />
      </div>
    </header>
  );
}
