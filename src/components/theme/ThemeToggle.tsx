"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";

function ThemeIcon({ mode }: { mode: "light" | "dark" | "system" }) {
  if (mode === "light") {
    return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="3.2" /><path strokeLinecap="round" d="M10 2v2M10 16v2M2 10h2M16 10h2M4.34 4.34l1.42 1.42M14.24 14.24l1.42 1.42M15.66 4.34l-1.42 1.42M5.76 14.24l-1.42 1.42" /></svg>;
  }
  if (mode === "dark") {
    return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.8 12.7A6.8 6.8 0 0 1 7.3 3.2 6.8 6.8 0 1 0 16.8 12.7Z" /></svg>;
  }
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="14" height="10" rx="1.5" /><path strokeLinecap="round" d="M7 17h6M10 14v3" /></svg>;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const options = [
    ["system", "System"],
    ["light", "Light"],
    ["dark", "Dark"],
  ] as const;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Theme: ${mode}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Theme: ${mode}`}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] ${compact ? "w-9 px-0" : ""}`}
      >
        <ThemeIcon mode={mode} />
        {!compact && <span className="text-[12px] font-medium">{mode[0].toUpperCase() + mode.slice(1)}</span>}
      </button>
      {open && (
        <div role="menu" aria-label="Theme preference" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-32 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-lg)]">
          {options.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={mode === value}
              onClick={() => { setMode(value); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[12px] text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
            >
              <ThemeIcon mode={value} />
              <span>{label}</span>
              {mode === value && <span className="ml-auto text-[var(--color-brand)]" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
