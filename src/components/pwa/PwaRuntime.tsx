"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const DISMISS_KEY = "workflow-install-dismissed-at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function wasRecentlyDismissed(): boolean {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(DISMISS_KEY);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
    return false;
  }
  const dismissedAt = Number(stored ?? 0);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Dismissal persistence is optional; the prompt can reappear next visit.
  }
}

export function PwaRuntime() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuidance, setShowIosGuidance] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Installability is optional; the app remains fully network-driven.
      });
    }

    if (isStandalone() || wasRecentlyDismissed()) return;

    const iosGuidanceTimer = isIos()
      ? window.setTimeout(() => setShowIosGuidance(true), 0)
      : undefined;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      if (iosGuidanceTimer !== undefined) window.clearTimeout(iosGuidanceTimer);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
  }

  function dismiss() {
    rememberDismissal();
    setDismissed(true);
    setShowIosGuidance(false);
    setInstallEvent(null);
  }

  if (dismissed || (!installEvent && !showIosGuidance)) return null;

  return (
    <aside
      aria-label="Install Workflow"
      className="pwa-install-prompt fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-lg items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-lg)]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Image src="/icons/workflow-app-192.png" alt="" width={40} height={40} className="shrink-0 rounded-[10px]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-ink)]">Get Workflow</p>
          <p className="text-xs text-[var(--color-muted)]">
            {showIosGuidance ? "Tap Share, then Add to Home Screen." : "Keep your workspace one tap away."}
          </p>
        </div>
      </div>
      {installEvent && (
        <button
          type="button"
          onClick={() => void install()}
          className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--color-brand-strong)]"
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-[var(--radius-sm)] px-2 py-2 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        aria-label="Dismiss install prompt"
      >
        Later
      </button>
    </aside>
  );
}
