import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { onConsentChange, readConsent, type ConsentState } from "@/lib/consent";

/**
 * Meta Pixel loader + analytics page-view authority — consent-gated,
 * deduplicated, no sensitive data transmission.
 *
 * The Pixel ID comes from the environment (`VITE_META_PIXEL_ID`), never
 * hardcoded. The Pixel is injected only when marketing consent is granted
 * and removed when consent is withdrawn. No sensitive data (payment details,
 * tokens, PII) is ever transmitted — only public page context and the single
 * intentional Purchase event.
 */

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
    gtag?: (...args: unknown[]) => void;
  }
}

let pixelInjected = false;

function injectPixel(pixelId: string): void {
  if (pixelInjected) return;
  pixelInjected = true;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = window as Window & { fbq?: any; _fbq?: any };
  if (!w.fbq) {
    const n: any = (w.fbq = function (...args: any[]) {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue.push(args);
      }
    });
    if (!w._fbq) w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.id = "meta-pixel-script";
    document.head.appendChild(script);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  window.fbq?.("init", pixelId);
}

function removePixel(): void {
  const script = document.getElementById("meta-pixel-script");
  if (script) script.remove();
  if (window.fbq) {
    // Neutralize the queue so nothing further is buffered or sent.
    (window as { fbq?: unknown }).fbq = undefined;
    (window as { _fbq?: unknown })._fbq = undefined;
  }
  pixelInjected = false;
}

/** Keeps Pixel presence in sync with marketing consent. */
export function syncMetaPixel(consent: ConsentState | null): void {
  const pixelId = (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim() ?? "";
  const allowed = consent?.marketing === true && pixelId.length > 0;

  if (allowed && !pixelInjected) {
    injectPixel(pixelId);
  } else if (!allowed && pixelInjected) {
    removePixel();
  }
}

/**
 * Route-change hook — the single page-view authority for consent-gated
 * analytics. Fires GA4 page_view (when analytics consent is granted and GA4
 * is configured) and Meta PageView (when marketing consent is granted and
 * the Pixel is configured) on every SPA navigation, and keeps the Pixel
 * synced when consent changes mid-session.
 */
export function useAnalyticsPageView(): void {
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const consentRef = useRef<ConsentState | null>(null);

  useEffect(() => {
    // localStorage is browser-only — read inside effects, never during render.
    if (consentRef.current === null) consentRef.current = readConsent();
    const fire = (consent: ConsentState | null) => {
      syncMetaPixel(consent);
      const gaId = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim() ?? "";
      if (consent?.analytics && gaId.startsWith("G-")) {
        window.gtag?.("event", "page_view", { page_path: pathname });
      }
      if (consent?.marketing && pixelInjected) {
        window.fbq?.("track", "PageView");
      }
    };
    fire(consentRef.current);
    return onConsentChange(() => {
      consentRef.current = readConsent();
      fire(consentRef.current);
    });
  }, [pathname]);
}

/**
 * Deduplicated authoritative Purchase event. Called ONLY after the server
 * has confirmed payment (order-success "paid" state) — never on redirect or
 * optimistic UI. Sends order reference and totals only, never customer or
 * payment credentials.
 */
export function trackMetaPurchase(payload: {
  value: number;
  currency: string;
  orderReference: string;
}): void {
  if (!pixelInjected || !window.fbq) return;
  window.fbq("track", "Purchase", {
    value: payload.value,
    currency: payload.currency,
    content_ids: [payload.orderReference],
    content_type: "product",
  });
}
