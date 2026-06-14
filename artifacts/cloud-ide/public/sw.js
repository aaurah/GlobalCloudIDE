const CACHE_NAME = "cloudide-v4";
const OFFLINE_FILES_CACHE = "cloudide-offline-files";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(["/favicon.svg", "/manifest.json"]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== OFFLINE_FILES_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // NEVER cache HTML navigation requests — always fetch fresh from network
  // so Vite chunk hash changes don't break the app
  if (
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html")
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/"))
    );
    return;
  }

  // API routes — never cache (except specific safe read-only endpoints)
  if (url.pathname.startsWith("/api/")) {
    const safe = ["/api/fs/list", "/api/memory"];
    if (!safe.some((ep) => url.pathname.startsWith(ep))) return;
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Vite HMR / dev websocket — skip
  if (url.pathname.startsWith("/@") || url.pathname.startsWith("/node_modules")) {
    return;
  }

  // Static assets (JS/CSS/images with content hash in filename) — cache-first
  const isHashedAsset =
    /\.[0-9a-f]{8,}\.(js|css|woff2?|png|jpg|svg|ico)(\?.*)?$/i.test(url.pathname);

  if (isHashedAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      })
    );
    return;
  }

  // Everything else — network with cache fallback, stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type !== "opaque") {
            cache.put(event.request, res.clone());
          }
          return res;
        })
        .catch(() => null);
      return cached || networkFetch || Response.error();
    })
  );
});

// Background sync: flush pending file writes accumulated while offline
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-files") {
    event.waitUntil(syncPendingWrites());
  }
});

async function syncPendingWrites() {
  try {
    const cache = await caches.open(OFFLINE_FILES_CACHE);
    const requests = await cache.keys();
    for (const req of requests) {
      const res = await cache.match(req);
      if (!res) continue;
      try {
        const body = await res.json();
        await fetch(req.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await cache.delete(req);
      } catch {}
    }
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: "SYNC_COMPLETE" }));
  } catch {}
}

// Message from app: queue a file write for offline sync
self.addEventListener("message", (event) => {
  if (event.data?.type === "QUEUE_WRITE") {
    const { url, body } = event.data;
    caches.open(OFFLINE_FILES_CACHE).then((cache) => {
      cache.put(
        url,
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        })
      );
    });
  }
});
