import React, { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowReconnected(true);
        setTimeout(() => { setShowReconnected(false); setWasOffline(false); }, 3000);
      }
    };
    const onOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [wasOffline]);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold shrink-0 transition-all ${
        isOnline && showReconnected
          ? "bg-green-900/60 text-green-300 border-b border-green-700/30"
          : "bg-red-900/60 text-red-300 border-b border-red-700/30"
      }`}
    >
      {isOnline ? (
        <><Wifi size={13} /> Back online — syncing changes</>
      ) : (
        <><WifiOff size={13} /> Offline — edits saved locally</>
      )}
    </div>
  );
}
