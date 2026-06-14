import { useEffect, useState, useCallback, useRef } from "react";

const FILE_CACHE_KEY = "cloudide_file_cache";
const PENDING_KEY = "cloudide_pending_writes";

interface CachedFile {
  path: string;
  content: string;
  savedAt: number;
}

interface PendingWrite {
  path: string;
  content: string;
  queuedAt: number;
}

function loadFileCache(): Record<string, CachedFile> {
  try {
    return JSON.parse(localStorage.getItem(FILE_CACHE_KEY) ?? "{}");
  } catch { return {}; }
}

function saveFileCache(cache: Record<string, CachedFile>) {
  try { localStorage.setItem(FILE_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

function loadPending(): PendingWrite[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
  } catch { return []; }
}

function savePending(pending: PendingWrite[]) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch {}
}

export function useOfflineCache() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(() => loadPending().length);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); scheduleSync(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Listen for SW sync completion
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "SYNC_COMPLETE") {
        savePending([]);
        setPendingCount(0);
        setIsSyncing(false);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  const cacheFile = useCallback((path: string, content: string) => {
    const cache = loadFileCache();
    cache[path] = { path, content, savedAt: Date.now() };
    saveFileCache(cache);
  }, []);

  const getCachedFile = useCallback((path: string): string | null => {
    const cache = loadFileCache();
    return cache[path]?.content ?? null;
  }, []);

  const getCachedFiles = useCallback((): CachedFile[] => {
    return Object.values(loadFileCache()).sort((a, b) => b.savedAt - a.savedAt);
  }, []);

  const queueWrite = useCallback((path: string, content: string) => {
    cacheFile(path, content);
    if (!navigator.onLine) {
      const pending = loadPending();
      const existing = pending.findIndex(p => p.path === path);
      if (existing >= 0) {
        pending[existing] = { path, content, queuedAt: Date.now() };
      } else {
        pending.push({ path, content, queuedAt: Date.now() });
      }
      savePending(pending);
      setPendingCount(pending.length);

      // Tell SW to queue it
      navigator.serviceWorker?.controller?.postMessage({
        type: "QUEUE_WRITE",
        url: "/api/fs/write",
        body: { path, content },
      });
    }
  }, [cacheFile]);

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      const pending = loadPending();
      if (pending.length === 0) return;
      setIsSyncing(true);
      try {
        for (const write of pending) {
          await fetch("/api/fs/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: write.path, content: write.content }),
          });
        }
        savePending([]);
        setPendingCount(0);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  }, []);

  const removeCachedFile = useCallback((path: string) => {
    const cache = loadFileCache();
    delete cache[path];
    saveFileCache(cache);
  }, []);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    cacheFile,
    getCachedFile,
    getCachedFiles,
    queueWrite,
    removeCachedFile,
  };
}
