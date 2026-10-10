"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/organization", label: "Organization" },
  { href: "/settings/fields", label: "Custom fields" },
  { href: "/settings/usage", label: "Usage & plan" },
  { href: "/billing/receipts", label: "Billing & receipts" },
  { href: "/settings/account", label: "Account" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors",
              active
                ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
