/*
 * Diplomat Global service worker — minimal, security-first offline layer.
 *
 * Policy:
 *  - Same-origin GET requests only. Nothing else is ever intercepted.
 *  - NEVER cached: checkout, dashboard/admin, API/serverFn endpoints, any
 *    document response carrying Set-Cookie (session-bound HTML), non-OK
 *    responses, cross-origin traffic (Paystack, Cloudinary, Clerk, Sentry).
 *  - Documents: network-first with a previously-cached copy as offline
 *    fallback (graceful offline reading of already-visited public pages).
 *  - Hashed static assets (/assets/): cache-first — they are immutable.
 *  - Updates: new SW activates immediately (skipWaiting + clientsClaim) and
 *    stale cache versions are deleted on activate, so a new deployment always
 *    replaces old caches.
 *  - No offline action queue by design: payment/checkout submissions must
 *    never be queued, and public form submissions surface explicit errors so
 *    the user can retry with connectivity.
 */

const CACHE_VERSION = "dg-public-v1";
const DOCUMENT_CACHE = `${CACHE_VERSION}-documents`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

/** Paths that must always go to the network, never served from cache. */
const BYPASS_PREFIXES = ["/checkout", "/dashboard", "/api/", "/_serverFn", "/_auth"];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("dg-") && !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isBypassed(url) {
  return BYPASS_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(prefix),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isBypassed(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cacheable =
            response &&
            response.ok &&
            response.type === "basic" &&
            !response.headers.has("set-cookie");
          if (cacheable) {
            const cache = await caches.open(DOCUMENT_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          const cached = await caches.match(request, { ignoreSearch: false });
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});
