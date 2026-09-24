import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  // generic
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  active: "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
  // campaign
  ready: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20",
  running: "bg-[var(--color-brand-soft)] text-[var(--color-brand)] border-[var(--color-brand)]/20",
  paused: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/20",
  completed: "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20",
  // submissions
  queued: "bg-slate-100 text-slate-600 border-slate-200",
  processing: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20 animate-pulse-dot",
  successful: "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20",
  failed: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20",
  skipped: "bg-slate-100 text-slate-500 border-slate-200",
  retrying: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/20",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  human_action_required: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/20",
  // imports
  uploaded: "bg-slate-100 text-slate-600 border-slate-200",
  mapped: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20",
  validated: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20",
  imported: "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20",
  // messages
  sent: "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20",
  delivered: "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20",
};

function labelize(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold leading-none",
        style,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labelize(status)}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-white px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
      {role}
    </span>
  );
}
