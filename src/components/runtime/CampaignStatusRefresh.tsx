"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type CampaignStatusRefreshProps = {
  campaignId: string;
  active: boolean;
};

/**
 * Polls a small tenant-scoped status response while work is in flight. The
 * full campaign RSC is refreshed once, after the worker reaches a terminal
 * state, rather than on every interval.
 */
export function CampaignStatusRefresh({ campaignId, active }: CampaignStatusRefreshProps) {
  const router = useRouter();
  const pollInFlight = useRef(false);
  const terminalRefreshRequested = useRef(false);
  const [snapshot, setSnapshot] = useState<{ active: boolean; activeRecords: number } | null>(null);

  const poll = useCallback(async () => {
    if (document.visibilityState === "hidden" || pollInFlight.current) return;
    pollInFlight.current = true;
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/status`, { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as { active?: boolean; activeRecords?: number };
      const nextActive = Boolean(next.active);
      setSnapshot({ active: nextActive, activeRecords: Number(next.activeRecords ?? 0) });
      if (!nextActive && active && !terminalRefreshRequested.current) {
        terminalRefreshRequested.current = true;
        router.refresh();
      }
    } catch {
      // A transient status failure must not turn into an unhandled client
      // exception or trigger a full RSC request. The next interval retries.
    } finally {
      pollInFlight.current = false;
    }
  }, [active, campaignId, router]);

  useEffect(() => {
    if (!active) return;
    const initialPoll = window.setTimeout(() => void poll(), 0);
    const interval = window.setInterval(() => void poll(), 5000);
    return () => {
      window.clearTimeout(initialPoll);
      window.clearInterval(interval);
    };
  }, [active, poll]);

  const currentActive = snapshot?.active ?? active;
  const activeRecords = snapshot?.activeRecords;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-muted)]" aria-live="polite">
      <span>{currentActive ? `Updating status while the worker runs${typeof activeRecords === "number" ? ` · ${activeRecords} active` : ""}…` : "Status is current."}</span>
      <button
        type="button"
        onClick={() => {
          if (active) void poll();
          else router.refresh();
        }}
        className="font-medium text-[var(--color-brand)] hover:underline"
      >
        Refresh status
      </button>
    </div>
  );
}
