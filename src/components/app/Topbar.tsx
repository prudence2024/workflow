import { OrgSwitcher } from "@/components/app/OrgSwitcher";
import { UserMenu } from "@/components/app/UserMenu";
import { RoleBadge } from "@/components/ui/Status";
import type { OrgMembership, CurrentUser } from "@/lib/auth";
import { MobileSidebar } from "@/components/app/MobileSidebar";
import { canonicalPlanKey } from "@/lib/plans";

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
    <header className="sticky top-0 z-30 flex h-16 min-w-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-white/90 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <MobileSidebar isPlatformAdmin={isPlatformAdmin} />
        <OrgSwitcher orgs={orgs} currentOrgId={currentOrg.orgId} />
        {/* Role badge is non-essential chrome at phone widths — hiding it
            below ~480px keeps the switcher + account menu clear of overflow. */}
        <span className="hidden min-[480px]:inline-flex">
          <RoleBadge role={currentOrg.role} />
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-[12.5px] text-[var(--color-muted)] sm:inline">{canonicalPlanKey(currentOrg.planKey).toUpperCase()} plan</span>
        <UserMenu name={user.name} email={user.email} />
      </div>
    </header>
  );
}
