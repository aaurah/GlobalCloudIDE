import { useState, useEffect, useCallback, useRef } from "react";
import { usePlatform } from "./use-platform";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReferralTier {
  count: number;
  bonus: number;
  label: string;
  claimed: boolean;
  reached: boolean;
}

export interface ReferralStats {
  code: string;
  referralUrl: string;
  referralCount: number;
  referredBy: string | null;
  tiers: ReferralTier[];
  nextTier: { count: number; bonus: number; label: string } | null;
  progressToNext: { current: number; target: number; bonus: number } | null;
  totalCreditsEarned: number;
}

export interface StreakMilestone {
  days: number;
  credits: number;
  label: string;
  claimed: boolean;
  reached: boolean;
  daysAway: number;
}

export interface StreakStatus {
  streakCount: number;
  longestStreak: number;
  lastActiveDate: string | null;
  activeToday: boolean;
  activeDates: string[];
  claimedMilestones: number[];
  totalStreakCredits: number;
  milestones: StreakMilestone[];
  nextMilestone: (StreakMilestone & { daysAway: number }) | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  credits: number;
  icon: string;
  unlocked: boolean;
  unlockedAt: string | null;
  creditsClaimed: boolean;
}

export interface AchievementsData {
  achievements: Achievement[];
  totalUnlocked: number;
  totalAchievements: number;
  aiGenCount: number;
  totalCreditsEarned: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGrowth() {
  const { token, user } = usePlatform();
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [streak, setStreak] = useState<StreakStatus | null>(null);
  const [achievements, setAchievements] = useState<AchievementsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemResult, setRedeemResult] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = useCallback(() =>
    ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);

  const fetchAll = useCallback(async () => {
    if (!token) return;
    try {
      const [rRes, sRes, aRes] = await Promise.all([
        fetch("/api/referral/stats", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/streak/status",  { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/achievements/list", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (rRes.ok) setReferral(await rRes.json());
      if (sRes.ok) setStreak(await sRes.json());
      if (aRes.ok) setAchievements(await aRes.json());
    } catch {}
  }, [token]);

  useEffect(() => {
    if (!user || !token) { setReferral(null); setStreak(null); setAchievements(null); return; }
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 90_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [user, token, fetchAll]);

  const copyReferralLink = useCallback(async (): Promise<boolean> => {
    if (!referral) return false;
    try {
      await navigator.clipboard.writeText(referral.referralUrl);
      return true;
    } catch { return false; }
  }, [referral]);

  const redeemReferralCode = useCallback(async (code: string): Promise<{ ok: boolean; message: string }> => {
    if (!token) return { ok: false, message: "Not authenticated" };
    setLoading(true);
    try {
      const res = await fetch("/api/referral/redeem", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok) { await fetchAll(); return { ok: true, message: data.message }; }
      return { ok: false, message: data.error ?? "Failed" };
    } catch (e: any) {
      return { ok: false, message: e.message };
    } finally { setLoading(false); }
  }, [token, authHeaders, fetchAll]);

  const unlockAchievement = useCallback(async (achievementId: string): Promise<{ ok: boolean; message: string }> => {
    if (!token) return { ok: false, message: "Not authenticated" };
    setLoading(true);
    try {
      const res = await fetch("/api/achievements/unlock", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ achievementId }),
      });
      const data = await res.json();
      if (res.ok) { await fetchAll(); return { ok: true, message: data.message }; }
      return { ok: false, message: data.error ?? "Failed" };
    } catch (e: any) {
      return { ok: false, message: e.message };
    } finally { setLoading(false); }
  }, [token, authHeaders, fetchAll]);

  return {
    referral, streak, achievements, loading,
    redeemCode, setRedeemCode, redeemResult, setRedeemResult,
    copyReferralLink, redeemReferralCode, unlockAchievement, refresh: fetchAll,
  };
}
