"use client";

import { useEffect } from "react";

const RECOVERY_KEY = "workflow-stale-action-recovery";

function isStaleActionError(value: unknown): boolean {
  if (value instanceof Response) {
    return value.status === 404 && value.headers.get("x-nextjs-action-not-found") === "1";
  }

  const candidate = value as { message?: unknown; digest?: unknown; status?: unknown } | null;
  const text = value instanceof Error
    ? value.message
    : typeof value === "string"
      ? value
      : [candidate?.message, candidate?.digest, candidate?.status].filter(Boolean).join(" ");
  return /UnrecognizedActionError|Server Action.+was not found|x-nextjs-action-not-found/i.test(text);
}

export function StaleActionRecovery() {
  useEffect(() => {
    const recover = (value: unknown) => {
      if (!isStaleActionError(value)) return;
      let lastRecovery = 0;
      try {
        lastRecovery = Number(sessionStorage.getItem(RECOVERY_KEY) ?? "0");
      } catch {
        // If storage is unavailable, do not risk a reload loop.
        return;
      }
      if (Number.isFinite(lastRecovery) && Date.now() - lastRecovery < 30_000) return;
      try {
        sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
      } catch {
        return;
      }
      window.location.reload();
    };
    const onError = (event: ErrorEvent) => recover(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => recover(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
