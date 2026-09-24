import { useCallback, useEffect, useState } from "react";
import {
  CONSENT_CHANGED_EVENT,
  onConsentChange,
  readConsent,
  writeConsent,
  type ConsentState,
} from "@/lib/consent";
import { Link } from "@tanstack/react-router";

/**
 * Cookie consent banner — clear language, no dark patterns.
 *
 * Necessary cookies power the store itself (cart, session, security) and are
 * not a choice. ANALYTICS and MARKETING are optional and default to refused:
 * nothing optional runs before consent. The visitor can accept all, reject
 * optional tracking entirely, or manage each category, and can reopen this
 * panel anytime via the "Cookie preferences" footer control.
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    setVisible(readConsent() === null);
    return onConsentChange(() => setVisible(readConsent() === null));
  }, []);

  const save = useCallback((next: ConsentState) => {
    writeConsent(next);
    setManaging(false);
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-[95] border-t border-border bg-background/95 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        <p className="text-sm text-foreground">
          We use essential cookies to run the store, and optional cookies to understand how the site
          is used (analytics) and to measure marketing (advertising). Optional cookies stay off
          until you allow them. Read our{" "}
          <Link to="/privacy-policy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>

        {managing && (
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span>
                <span className="font-medium">Essential</span> — required for cart, checkout and
                security.
              </span>
              <span className="text-muted-foreground">Always on</span>
            </div>
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="font-medium">Analytics</span> — anonymous usage measurement.
              </span>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                className="size-4"
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="font-medium">Marketing</span> — advertising measurement (Meta
                Pixel).
              </span>
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
                className="size-4"
              />
            </label>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {managing ? (
            <button
              type="button"
              className="pressable rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
              onClick={() => save({ analytics, marketing })}
            >
              Save preferences
            </button>
          ) : (
            <button
              type="button"
              className="pressable rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
              onClick={() => setManaging(true)}
            >
              Manage preferences
            </button>
          )}
          <button
            type="button"
            className="pressable rounded-lg border border-border px-4 py-2 text-sm font-medium"
            onClick={() => save({ analytics: true, marketing: true })}
          >
            Accept all
          </button>
          <button
            type="button"
            className="pressable rounded-lg border border-border px-4 py-2 text-sm font-medium"
            onClick={() => save({ analytics: false, marketing: false })}
          >
            Reject optional
          </button>
        </div>
      </div>
    </div>
  );
}
