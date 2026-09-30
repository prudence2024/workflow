"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import { BrandLockup } from "@/components/brand/Logo";

const ICONS: Record<string, ReactElement> = {
  dashboard: (
    <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zM14 3h7v7h-7V3zm0 11h7v7h-7v-7z" />
  ),
  contacts: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" />,
  campaigns: <path d="M3 11l18-7-7 18-2-8-9-3z" />,
  imports: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />,
  templates: <path d="M4 4h16v16H4V4zm4 4h8m-8 4h8m-8 4h5" />,
  communications: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  forms: <path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h4" />,
  reports: <path d="M4 20V10m6 10V4m6 16v-7" />,
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

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/contacts", label: "Records", icon: "contacts" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/imports", label: "Imports", icon: "imports" },
  { href: "/communications", label: "Communications", icon: "communications" },
  { href: "/form-operations", label: "Form operations", icon: "forms" },
  { href: "/templates", label: "Templates", icon: "templates" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/settings/organization", label: "Settings", icon: "settings" },
];

export function Sidebar({ isPlatformAdmin, asMobile = false }: { isPlatformAdmin: boolean; asMobile?: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "w-[228px] shrink-0 flex-col border-r border-[var(--color-border)] bg-white",
        asMobile ? "flex h-full" : "hidden lg:flex",
      )}
    >
      <div className="flex h-16 items-center border-b border-[var(--color-border)] px-5">
        <BrandLockup href="/dashboard" size={28} />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]",
              )}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
        {isPlatformAdmin && (
          <>
            <div className="my-2 h-px bg-[var(--color-border)]" />
            <Link
              href="/platform-admin"
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13.5px] font-medium transition-colors",
                pathname.startsWith("/platform-admin")
                  ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]",
              )}
            >
              <Icon name="admin" />
              Platform Admin
            </Link>
          </>
        )}
      </nav>
      <div className="border-t border-[var(--color-border)] p-4">
        <Link href="/settings/usage" className="block rounded-[var(--radius-sm)] bg-[var(--color-canvas)] p-3">
          <p className="text-[11.5px] font-semibold text-[var(--color-ink-soft)]">Usage this month</p>
          <p className="mt-0.5 text-[11.5px] text-[var(--color-muted)]">View limits →</p>
        </Link>
      </div>
    </aside>
  );
}
