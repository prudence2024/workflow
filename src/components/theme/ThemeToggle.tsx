"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();
  const handleChange = (value: string) => {
    if (value === "light" || value === "dark" || value === "system") setMode(value);
  };
  return (
    <label className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--color-ink-soft)]">
      <span aria-hidden="true" className="text-[14px]">{mode === "dark" ? "☾" : mode === "light" ? "☀" : "◐"}</span>
      {!compact && <span className="sr-only sm:not-sr-only">Theme</span>}
      <select
        aria-label="Theme"
        value={mode}
        onChange={(event) => handleChange(event.currentTarget.value)}
        onInput={(event) => handleChange(event.currentTarget.value)}
        className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[12px] text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand-soft)]"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
