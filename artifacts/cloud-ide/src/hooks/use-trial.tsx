import { useState, useEffect, useCallback, useRef } from "react";
import { usePlatform } from "./use-platform";

export interface TrialStatus {
  isTrial: boolean;
  active: boolean;
  expired: boolean;
  trialStartedAt: string;
  trialExpiresAt: string;
  trialCreditLimit: number;
  trialCreditsUsed: number;
  trialCreditsRemaining: number;
  percentUsed: number;
  plan: "free" | "pro" | "team";
  credits: number;
  canUseAi: boolean;
  suspiciousUsage: boolean;
}

interface UseTrialReturn {
  trial: TrialStatus | null;
  loading: boolean;
  upgradeModalOpen: boolean;
  openUpgradeModal: () => void;
  closeUpgradeModal: () => void;
  subscribe: (plan: "pro" | "team") => Promise<void>;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL = 60_000; // refresh every 60s

export function useTrial(): UseTrialReturn {
  const { token, user } = usePlatform();
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = typeof fetch !== "undefined" ? fetch : () => Promise.reject("no fetch");

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch_("/api/trial/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTrial(await res.json());
    } catch {}
  }, [token]);

  // Load when user/token changes
  useEffect(() => {
    if (!user || !token) { setTrial(null); return; }
    refresh();
    // Poll
    intervalRef.current = setInterval(refresh, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [user, token, refresh]);

  const subscribe = useCallback(async (plan: "pro" | "team") => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch_("/api/plans/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        await refresh();
        setUpgradeModalOpen(false);
      }
    } finally {
      setLoading(false);
    }
  }, [token, refresh]);

  return {
    trial,
    loading,
    upgradeModalOpen,
    openUpgradeModal: () => setUpgradeModalOpen(true),
    closeUpgradeModal: () => setUpgradeModalOpen(false),
    subscribe,
    refresh,
  };
}
