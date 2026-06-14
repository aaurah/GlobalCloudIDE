const CACHE_NAME = "cloudide-v1";
const STATIC_ASSETS = [
  "/",
  "/favicon.svg",
  "/manifest.json",
];

// Assets to cache on install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Remove old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // API requests: network-first, no caching (SSE streams must not be intercepted)
  if (url.pathname.startsWith("/api/")) {
    // Only cache safe non-streaming endpoints
    const safeEndpoints = ["/api/healthz"];
    if (!safeEndpoints.some(ep => url.pathname.startsWith(ep))) return;
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      }).catch(() => {
        // Offline fallback: return cached index.html for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("/") || Response.error();
        }
        return Response.error();
      });
    })
  );
});

// Background sync for file writes when offline
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-files") {
    event.waitUntil(syncPendingWrites());
  }
});

async function syncPendingWrites() {
  try {
    const cache = await caches.open("cloudide-offline-writes");
    const requests = await cache.keys();
    for (const request of requests) {
      const response = await cache.match(request);
      if (!response) continue;
      const body = await response.json();
      await fetch(request, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await cache.delete(request);
    }
  } catch {}
}
