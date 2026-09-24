import { ClerkProvider } from "@clerk/tanstack-react-start";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { onConsentChange, readConsent, type ConsentState } from "@/lib/consent";
import { syncMetaPixel, useAnalyticsPageView } from "@/lib/meta-pixel";
import { ConsentBanner } from "@/components/consent-banner";
import { OfflineSupport } from "@/components/offline-support";
import { Analytics } from "@vercel/analytics/react";

import appCss from "../styles.css?url";

import { StoreProvider } from "@/components/store-provider";
import { Toaster } from "@/components/ui/sonner";
import {
  useRootLoaderData,
  type RootLoaderData,
  type RootPublicCategory,
  type RootPublicSocialLink,
} from "@/hooks/use-root-loader-data";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    void import("@sentry/tanstackstart-react").then((Sentry) =>
      Sentry.captureException(error, {
        tags: { boundary: "tanstack_root_error_component" },
      }),
    );

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [error]);

  const isNetworkTimeout =
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    /timeout|timed.out/i.test(error?.message ?? "") ||
    /network|failed to fetch|load failed/i.test(error?.message ?? "");
  const isOffline = !isOnline;
  const isServerError = !isOffline && !isNetworkTimeout;

  // Unknown cause → do not blame the server ("something went wrong on our end")
  // nor assert the user is offline. State only what is true.
  const heading = isOffline
    ? "You're offline"
    : isNetworkTimeout
      ? "We couldn't connect"
      : "This page didn't load";

  const description = isOffline
    ? "Check your internet connection, then try again."
    : isNetworkTimeout
      ? "The connection took too long. Check your network and try again."
      : "Check your internet connection, then reload the page or try again.";

  // Offline/timeout: waiting for connectivity and re-invalidating is better than
  // a blind reload. Unknown failure: the primary action genuinely reloads.
  const handlePrimaryAction = () => {
    if (!isOffline && !isNetworkTimeout) {
      window.location.reload();
      return;
    }
    handleTryAgain();
  };

  const handleTryAgain = () => {
    if (isOffline) {
      const waitAndRetry = () => {
        window.removeEventListener("online", waitAndRetry);
        router.invalidate();
        reset();
      };
      window.addEventListener("online", waitAndRetry);
      return;
    }
    router.invalidate();
    reset();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-surface ring-1 ring-border">
          {isOffline ? (
            <svg
              className="size-7 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M8.5 16.5a5 5 0 0 1 7 0" />
              <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
              <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
              <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
              <path d="M5 12.55a10 10 0 0 1 5.17-2.39" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          ) : isNetworkTimeout ? (
            <svg
              className="size-7 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ) : (
            <svg
              className="size-7 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{heading}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={handlePrimaryAction}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {isOffline || isNetworkTimeout ? "Try again" : "Reload page"}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Last-known-good safe public business info shared by the root loader.
 * A failed revalidation keeps the previously loaded settings/social links
 * visible; only a NEW successful response replaces them. Never holds
 * privileged data — only the safe public fields the footer/header render.
 *
 * Backed by sessionStorage on the client so a successful load also survives
 * a later full page load made under a degraded connection (module instances
 * do not persist across reloads). Server-side, the in-memory value only.
 */
const ROOT_SHARED_LKG_KEY = "dg-root-shared-lkg-v1";
type RootSharedLkg = {
  socialLinks: RootPublicSocialLink[];
  siteSettings: Record<string, string>;
  categories?: RootPublicCategory[];
};
let rootSharedLkg: RootSharedLkg | null = null;

/**
 * Seed the client-side LKG cache from SSR-hydrated loader data so the first
 * client-side navigation failure still has last-known-good shared data to
 * fall back to (the SSR data is what the visitor actually saw).
 */
function seedRootSharedLkgFromSsr(data: {
  socialLinks: RootPublicSocialLink[];
  siteSettings: Record<string, string>;
  categories: RootPublicCategory[];
}): void {
  if (typeof window === "undefined") return;
  const win = window as typeof window & { __dgRootLkgSeeded?: boolean };
  if (win.__dgRootLkgSeeded) return;
  win.__dgRootLkgSeeded = true;
  if (!readRootSharedLkg()) {
    writeRootSharedLkg({
      socialLinks: data.socialLinks,
      siteSettings: data.siteSettings,
      categories: data.categories,
    });
  }
}

/** Exported for the storage-safety contract tests (tests/root-lkg-storage.test.ts).
 *  Behaviour is unchanged: server-side and first-call paths are identical. */
export function readRootSharedLkg(): RootSharedLkg | null {
  if (rootSharedLkg) return rootSharedLkg;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ROOT_SHARED_LKG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RootSharedLkg;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.socialLinks) ||
      typeof parsed.siteSettings !== "object"
    )
      return null;
    rootSharedLkg = parsed;
    return rootSharedLkg;
  } catch {
    return null;
  }
}

export function writeRootSharedLkg(value: RootSharedLkg): void {
  rootSharedLkg = value;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ROOT_SHARED_LKG_KEY, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode/quota); the in-memory value still applies.
  }
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      // Charset belongs to RootShell's document head, not route metadata.
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Diplomat Global — Premium Electronics in Nigeria" },
      {
        name: "description",
        content:
          "Shop trusted monitors, cameras, computing gear and printers with secure payment and nationwide delivery.",
      },
      { name: "author", content: "Diplomat Global Tech-Solutions" },
      { name: "theme-color", content: "#0891b2" },
      { property: "og:title", content: "Diplomat Global" },
      {
        property: "og:description",
        content: "Premium electronics, dependable support and nationwide delivery.",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content: `${(import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "")}/favicon.png`,
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Diplomat Global — Premium Electronics & Tech in Nigeria",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Diplomat Global — Premium Electronics in Nigeria" },
      {
        name: "twitter:description",
        content:
          "Shop trusted monitors, cameras, computing gear and printers with secure payment and nationwide delivery.",
      },
      {
        name: "twitter:image",
        content: `${(import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "")}/favicon.png`,
      },
      {
        property: "og:url",
        content: `${(import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "")}/`,
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "140x140",
        type: "image/png",
      },
      { rel: "icon", href: "/logo-100.png", sizes: "100x100", type: "image/png" },
    ],
  }),
  loader: async () => {
    // Pre-fetch shared data on every navigation (social links + site settings + categories).
    // This eliminates client-side fetches from SiteFooter, homepage categories, and shop filters.
    let linksFailed = false;
    let settingsFailed = false;
    let socialLinks: RootPublicSocialLink[] = [];
    let siteSettings: Record<string, string> = {};
    let categories: RootPublicCategory[] = [];
    let categoriesUnavailable = false;
    try {
      const { getPublicSocialLinks, getPublicSiteSettings, getPublicCategories } =
        await import("@/lib/admin/server-fns");
      const [linksRes, settingsRes, catsRes] = await Promise.allSettled([
        getPublicSocialLinks({}),
        getPublicSiteSettings({}),
        getPublicCategories({}),
      ]);
      if (linksRes.status === "fulfilled" && linksRes.value.links?.length) {
        socialLinks = linksRes.value.links;
      } else if (linksRes.status === "rejected") {
        // Failed revalidation: keep the last successful safe public business
        // info visible instead of erasing it (footer social links).
        linksFailed = true;
        console.error("[root-loader] socialLinks failed:", linksRes.reason);
      }
      if (settingsRes.status === "fulfilled" && settingsRes.value.settings) {
        siteSettings = settingsRes.value.settings;
      } else if (settingsRes.status === "rejected") {
        // Failed revalidation: keep the last successful safe public business
        // info visible instead of rendering "not configured".
        settingsFailed = true;
        console.error("[root-loader] siteSettings failed:", settingsRes.reason);
      }
      if (catsRes.status === "fulfilled") {
        categories = catsRes.value.categories ?? [];
      } else {
        categoriesUnavailable = true;
        console.error("[root-loader] categories failed:", catsRes.reason);
      }
    } catch (err) {
      console.error("[root-loader] shared data fetch failed:", err);
    }
    // Last-known-good safe public data: only a NEW successful response may
    // replace the prior successful settings/social links/categories. A failed
    // request never erases already-loaded public business info.
    if (linksFailed || settingsFailed || categoriesUnavailable) {
      const cached = readRootSharedLkg();
      if (linksFailed) socialLinks = cached?.socialLinks ?? socialLinks;
      if (settingsFailed) siteSettings = cached?.siteSettings ?? siteSettings;
      if (categoriesUnavailable) categories = cached?.categories ?? categories;
    } else {
      writeRootSharedLkg({ socialLinks, siteSettings, categories });
    }
    return {
      socialLinks,
      siteSettings,
      categories,
      categoriesUnavailable,
      sharedDataStale:
        (linksFailed || settingsFailed || categoriesUnavailable) && readRootSharedLkg() !== null,
    } satisfies RootLoaderData;
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var t = localStorage.getItem('dg-theme');
                var d = t ? t === 'dark' : true;
                if (d) document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
              })();
            `,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AnalyticsProviders({ children }: { children: React.ReactNode }) {
  // GA4 — read from DB settings (admin-configurable) with env var fallback.
  // The gtag loader is injected from the client (inside ConsentGatedAnalytics)
  // only after ANALYTICS consent is granted; SSR never embeds tracking, so
  // nothing optional runs before consent. Vercel Analytics stays cookieless
  // and loads unconditioned.
  return (
    <>
      <ConsentGatedAnalytics />
      <Analytics />
      {children}
    </>
  );
}

/**
 * Client-only consent gate for optional analytics. Injects the GA4 gtag
 * loader after ANALYTICS consent is granted, removes it when consent is
 * withdrawn, and drives consent-gated page views for GA4 + Meta Pixel on
 * every route change.
 */
function ConsentGatedAnalytics() {
  const pathname = useRouter().state.location.pathname;
  const settings = useRootLoaderData().siteSettings;
  const gaId = (settings.ga_measurement_id || import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();
  const gaConfigured = gaId.startsWith("G-");

  useEffect(() => {
    const sync = (consent: ConsentState | null) => {
      const existing = document.getElementById("ga4-gtag-script");
      if (consent?.analytics && gaConfigured && !existing) {
        const loader = document.createElement("script");
        loader.async = true;
        loader.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
        loader.id = "ga4-gtag-script";
        document.head.appendChild(loader);
        const w = window as Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
        if (!w.gtag) {
          w.dataLayer = w.dataLayer || [];
          w.gtag = function gtag(...args: unknown[]) {
            w.dataLayer!.push(args);
          };
          w.gtag("js", new Date());
          w.gtag("config", gaId, { send_page_view: false });
        }
      } else if (!consent?.analytics && existing) {
        existing.remove();
        const w = window as Window & { gtag?: unknown; dataLayer?: unknown };
        w.gtag = undefined;
        w.dataLayer = undefined;
      }
      syncMetaPixel(consent);
    };
    sync(readConsent());
    return onConsentChange(() => sync(readConsent()));
  }, [gaConfigured, gaId]);

  useAnalyticsPageView();

  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const rootLoaderData = Route.useLoaderData();
  seedRootSharedLkgFromSsr(rootLoaderData);

  const application = (
    <QueryClientProvider client={queryClient}>
      <AnalyticsProviders>
        <StoreProvider>
          <Outlet />
          <Toaster richColors position="top-right" closeButton />
          <ConsentBanner />
          <OfflineSupport />
        </StoreProvider>
      </AnalyticsProviders>
    </QueryClientProvider>
  );
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  return publishableKey ? (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/admin/login"
      signUpUrl="/admin/login"
    >
      {application}
    </ClerkProvider>
  ) : (
    application
  );
}
