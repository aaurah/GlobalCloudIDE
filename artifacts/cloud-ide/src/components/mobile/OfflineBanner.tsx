import React, { useState, useEffect } from "react";
import { WifiOff, Wifi, RefreshCw, CloudUpload } from "lucide-react";

interface OfflineBannerProps {
  pendingCount?: number;
  isSyncing?: boolean;
}

export function OfflineBanner({ pendingCount = 0, isSyncing = false }: OfflineBannerProps) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowReconnected(true);
        setTimeout(() => { setShowReconnected(false); setWasOffline(false); }, 3500);
      }
    };
    const onOffline = () => { setIsOnline(false); setWasOffline(true); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [wasOffline]);

  if (isOnline && !showReconnected && pendingCount === 0 && !isSyncing) return null;

  // Syncing state (back online, uploading queued writes)
  if (isSyncing || (isOnline && pendingCount > 0)) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium shrink-0 bg-blue-900/50 text-blue-300 border-b border-blue-700/30 animate-in slide-in-from-top duration-200">
        <RefreshCw size={11} className="animate-spin" />
        Syncing {pendingCount > 0 ? `${pendingCount} change${pendingCount > 1 ? "s" : ""}` : "changes"}...
      </div>
    );
  }

  // Just came back online
  if (isOnline && showReconnected) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium shrink-0 bg-green-900/50 text-green-300 border-b border-green-700/30 animate-in slide-in-from-top duration-200">
        <Wifi size={11} /> Back online — all changes saved
      </div>
    );
  }

  // Offline
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-1.5 text-xs font-medium shrink-0 bg-red-900/50 text-red-300 border-b border-red-700/30">
      <span className="flex items-center gap-1.5">
        <WifiOff size={11} /> Offline
      </span>
      {pendingCount > 0 && (
        <span className="flex items-center gap-1 text-[10px] text-red-400/80">
          <CloudUpload size={10} /> {pendingCount} pending sync
        </span>
      )}
      <span className="text-[10px] text-red-400/70">Edits saved locally</span>
    </div>
  );
}
