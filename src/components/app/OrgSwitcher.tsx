"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { switchOrgAction } from "@/app/(app)/actions";
import { cn, initials } from "@/lib/utils";
import type { OrgMembership } from "@/lib/auth";

export function OrgSwitcher({ orgs, currentOrgId }: { orgs: OrgMembership[]; currentOrgId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const current = orgs.find((o) => o.orgId === currentOrgId) ?? orgs[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-left hover:border-[var(--color-brand)]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[var(--color-ink)] text-[10.5px] font-semibold text-white">
          {initials(current?.orgName ?? "")}
        </span>
        <span className="max-w-[88px] truncate text-[13px] font-medium text-[var(--color-ink)] min-[400px]:max-w-[130px]">{current?.orgName}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-2 w-64 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-md)]">
            <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Workspaces
            </p>
            {orgs.map((org) => (
              <form
                key={org.orgId}
                action={async (fd) => {
                  setOpen(false);
                  await switchOrgAction(fd);
                  router.refresh();
                }}
              >
                <input type="hidden" name="orgId" value={org.orgId} />
                <button
                  type="submit"
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] hover:bg-[var(--color-canvas)]",
                    org.orgId === currentOrgId && "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
                  )}
                >
                  <span className="truncate font-medium">{org.orgName}</span>
                  <span className="text-[11px] uppercase text-[var(--color-muted)]">{org.role}</span>
                </button>
              </form>
            ))}
            <div className="mt-1 border-t border-[var(--color-border)] pt-1">
              <Link
                href="/onboarding"
                onClick={() => setOpen(false)}
                className="block rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] font-medium text-[var(--color-brand)] hover:bg-[var(--color-canvas)]"
              >
                + Create workspace
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
