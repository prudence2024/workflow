import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Registers the public-offline service worker (production builds only) and
 * renders a truthful offline notice when connectivity is lost. Previously
 * loaded public pages remain readable from the browser cache; sensitive
 * routes (checkout, dashboard, serverFn calls) are never served from cache —
 * the service worker's bypass list guarantees that.
 *
 * Freshness (criticism F4): on window focus after a stale period, and once on
 * reconnect, public loader data is revalidated via router.invalidate() —
 * stale-while-revalidate, never fixed polling. Debounced so a visibility
 * flap or a reconnect burst cannot storm the server; Admin/checkout stay
 * untouched (they always fetch fresh on their own loaders).
 */
const FOCUS_STALE_MS = 60_000;
const INVALIDATE_DEBOUNCE_MS = 2_000;

export function OfflineSupport() {
  const [offline, setOffline] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration is best-effort; the site works fully without it */
      });
    }

    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let lastInvalidate = 0;
    const requestInvalidate = () => {
      const now = Date.now();
      if (now - lastInvalidate < INVALIDATE_DEBOUNCE_MS) return;
      lastInvalidate = now;
      router.invalidate();
    };
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (hiddenAt && Date.now() - hiddenAt >= FOCUS_STALE_MS) requestInvalidate();
        hiddenAt = 0;
      } else {
        hiddenAt = Date.now();
      }
    };
    const onOnline = () => {
      if (!offline) requestInvalidate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [offline, router]);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900 shadow-lg"
    >
      You're offline — showing previously loaded content. Checkout and account features need a
      connection.
    </div>
  );
}
