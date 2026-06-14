import React, { useState } from "react";
import { useGrowth } from "../../hooks/use-growth";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import {
  Copy, Check, Share2, Gift, Flame, Trophy, Users, Zap,
  Lock, Star, ChevronRight, ExternalLink, RefreshCw,
} from "lucide-react";

type GrowthTab = "referral" | "streak" | "achievements";

export function GrowthPanel() {
  const [tab, setTab] = useState<GrowthTab>("referral");
  const {
    referral, streak, achievements, loading,
    redeemCode, setRedeemCode, redeemResult, setRedeemResult,
    copyReferralLink, redeemReferralCode, unlockAchievement, refresh,
  } = useGrowth();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-3 pb-0 shrink-0">
        {([
          { id: "referral",      label: "Invite",       icon: <Users size={12} /> },
          { id: "streak",        label: "Streak",        icon: <Flame size={12} /> },
          { id: "achievements",  label: "Achievements",  icon: <Trophy size={12} /> },
        ] as { id: GrowthTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}>
            {t.icon}{t.label}
          </button>
        ))}
        <button onClick={refresh} className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === "referral" && <ReferralTab
          referral={referral}
          redeemCode={redeemCode}
          setRedeemCode={setRedeemCode}
          redeemResult={redeemResult}
          setRedeemResult={setRedeemResult}
          onCopy={copyReferralLink}
          onRedeem={redeemReferralCode}
        />}
        {tab === "streak"      && <StreakTab streak={streak} />}
        {tab === "achievements" && <AchievementsTab
          data={achievements}
          onUnlock={unlockAchievement}
        />}
      </div>
    </div>
  );
}

// ── Referral tab ──────────────────────────────────────────────────────────────

function ReferralTab({ referral, redeemCode, setRedeemCode, redeemResult, setRedeemResult, onCopy, onRedeem }: {
  referral: ReturnType<typeof useGrowth>["referral"];
  redeemCode: string;
  setRedeemCode: (v: string) => void;
  redeemResult: string | null;
  setRedeemResult: (v: string | null) => void;
  onCopy: () => Promise<boolean>;
  onRedeem: (code: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [copied, setCopied] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const handleCopy = async () => {
    const ok = await onCopy();
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const handleShare = () => {
    if (!referral) return;
    if (navigator.share) {
      navigator.share({ title: "Join GlobalCloudIDE", text: "Build in the cloud — join me and get 1,500 free AI credits!", url: referral.referralUrl }).catch(() => {});
    } else handleCopy();
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    const result = await onRedeem(redeemCode.trim());
    setRedeemResult(result.message);
    if (result.ok) setRedeemCode("");
    setRedeeming(false);
  };

  if (!referral) return <SkeletonCard lines={4} />;

  const progress = referral.progressToNext
    ? Math.min(100, (referral.progressToNext.current / referral.progressToNext.target) * 100)
    : 100;

  return (
    <div className="space-y-3">
      {/* Hero */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Gift size={14} className="text-primary" />
          </div>
          <div>
            <div className="text-sm font-bold">Invite friends, earn credits</div>
            <div className="text-xs text-muted-foreground">You and your friend both get bonus AI credits</div>
          </div>
        </div>

        {/* Referral link */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Your invite link</div>
          <div className="flex gap-1.5">
            <div className="flex-1 bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-muted-foreground truncate select-all">
              {referral.referralUrl}
            </div>
            <Button size="sm" variant="outline" className="h-8 px-2.5 shrink-0 gap-1.5 text-xs"
              onClick={handleCopy}>
              {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0"
              onClick={handleShare}>
              <Share2 size={11} />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Your invite code: <span className="font-mono font-bold text-foreground">{referral.code}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Friends Invited" value={referral.referralCount} icon={<Users size={12} />} />
        <StatCard label="Credits Earned" value={`+${referral.totalCreditsEarned.toLocaleString()}`} icon={<Zap size={12} />} />
      </div>

      {/* Progress to next tier */}
      {referral.nextTier && referral.progressToNext && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress to next reward</span>
            <span className="font-bold text-primary">+{referral.nextTier.bonus.toLocaleString()} credits</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted/40 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{referral.progressToNext.current} / {referral.progressToNext.target} invites</span>
            <span>{referral.nextTier.label}</span>
          </div>
        </div>
      )}

      {/* Reward tiers */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Reward Tiers</div>
        {referral.tiers.map(tier => (
          <div key={tier.count} className={cn(
            "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors",
            tier.claimed ? "border-green-800/40 bg-green-900/10" : tier.reached ? "border-primary/30 bg-primary/5" : "border-border"
          )}>
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
              tier.claimed ? "bg-green-500/20" : tier.reached ? "bg-primary/20" : "bg-muted/40"
            )}>
              {tier.claimed ? <Check size={10} className="text-green-400" /> : <span className="text-[10px] font-bold">{tier.count}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{tier.count} invite{tier.count !== 1 ? "s" : ""} — {tier.label}</div>
            </div>
            <div className={cn("font-bold tabular-nums shrink-0", tier.claimed ? "text-green-400" : "text-primary")}>
              +{tier.bonus.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Redeem code (for new users) */}
      {!referral.referredBy && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="text-xs font-medium">Have an invite code?</div>
          <div className="flex gap-1.5">
            <input
              value={redeemCode}
              onChange={e => { setRedeemCode(e.target.value.toUpperCase()); setRedeemResult(null); }}
              placeholder="Enter code (e.g. A1B2C3D4)"
              maxLength={8}
              className="flex-1 bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono"
            />
            <Button size="sm" className="h-8 px-3 text-xs" onClick={handleRedeem} disabled={redeeming || !redeemCode}>
              Redeem
            </Button>
          </div>
          {redeemResult && (
            <div className={cn("text-[10px] rounded px-2 py-1", redeemResult.includes("credits") ? "text-green-400 bg-green-900/20" : "text-red-400 bg-red-900/20")}>
              {redeemResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Streak tab ────────────────────────────────────────────────────────────────

function StreakTab({ streak }: { streak: ReturnType<typeof useGrowth>["streak"] }) {
  if (!streak) return <SkeletonCard lines={5} />;

  // Build last 35 days grid
  const today = new Date();
  const days: { date: string; active: boolean; isToday: boolean }[] = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, active: streak.activeDates.includes(iso), isToday: i === 0 });
  }

  return (
    <div className="space-y-3">
      {/* Hero streak counter */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-orange-900/20 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-3xl font-black text-orange-400 tabular-nums leading-none">
              {streak.streakCount}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">day streak</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Longest</div>
            <div className="text-lg font-bold tabular-nums">{streak.longestStreak}</div>
            <div className="text-[10px] text-muted-foreground">days</div>
          </div>
          <div className="w-14 h-14 rounded-full bg-orange-900/30 border-2 border-orange-700/50 flex items-center justify-center">
            <Flame size={24} className={streak.activeToday ? "text-orange-400" : "text-muted-foreground"} />
          </div>
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">
          {streak.activeToday ? "✅ Active today — keep it up!" : "⚠️ Use the AI today to continue your streak"}
        </div>
      </div>

      {/* Activity calendar */}
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Last 35 days</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
          {["M","T","W","T","F","S","S"].map((d, i) => (
            <div key={i} className="text-[9px] text-center text-muted-foreground font-medium">{d}</div>
          ))}
          {days.map(day => (
            <div key={day.date} title={day.date}
              className={cn(
                "aspect-square rounded-sm transition-colors",
                day.isToday && day.active ? "bg-orange-400 ring-1 ring-orange-300" :
                day.isToday ? "ring-1 ring-border bg-muted/30" :
                day.active ? "bg-orange-500/70" : "bg-muted/20"
              )} />
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Milestones</div>
        {streak.milestones.map(m => (
          <div key={m.days} className={cn(
            "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs",
            m.claimed ? "border-green-800/40 bg-green-900/10" :
            m.reached ? "border-orange-800/40 bg-orange-900/10" : "border-border"
          )}>
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm",
              m.claimed ? "bg-green-500/20" : m.reached ? "bg-orange-500/20" : "bg-muted/40"
            )}>
              {m.claimed ? "✅" : m.reached ? "🔓" : "🔒"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{m.label}</div>
              <div className="text-[10px] text-muted-foreground">
                {m.claimed ? "Reward claimed" : m.reached ? "Reward granted" :
                  `${m.daysAway} more day${m.daysAway !== 1 ? "s" : ""} to go`}
              </div>
            </div>
            <div className={cn("font-bold tabular-nums shrink-0 text-xs",
              m.claimed || m.reached ? "text-orange-400" : "text-muted-foreground")}>
              +{m.credits.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {streak.totalStreakCredits > 0 && (
        <div className="text-center text-xs text-muted-foreground">
          Total streak credits earned: <span className="font-bold text-orange-400">+{streak.totalStreakCredits.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

// ── Achievements tab ──────────────────────────────────────────────────────────

function AchievementsTab({ data, onUnlock }: {
  data: ReturnType<typeof useGrowth>["achievements"];
  onUnlock: (id: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  const MANUAL_UNLOCK = ["first-commit", "first-deploy", "first-plugin"];

  const handleUnlock = async (id: string) => {
    const result = await onUnlock(id);
    setMsg(result.message);
    setTimeout(() => setMsg(null), 3000);
  };

  if (!data) return <SkeletonCard lines={6} />;

  return (
    <div className="space-y-3">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Unlocked" value={`${data.totalUnlocked}/${data.totalAchievements}`} icon={<Trophy size={12} />} />
        <StatCard label="AI Calls" value={data.aiGenCount} icon={<Zap size={12} />} />
        <StatCard label="Credits" value={`+${data.totalCreditsEarned.toLocaleString()}`} icon={<Star size={12} />} />
      </div>

      {msg && (
        <div className="text-xs rounded-lg bg-green-900/20 border border-green-800/40 text-green-400 px-3 py-2 text-center">
          {msg}
        </div>
      )}

      {/* Achievement grid */}
      <div className="space-y-2">
        {data.achievements.map(a => (
          <div key={a.id} className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
            a.unlocked ? "border-primary/20 bg-primary/5" : "border-border opacity-70"
          )}>
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0",
              a.unlocked ? "bg-primary/20" : "bg-muted/40 grayscale"
            )}>
              {a.unlocked ? a.icon : "🔒"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                {a.title}
                {a.unlocked && <Check size={10} className="text-green-400" />}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">{a.description}</div>
              {a.unlockedAt && (
                <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                  {new Date(a.unlockedAt).toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              {a.credits > 0 && (
                <span className={cn("text-[10px] font-bold tabular-nums",
                  a.unlocked ? "text-primary" : "text-muted-foreground")}>
                  +{a.credits.toLocaleString()}
                </span>
              )}
              {!a.unlocked && MANUAL_UNLOCK.includes(a.id) && (
                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                  onClick={() => handleUnlock(a.id)}>
                  Claim
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-2.5 text-center space-y-0.5">
      <div className="flex items-center justify-center text-muted-foreground">{icon}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SkeletonCard({ lines }: { lines: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn("h-8 rounded-lg bg-muted/30", i === 0 ? "h-24" : "")} />
      ))}
    </div>
  );
}
