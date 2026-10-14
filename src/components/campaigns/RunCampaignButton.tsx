"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const REQUEST_TIMEOUT_MS = 20_000;

export function RunCampaignButton({
  campaignId,
  disabled,
  label,
}: {
  campaignId: string;
  disabled: boolean;
  label: string;
}) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [state, setState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    setState("pending");
    setMessage(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/run`, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as { success?: boolean; error?: string; queuedCount?: number } | null;
      if (!response.ok || !body?.success) throw new Error(body?.error || "Campaign could not be queued safely.");
      setState("success");
      setMessage(`Run started — ${String(body.queuedCount ?? 0)} record(s) queued.`);
      router.refresh();
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      setState("error");
      setMessage(timedOut ? "Queue request timed out. Check campaign status before trying again." : error instanceof Error ? error.message : "Campaign could not be queued safely.");
      busyRef.current = false;
    } finally {
      window.clearTimeout(timer);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" disabled={disabled || state === "pending" || state === "success"} aria-busy={state === "pending"} onClick={start} title="Queues records for the submission worker — nothing is submitted from the browser">
        {state === "pending" ? "Queuing…" : state === "success" ? "Run started" : label}
      </Button>
      {message && <p role="status" className={state === "error" ? "max-w-xs text-right text-[11px] text-[var(--color-danger)]" : "max-w-xs text-right text-[11px] text-[var(--color-success)]"}>{message}</p>}
    </div>
  );
}
