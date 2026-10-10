"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sidebar } from "@/components/app/Sidebar";

export function MobileSidebar({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener("change", onBreakpointChange);
    return () => desktop.removeEventListener("change", onBreakpointChange);
  }, []);

  // Lock background page scroll while the drawer is open; close on Escape.
  // No dependency: a single effect restoring the previous overflow value.
  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex=\"-1\"])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  return (
    <div className="shrink-0 lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="workflow-mobile-navigation"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--color-border-strong)] text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex" role="presentation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 cursor-default bg-[rgba(4,12,24,0.42)]" onClick={close} />
          <div
            ref={drawerRef}
            id="workflow-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Workflow navigation"
            className="relative z-10 flex h-full w-[min(84vw,320px)] max-w-full flex-col bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] shadow-xl"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
              aria-label="Close navigation"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
            <Sidebar isPlatformAdmin={isPlatformAdmin} asMobile onNavigate={close} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
