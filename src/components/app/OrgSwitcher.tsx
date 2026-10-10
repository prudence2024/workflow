"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { switchOrgAction } from "@/app/(app)/actions";
import { cn, initials } from "@/lib/utils";
import type { OrgMembership } from "@/lib/auth";

export function OrgSwitcher({ orgs, currentOrgId }: { orgs: OrgMembership[]; currentOrgId: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const current = orgs.find((o) => o.orgId === currentOrgId) ?? orgs[0];

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>("button[role=menuitem]");
      if (!items?.length) return;
      event.preventDefault();
      const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === "ArrowDown"
        ? (currentIndex + 1 + items.length) % items.length
        : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex].focus();
    };

    document.addEventListener("keydown", onKeyDown);
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>("button[role=menuitem]");
    firstItem?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="relative min-w-0 max-w-full">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label={`Switch workspace. Current workspace: ${current?.orgName ?? "none"}`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-w-0 max-w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-left text-[var(--color-ink)] hover:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[var(--color-brand-soft)] text-[10.5px] font-semibold text-[var(--color-brand-strong)]">
          {initials(current?.orgName ?? "")}
        </span>
        <span className="min-w-0 max-w-[88px] flex-1 truncate text-[13px] font-medium text-[var(--color-ink)] min-[400px]:max-w-[130px]">{current?.orgName}</span>
        <svg className="shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div ref={menuRef} role="menu" aria-label="Workspaces" className="fixed inset-x-2 z-20 mt-2 w-auto max-w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1.5 text-[var(--color-ink)] shadow-[var(--shadow-md)] sm:absolute sm:left-0 sm:right-auto sm:w-64">
            <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Workspaces
            </p>
            {orgs.map((org) => (
              <form
                key={org.orgId}
                action={async (fd) => {
                  await switchOrgAction(fd);
                  // Keep the form mounted until the server action has settled.
                  // Closing the menu before submission completes can detach the
                  // native form and trigger the browser's disconnected-form
                  // warning instead of switching workspaces.
                  setOpen(false);
                  router.refresh();
                }}
              >
                <input type="hidden" name="orgId" value={org.orgId} />
                <button
                  type="submit"
                  role="menuitem"
                  tabIndex={-1}
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
