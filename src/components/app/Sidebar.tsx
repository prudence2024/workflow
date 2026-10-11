"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactElement } from "react";
import { cn } from "@/lib/utils";
import { BrandLockup, BrandMark } from "@/components/brand/Logo";

const ICONS: Record<string, ReactElement> = {
  dashboard: (
    <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zM14 3h7v7h-7V3zm0 11h7v7h-7v-7z" />
  ),
  contacts: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" />,
  campaigns: <path d="M3 11l18-7-7 18-2-8-9-3z" />,
  imports: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />,
  downloads: <path d="M5 4h14v16H5V4zm3 4h8m-8 4h8m-8 4h5" />,
  templates: <path d="M4 4h16v16H4V4zm4 4h8m-8 4h8m-8 4h5" />,
  communications: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  forms: <path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h4" />,
  reports: <path d="M4 20V10m6 10V4m6 16v-7" />,
  billing: <path d="M4 6h16v12H4V6zm3 3h.01M7 12h.01M7 15h.01M11 15h6M11 12h6" />,
  help: <path d="M9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 1.8-2.5 3.5M12 17h.01M12 22a10 10 0 100-20 10 10 0 000 20z" />,
  settings: (
    <path d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34H9a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V9c.26.604.852 1 1.51 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.51 1z" />
  ),
  admin: <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/contacts", label: "Records", icon: "contacts" },
  { href: "/form-operations", label: "Forms", icon: "forms" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/imports", label: "Imports", icon: "imports" },
  { href: "/communications", label: "Communications", icon: "communications" },
  { href: "/downloads", label: "Downloads", icon: "downloads" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/settings/usage", label: "Billing", icon: "billing" },
  { href: "/settings/organization", label: "Settings", icon: "settings" },
  { href: "/help", label: "Help and guide", icon: "help" },
];

const SIDEBAR_STORAGE_KEY = "workflow:sidebar-collapsed";
const SIDEBAR_CHANGE_EVENT = "workflow:sidebar-collapsed-change";

function subscribeSidebarPreference(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, listener);
  };
}

function readSidebarPreference(): boolean {
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

export function Sidebar({ isPlatformAdmin, asMobile = false, onNavigate }: { isPlatformAdmin: boolean; asMobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const storedCollapsed = useSyncExternalStore(subscribeSidebarPreference, readSidebarPreference, () => false);
  const collapsed = asMobile ? false : storedCollapsed;

  function toggleCollapsed() {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!storedCollapsed));
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
  }

  return (
    <aside
      className={cn(
        "shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200",
        // Desktop: stay pinned while page content scrolls; the nav area scrolls
        // internally when it exceeds the viewport. Mobile drawer keeps h-full
        // inside its fixed container (never sticky).
        asMobile ? "flex h-full w-full" : collapsed ? "hidden w-[72px] lg:sticky lg:top-0 lg:h-screen lg:flex" : "hidden w-[228px] lg:sticky lg:top-0 lg:h-screen lg:flex",
      )}
    >
      <div className={cn("relative flex h-16 items-center border-b border-[var(--color-border)]", collapsed && !asMobile ? "justify-center px-2" : "justify-between px-5")}>
        {collapsed && !asMobile ? <button type="button" onClick={toggleCollapsed} className="-translate-y-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]" aria-label="Expand sidebar"><BrandMark size={28} /></button> : <BrandLockup href="/dashboard" size={28} />}
        {!asMobile && (
          !collapsed && <button type="button" onClick={toggleCollapsed} aria-label="Collapse sidebar" aria-pressed={false} title="Collapse sidebar" className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]"><Chevron direction="left" /></button>
        )}
      </div>
      <nav className={cn("min-h-0 flex-1 space-y-1 overflow-y-auto py-4", collapsed && !asMobile ? "px-2" : "px-3")}>
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed && !asMobile ? item.label : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13.5px] font-medium transition-colors",
                collapsed && !asMobile && "justify-center px-2",
                active
                  ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]",
              )}
            >
              <span data-nav-icon={item.icon} className={cn("sidebar-icon shrink-0 transition-transform duration-200", item.icon === "imports" && "group-hover:translate-y-0.5 group-focus-visible:translate-y-0.5", item.icon === "campaigns" && "group-hover:-translate-y-0.5 group-focus-visible:-translate-y-0.5", item.icon === "settings" && "group-hover:rotate-12 group-focus-visible:rotate-12", item.icon === "dashboard" && "group-hover:scale-105 group-focus-visible:scale-105", item.icon === "contacts" && "group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5", item.icon === "communications" && "group-hover:-translate-x-0.5 group-focus-visible:-translate-x-0.5", item.icon === "reports" && "group-hover:scale-y-110 group-focus-visible:scale-y-110", item.icon === "forms" && "group-hover:-rotate-3 group-focus-visible:-rotate-3", item.icon === "templates" && "group-hover:rotate-3 group-focus-visible:rotate-3", "motion-reduce:transform-none motion-reduce:transition-none") }><Icon name={item.icon} /></span>
              <span className={cn(collapsed && !asMobile && "sr-only")}>{item.label}</span>
            </Link>
          );
        })}
        {isPlatformAdmin && (
          <>
            <div className="my-2 h-px bg-[var(--color-border)]" />
            <Link
              href="/platform-admin"
              onClick={onNavigate}
              title={collapsed && !asMobile ? "Platform Admin" : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13.5px] font-medium transition-colors",
                collapsed && !asMobile && "justify-center px-2",
                pathname.startsWith("/platform-admin")
                  ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]",
              )}
            >
              <span className="transition-transform duration-200 group-hover:scale-105"><Icon name="admin" /></span>
              <span className={cn(collapsed && !asMobile && "sr-only")}>Platform Admin</span>
            </Link>
          </>
        )}
      </nav>
      <div className={cn("border-t border-[var(--color-border)]", collapsed && !asMobile ? "p-2" : "p-4")}>
        <Link href="/settings/usage" onClick={onNavigate} title={collapsed && !asMobile ? "Usage and plan" : undefined} className={cn("block rounded-[var(--radius-sm)] bg-[var(--color-canvas)] p-3", collapsed && !asMobile && "flex justify-center text-[var(--color-ink-soft)]")}>
          <p className={cn("text-[11.5px] font-semibold text-[var(--color-ink-soft)]", collapsed && !asMobile && "sr-only")}>Usage this month</p>
          <p className={cn("mt-0.5 text-[11.5px] text-[var(--color-muted)]", collapsed && !asMobile && "sr-only")}>View limits</p>
          {collapsed && !asMobile && <><Icon name="reports" /><span className="sr-only">View usage limits</span></>}
        </Link>
      </div>
    </aside>
  );
}
