const CACHE_NAME = "workflow-static-v1";
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/brand/icon-light.png",
  "/brand/icon-dark.png",
  "/icons/workflow-192.png",
  "/icons/workflow-512.png",
];

function isSafeStaticRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;

  // Never intercept documents, RSC, API routes, Clerk requests, downloads,
  // or Server Action traffic. Authenticated state must always be network-fresh.
  if (request.mode === "navigate" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/__clerk/")) {
    return false;
  }
  if (url.searchParams.has("_rsc") || request.headers.has("Next-Action")) return false;

  return url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/brand/")
    || url.pathname.startsWith("/icons/")
    || url.pathname === "/manifest.webmanifest"
    || url.pathname === "/sw.js";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isSafeStaticRequest(event.request, url)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    }),
  );
});
