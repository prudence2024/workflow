import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: { direction: "up" | "down" | "flat"; label: string };
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-xs)]">
      <p className="text-[12.5px] font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="mt-2 font-mono-data font-display text-[28px] font-semibold leading-none text-[var(--color-ink)]">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              "text-[12px] font-semibold",
              trend.direction === "up" && "text-[var(--color-success)]",
              trend.direction === "down" && "text-[var(--color-danger)]",
              trend.direction === "flat" && "text-[var(--color-muted)]",
            )}
          >
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.label}
          </span>
        )}
        {hint && <span className="text-[12px] text-[var(--color-muted)]">{hint}</span>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = "brand" }: { value: number; tone?: "brand" | "success" | "warning" | "danger" }) {
  const toneMap = {
    brand: "bg-[var(--color-brand)]",
    success: "bg-[var(--color-success)]",
    warning: "bg-[var(--color-warning)]",
    danger: "bg-[var(--color-danger)]",
  } as const;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", toneMap[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function DistributionBar({
  segments,
}: {
  segments: { value: number; color: string; label: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
        {segments.map(
          (s, i) =>
            s.value > 0 && (
              <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} className="h-full" />
            ),
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[12px] text-[var(--color-ink-soft)]">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="font-mono-data font-medium text-[var(--color-ink)]">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] font-display font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full border-collapse text-left text-[13.5px]">{children}</table>
    </div>
  );
}

// THead renders its own <tr>: pass <TH> cells directly, never a <TR>
// (a <tr> inside <tr> breaks hydration). Body rows use <TR> inside <tbody>.
export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[var(--color-border)] text-[11.5px] uppercase tracking-wide text-[var(--color-muted)]">
        {children}
      </tr>
    </thead>
  );
}

export function TH({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap px-4 py-3 font-semibold", className)}>{children}</th>;
}

export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-4 py-3.5 align-middle", className)}>{children}</td>;
}

export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn("border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-canvas)]/60", className)}>
      {children}
    </tr>
  );
}
