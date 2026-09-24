"use client";

import { useState } from "react";
import { Sidebar } from "@/components/app/Sidebar";

export function MobileSidebar({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border-strong)] text-[var(--color-ink)]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex h-full w-[240px] flex-col bg-white shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted)]"
              aria-label="Close navigation"
            >
              ✕
            </button>
            <Sidebar isPlatformAdmin={isPlatformAdmin} asMobile />
          </div>
        </div>
      )}
    </div>
  );
}
