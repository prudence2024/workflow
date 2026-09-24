"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { initials } from "@/lib/utils";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-brand)] text-[12.5px] font-semibold text-white"
        aria-label="Account menu"
      >
        {initials(name)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-md)]">
            <div className="px-2.5 py-2">
              <p className="truncate text-[13px] font-semibold text-[var(--color-ink)]">{name}</p>
              <p className="truncate text-[11.5px] text-[var(--color-muted)]">{email}</p>
            </div>
            <div className="border-t border-[var(--color-border)] pt-1">
              <Link href="/settings/account" onClick={() => setOpen(false)} className="block rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)]">
                Account settings
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="block w-full rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]">
                  Log out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
