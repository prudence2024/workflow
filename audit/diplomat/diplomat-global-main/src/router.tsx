import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { scrubSentryEvent } from "./lib/sentry-scrub";
import { routeTree } from "./routeTree.gen";

let clientSentryStarting = false;

function sampleRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Public data (products, blog, testimonials, etc.) stays fresh for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Keep cached data in memory for 10 minutes after component unmount
        gcTime: 10 * 60 * 1000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (typeof window !== "undefined" && dsn && !clientSentryStarting) {
    clientSentryStarting = true;
    void import("@sentry/tanstackstart-react")
      .then((Sentry) => {
        if (Sentry.isInitialized()) return;
        Sentry.init({
          dsn,
          enabled: import.meta.env.PROD,
          // Truthful environment: a locally served build (127.0.0.1/localhost)
          // reports "local" and never impersonates deployed Preview telemetry,
          // regardless of what env files claim. Deployed builds report the
          // environment configured in Vercel project settings.
          environment: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
            ? "local"
            : import.meta.env.VITE_SENTRY_ENVIRONMENT || "production",
          release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
          sendDefaultPii: false,
          tracesSampleRate: sampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.1),
          integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
          beforeSend: scrubSentryEvent,
        });
      })
      .catch((error) => {
        clientSentryStarting = false;
        console.error("Sentry client initialization failed", error);
      });
  }

  return router;
};
