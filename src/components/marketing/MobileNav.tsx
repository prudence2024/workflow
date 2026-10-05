"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function MobileNav({ links, loggedIn }: { links: { href: string; label: string }[]; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        aria-label="Toggle navigation menu"
        aria-expanded={open}
        aria-controls="marketing-mobile-menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border-strong)] text-[var(--color-ink)]"
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {open && (
        <div id="marketing-mobile-menu" className="absolute inset-x-0 top-16 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4 shadow-[var(--shadow-md)]">
          <nav className="flex flex-col gap-3">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="py-1.5 text-[14px] font-medium text-[var(--color-ink-soft)]" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
              <ThemeToggle />
              {loggedIn ? (
                <Link href="/dashboard" className="rounded-md bg-[var(--color-brand)] px-4 py-2 text-center text-[14px] font-medium text-white">
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className="py-1.5 text-center text-[14px] font-medium text-[var(--color-ink-soft)]">
                    Log in
                  </Link>
                  <Link href="/signup" className="rounded-md bg-[var(--color-brand)] px-4 py-2 text-center text-[14px] font-medium text-white">
                    Start free
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
