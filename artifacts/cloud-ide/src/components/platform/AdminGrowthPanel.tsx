import React, { useState, useCallback } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import {
  Users, Gift, Flame, Trophy, Zap, AlertTriangle,
  RefreshCw, TrendingUp, ShieldAlert, Crown,
} from "lucide-react";
import { cn } from "../../lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GrowthStats {
  totalUsers: number;
  totalReferrals: number;
  usersWithReferrer: number;
  conversionRate: string;
  totalCreditsGrantedViaReferrals: number;
  suspiciousUsers: number;
  tierDistribution: { tier: string; count: number; usersReached: number; claimed: number }[];
}

interface TopReferrer {
  userId: string;
  code: string;
  referralCount: number;
  rewardsClaimed: number[];
  suspiciousScore: number;
  createdAt: string;
}

interface SuspiciousUser {
  userId: string;
  code: string;
  suspiciousScore: number;
  referralCount: number;
  registrationIp: string | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className={cn("rounded-xl border p-3 space-y-1", color)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className="opacity-60">{icon}</div>
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 3600000) return `${Math.round(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.round(d / 3600000)}h ago`;
  return `${Math.round(d / 86400000)}d ago`;
}

const TIER_BONUS: Record<number, number> = { 1: 2000, 5: 15000, 10: 50000 };

// ── Component ─────────────────────────────────────────────────────────────────

type GrowthAdminTab = "overview" | "referrers" | "suspicious";

export function AdminGrowthPanel() {
  const { token } = usePlatform();
  const [tab, setTab] = useState<GrowthAdminTab>("overview");
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [referrers, setReferrers] = useState<TopReferrer[]>([]);
  const [suspicious, setSuspicious] = useState<SuspiciousUser[]>([]);

  const h = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sRes, rRes, susRes] = await Promise.all([
        fetch("/api/admin/growth/stats", { headers: h() }),
        fetch("/api/admin/growth/referrers", { headers: h() }),
        fetch("/api/admin/referrals/suspicious", { headers: h() }),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (rRes.ok) { const d = await rRes.json(); setReferrers(d.referrers ?? []); }
      if (susRes.ok) { const d = await susRes.json(); setSuspicious(d.suspicious ?? []); }
    } catch {}
    finally { setLoading(false); }
  }, [token, h]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  const TABS: { id: GrowthAdminTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",   label: "Overview",   icon: <TrendingUp size={11} /> },
    { id: "referrers",  label: "Top Referrers", icon: <Crown size={11} /> },
    { id: "suspicious", label: "Suspicious",    icon: <ShieldAlert size={11} /> },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-0 shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}>
            {t.icon}{t.label}
            {t.id === "suspicious" && suspicious.length > 0 && (
              <Badge className="h-4 px-1 text-[9px] bg-red-600 hover:bg-red-600 ml-0.5">
                {suspicious.length}
              </Badge>
            )}
          </button>
        ))}
        <button onClick={loadAll} disabled={loading}
          className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">

          {/* ── Overview ──────────────────────────────────────────────── */}
          {tab === "overview" && (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-2">
                <KpiCard
                  label="Total Users"
                  value={stats?.totalUsers ?? "–"}
                  icon={<Users size={13} />}
                  color="border-border"
                />
                <KpiCard
                  label="Referral Conversions"
                  value={stats?.conversionRate ?? "–"}
                  sub={`${stats?.usersWithReferrer ?? 0} referred users`}
                  icon={<Gift size={13} />}
                  color="border-border"
                />
                <KpiCard
                  label="Total Referrals"
                  value={stats?.totalReferrals ?? "–"}
                  icon={<TrendingUp size={13} />}
                  color="border-border"
                />
                <KpiCard
                  label="Credits via Referrals"
                  value={stats ? `+${stats.totalCreditsGrantedViaReferrals.toLocaleString()}` : "–"}
                  icon={<Zap size={13} />}
                  color="border-border"
                />
              </div>

              {/* Tier distribution */}
              {stats && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Referral Tier Distribution
                  </div>
                  {stats.tierDistribution.map(tier => {
                    const pct = stats.totalUsers > 0
                      ? Math.round((tier.usersReached / stats.totalUsers) * 100) : 0;
                    return (
                      <div key={tier.tier} className="rounded-lg border border-border p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{tier.tier}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {tier.usersReached} reached · {tier.claimed} claimed
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
                          <div className="h-full bg-primary/70 rounded-full transition-all"
                            style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{pct}% of users reached</span>
                          <span className="font-bold text-primary">
                            +{(TIER_BONUS[tier.count] ?? 0).toLocaleString()} credits
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Suspicious alert */}
              {stats && stats.suspiciousUsers > 0 && (
                <div className="flex items-center gap-2.5 rounded-lg border border-red-800/40 bg-red-900/10 px-3 py-2.5">
                  <AlertTriangle size={13} className="text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-red-300">
                      {stats.suspiciousUsers} suspicious account{stats.suspiciousUsers !== 1 ? "s" : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Possible referral farming detected
                    </div>
                  </div>
                  <Button size="sm" variant="outline"
                    className="h-6 px-2 text-[10px] border-red-800/40 text-red-300 hover:bg-red-900/20"
                    onClick={() => setTab("suspicious")}>
                    Review
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ── Top Referrers ──────────────────────────────────────────── */}
          {tab === "referrers" && (
            <div className="space-y-2">
              {referrers.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-8">
                  No referrals yet
                </div>
              )}
              {referrers.map((r, i) => (
                <div key={r.userId} className="rounded-lg border border-border p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                      i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                      i === 1 ? "bg-slate-400/20 text-slate-300" :
                      i === 2 ? "bg-amber-700/20 text-amber-600" :
                      "bg-muted/40 text-muted-foreground"
                    )}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono font-semibold truncate">{r.userId.slice(0, 8)}…</div>
                      <div className="text-[10px] text-muted-foreground">
                        Code: <span className="font-mono text-foreground">{r.code}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold tabular-nums text-primary">{r.referralCount}</div>
                      <div className="text-[10px] text-muted-foreground">referrals</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.rewardsClaimed.length > 0 && (
                      <div className="flex gap-1">
                        {r.rewardsClaimed.map(c => (
                          <Badge key={c} className="h-4 px-1.5 text-[9px] bg-green-900/30 text-green-400 border-green-800/30">
                            {c}-invite
                          </Badge>
                        ))}
                      </div>
                    )}
                    {r.suspiciousScore > 0 && (
                      <Badge className="h-4 px-1.5 text-[9px] bg-red-900/30 text-red-400 border-red-800/30">
                        score: {r.suspiciousScore}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {timeAgo(r.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Suspicious ─────────────────────────────────────────────── */}
          {tab === "suspicious" && (
            <div className="space-y-2">
              {suspicious.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-8">
                  No suspicious activity detected
                </div>
              )}
              {suspicious.map(s => (
                <div key={s.userId}
                  className="rounded-lg border border-red-800/30 bg-red-900/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={13} className="text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono font-semibold truncate">{s.userId.slice(0, 12)}…</div>
                      <div className="text-[10px] text-muted-foreground">
                        Code: <span className="font-mono">{s.code}</span>
                        {s.registrationIp && (
                          <> · IP: <span className="font-mono">{s.registrationIp.slice(0, 15)}</span></>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn(
                        "text-sm font-bold tabular-nums",
                        s.suspiciousScore >= 10 ? "text-red-400" : "text-amber-400"
                      )}>
                        {s.suspiciousScore}
                      </div>
                      <div className="text-[10px] text-muted-foreground">risk score</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{s.referralCount} referrals</span>
                    <span>·</span>
                    <span>{timeAgo(s.createdAt)}</span>
                    <Badge className={cn(
                      "h-4 px-1.5 text-[9px] ml-auto",
                      s.suspiciousScore >= 10
                        ? "bg-red-900/40 text-red-300 border-red-800/40"
                        : "bg-amber-900/30 text-amber-300 border-amber-800/30"
                    )}>
                      {s.suspiciousScore >= 10 ? "High Risk" : "Medium Risk"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
