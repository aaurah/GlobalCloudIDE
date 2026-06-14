const CACHE_NAME = "cloudide-v2";
const OFFLINE_FILES_CACHE = "cloudide-offline-files";
const STATIC_ASSETS = ["/", "/favicon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== OFFLINE_FILES_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // API: never cache SSE streams; cache safe GET endpoints
  if (url.pathname.startsWith("/api/")) {
    const safe = ["/api/healthz", "/api/fs/list", "/api/memory"];
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

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request).then((res) => {
        if (res && res.status === 200 && res.type !== "opaque") {
          cache.put(event.request, res.clone());
        }
        return res;
      }).catch(() => null);

      return cached || networkFetch || (
        event.request.mode === "navigate"
          ? caches.match("/")
          : Response.error()
      );
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
    // Notify all clients that sync is complete
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: "SYNC_COMPLETE" }));
  } catch {}
}

// Message from app: queue a file write for offline sync
self.addEventListener("message", (event) => {
  if (event.data?.type === "QUEUE_WRITE") {
    const { url, body } = event.data;
    caches.open(OFFLINE_FILES_CACHE).then((cache) => {
      cache.put(url, new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" }
      }));
    });
  }
});
