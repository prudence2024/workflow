import "./lib/error-capture";

import * as Sentry from "@sentry/tanstackstart-react";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { scrubSentryEvent } from "./lib/sentry-scrub";

function sampleRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

const sentryDsn = process.env.SENTRY_DSN?.trim() || import.meta.env.VITE_SENTRY_DSN?.trim();
if (sentryDsn && !Sentry.isInitialized()) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: process.env.NODE_ENV === "production",
    environment: process.env.VERCEL_ENV
      ? // Deployed: the Sentry environment must match the actual Vercel
        // environment unless explicitly overridden in project settings.
        process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV
      : // Local production-build smoke tests run as "local" — they must not
        // impersonate real Vercel Preview telemetry.
        "local",
    release:
      process.env.SENTRY_RELEASE ||
      import.meta.env.VITE_SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: sampleRate(
      process.env.SENTRY_TRACES_SAMPLE_RATE || import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
      0.1,
    ),
    beforeSend: scrubSentryEvent,
  });
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const error = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  Sentry.captureException(error, { tags: { boundary: "ssr_swallowed_error" } });
  console.error(error);
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function applySecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const isProduction = process.env.NODE_ENV === "production";
  const isPreview = Boolean(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production");
  const scriptEval = isProduction ? "" : " 'unsafe-eval'";
  const vercelLive = isPreview ? " https://vercel.live" : "";
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${scriptEval} https://*.clerk.com https://*.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com${vercelLive}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://img.clerk.com https://res.cloudinary.com",
      `connect-src 'self' https://*.clerk.com https://*.accounts.dev https://*.protect.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com https://*.sentry.io https://api.cloudinary.com https://upload.cloudinary.com${vercelLive}`,
      // Google Maps embed hosts are the ONLY extra frame origins: the Contact
      // map iframe is strictly validated to https://www.google.com|google.com|
      // maps.google.com with a /maps/embed path (googleMapsEmbedUrl) before it
      // is rendered, and the frame was previously blocked here — which is why
      // the map never appeared despite the iframe being present and sized.
      `frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com https://www.google.com https://google.com https://maps.google.com${vercelLive}`,
      "worker-src 'self' blob:",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  const pathname = new URL(request.url).pathname;
  if (
    pathname.startsWith("/admin") ||
    pathname === "/checkout/callback" ||
    pathname === "/order-success"
  ) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  if (isProduction && request.url.startsWith("https://")) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  headers.delete("X-Powered-By");
  const status =
    pathname === "/admin/unauthorized"
      ? 403
      : pathname === "/admin/unavailable"
        ? 503
        : response.status;
  return new Response(response.body, {
    status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Serve /sitemap.xml dynamically from the database.
 * Intercepted here because TanStack Router's dot→slash file routing
 * cannot create a route at /sitemap.xml (it becomes /sitemap/xml).
 */
async function serveSitemap(): Promise<Response> {
  const { createDatabaseClient } = await import("./lib/database.server");
  const { getSiteOrigin } = await import("./lib/site-origin.server");
  const db = createDatabaseClient();
  const origin = getSiteOrigin();
  const urls: string[] = [];

  const staticPages = [
    { path: "/", changefreq: "daily", priority: "1.0" },
    { path: "/shop", changefreq: "daily", priority: "0.9" },
    { path: "/about", changefreq: "monthly", priority: "0.7" },
    { path: "/contact", changefreq: "monthly", priority: "0.7" },
    { path: "/blog", changefreq: "weekly", priority: "0.8" },
    { path: "/reviews", changefreq: "weekly", priority: "0.6" },
    { path: "/warranty", changefreq: "monthly", priority: "0.5" },
    { path: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
    { path: "/terms-and-conditions", changefreq: "yearly", priority: "0.3" },
  ];

  for (const page of staticPages) {
    urls.push(
      `  <url><loc>${origin}${page.path}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`,
    );
  }

  try {
    const { data: products } = await db
      .from("products")
      .select("slug, updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false });
    if (products) {
      for (const p of products) {
        const lastmod = p.updated_at
          ? `<lastmod>${new Date(p.updated_at).toISOString().split("T")[0]}</lastmod>`
          : "";
        urls.push(
          `  <url><loc>${origin}/products/${encodeURIComponent(p.slug.trim())}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.8</priority></url>`,
        );
      }
    }
  } catch {
    /* sitemap: skip this section on query failure */
  }

  try {
    const { data: posts } = await db
      .from("blog_posts")
      .select("slug, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (posts) {
      for (const p of posts) {
        const lastmod =
          p.updated_at || p.published_at
            ? `<lastmod>${new Date(p.updated_at || p.published_at).toISOString().split("T")[0]}</lastmod>`
            : "";
        urls.push(
          `  <url><loc>${origin}/blog/${p.slug}</loc>${lastmod}<changefreq>monthly</changefreq><priority>0.7</priority></url>`,
        );
      }
    }
  } catch {
    /* sitemap: skip this section on query failure */
  }

  try {
    const { data: cats } = await db
      .from("categories")
      .select("slug, updated_at")
      .eq("active", true);
    if (cats) {
      for (const c of cats) {
        const lastmod = c.updated_at
          ? `<lastmod>${new Date(c.updated_at).toISOString().split("T")[0]}</lastmod>`
          : "";
        urls.push(
          `  <url><loc>${origin}/shop?category=${c.slug}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.7</priority></url>`,
        );
      }
    }
  } catch {
    /* sitemap: skip this section on query failure */
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // Health endpoints — /api/health (liveness) and /api/health?readiness=true (readiness)
      // Liveness: always 200 if the process is running (for uptime monitors, Vercel, cron)
      // Readiness: checks database connectivity (for operational monitoring)
      if (url.pathname === "/api/health" && request.method === "GET") {
        const isReadiness = url.searchParams.get("readiness") === "true";
        const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev";
        const health: Record<string, string> = {
          status: "ok",
          version: commitSha,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
        };
        if (isReadiness) {
          try {
            const { createDatabaseClient } = await import("@/lib/database.server");
            const db = createDatabaseClient();
            const timeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 3000),
            );
            const query = db.from("site_settings").select("key").limit(1);
            await Promise.race([query, timeout]);
            health.database = "ok";
          } catch (err) {
            health.database = "unavailable";
            health.status = "degraded";
            try {
              const { notifications } = await import("@/lib/notifications");
              await notifications.integrationFailure(
                "Supabase Database",
                err instanceof Error ? err.message : "unavailable",
              );
            } catch {
              // notification path is best-effort only
            }
          }
        }
        return new Response(JSON.stringify(health), {
          status: health.status === "ok" ? 200 : 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }

      // Serve dynamic sitemap.xml before TanStack Start routing
      if (url.pathname === "/sitemap.xml" && request.method === "GET") {
        return applySecurityHeaders(await serveSitemap(), request);
      }

      // Serve public receipt download (by secure token, NOT payment reference)
      if (url.pathname.startsWith("/api/receipt/") && request.method === "GET") {
        const token = url.pathname.split("/api/receipt/")[1];
        if (token) {
          const { handleReceiptRequest } = await import("@/lib/receipt-public.server");
          const response = await handleReceiptRequest(token, url.searchParams.get("format"));
          // Receipts are personal — no cache, private
          const headers = new Headers(response.headers);
          headers.set("Cache-Control", "no-store, private");
          return new Response(response.body, { status: response.status, headers });
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      Sentry.captureException(error, { tags: { boundary: "server_entry" } });
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
