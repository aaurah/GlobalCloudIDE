import React, { useState, useEffect, useCallback } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import {
  DollarSign, TrendingUp, Clock, CheckCircle2, XCircle,
  Loader2, RefreshCw, CreditCard, BarChart3, Zap,
} from "lucide-react";
import { cn } from "../../lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreatorStats {
  totalEarned: number;
  pendingPayout: number;
  paidOut: number;
  totalSales: number;
  byItem: { itemId: string; total: number; sales: number }[];
}

interface DailyEarning { date: string; amount: number; }

interface PayoutRequest {
  id: string;
  amount: number;
  method: string;
  methodDetails: string;
  status: "pending" | "approved" | "rejected" | "paid";
  requestedAt: string;
  processedAt?: string;
  adminNote?: string;
}

type DashTab = "overview" | "earnings" | "payouts";

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-amber-900/30 text-amber-400 border-amber-800/30",
  approved: "bg-blue-900/30 text-blue-400 border-blue-800/30",
  paid:     "bg-green-900/30 text-green-400 border-green-800/30",
  rejected: "bg-red-900/30 text-red-400 border-red-800/30",
};

function miniBar(values: number[]): React.ReactNode {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {values.map((v, i) => (
        <div key={i}
          className="flex-1 rounded-sm bg-primary/40 transition-all"
          style={{ height: `${Math.max((v / max) * 100, v > 0 ? 8 : 2)}%` }} />
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CreatorDashboard() {
  const { token } = usePlatform();
  const [tab, setTab] = useState<DashTab>("overview");
  const [loading, setLoading] = useState(false);
  const [isCreator, setIsCreator] = useState<boolean | null>(null);

  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [dailyEarnings, setDailyEarnings] = useState<DailyEarning[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);

  // Payout form
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"paypal" | "stripe" | "bank">("paypal");
  const [methodDetails, setMethodDetails] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");

  // Register form
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  const h = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch("/api/creator/dashboard", { headers: h() });
      if (r.ok) {
        const d = await r.json();
        setIsCreator(d.profile?.isCreator ?? false);
        setStats(d.stats);
        setDailyEarnings(d.dailyEarnings ?? []);
        setPayouts(d.payouts ?? []);
        const er = await fetch("/api/creator/earnings?limit=30", { headers: h() });
        if (er.ok) { const ed = await er.json(); setEarnings(ed.earnings ?? []); }
      }
    } catch {}
    setLoading(false);
  }, [token, h]);

  useEffect(() => { load(); }, [load]);

  const handleRegister = async () => {
    setRegisterLoading(true);
    try {
      const r = await fetch("/api/creator/register", {
        method: "POST", headers: h(),
        body: JSON.stringify({ displayName, bio }),
      });
      if (r.ok) { await load(); }
    } finally { setRegisterLoading(false); }
  };

  const handlePayoutRequest = async () => {
    setPayoutError("");
    const amt = parseInt(amount);
    if (!amt || amt < 100) { setPayoutError("Minimum payout is 100 credits"); return; }
    if (!methodDetails) { setPayoutError("Please enter payment details"); return; }
    setPayoutLoading(true);
    try {
      const r = await fetch("/api/creator/payouts/request", {
        method: "POST", headers: h(),
        body: JSON.stringify({ amount: amt, method, methodDetails }),
      });
      const d = await r.json();
      if (!r.ok) { setPayoutError(d.error ?? "Failed"); }
      else { setAmount(""); setMethodDetails(""); await load(); }
    } finally { setPayoutLoading(false); }
  };

  if (!token) return (
    <div className="flex-1 flex items-center justify-center p-6 text-center">
      <p className="text-xs text-muted-foreground">Sign in to access the creator dashboard</p>
    </div>
  );

  if (loading && isCreator === null) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  // Not a creator yet — registration flow
  if (isCreator === false) return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="text-center space-y-2">
          <div className="text-2xl">🎨</div>
          <div className="text-sm font-bold">Become a Creator</div>
          <p className="text-xs text-muted-foreground">Sell plugins, agents, and templates. Earn 70% of every sale.</p>
        </div>

        <div className="rounded-xl border border-border p-3 space-y-3 text-xs">
          {[
            ["70% revenue share", "Keep the majority of every sale"],
            ["Global marketplace", "Reach thousands of developers"],
            ["Instant payouts", "Request payouts via PayPal or Stripe"],
          ].map(([title, desc]) => (
            <div key={title} className="flex items-start gap-2">
              <CheckCircle2 size={12} className="text-green-400 mt-0.5 shrink-0" />
              <div><div className="font-medium">{title}</div><div className="text-muted-foreground">{desc}</div></div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <input className="w-full h-8 px-2.5 bg-input border border-border rounded-lg text-xs outline-none focus:ring-1 ring-primary"
            placeholder="Display name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          <textarea className="w-full bg-input border border-border rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-1 ring-primary resize-none"
            placeholder="Short bio (optional)" rows={3} value={bio} onChange={e => setBio(e.target.value)} />
          <Button className="w-full h-8 text-xs" disabled={!displayName || registerLoading} onClick={handleRegister}>
            {registerLoading ? <Loader2 size={12} className="animate-spin" /> : "Become a Creator →"}
          </Button>
        </div>
      </div>
    </div>
  );

  const TABS: { id: DashTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",  label: "Overview",  icon: <BarChart3 size={10} /> },
    { id: "earnings",  label: "Earnings",  icon: <TrendingUp size={10} /> },
    { id: "payouts",   label: "Payouts",   icon: <DollarSign size={10} /> },
  ];

  const weekVals = dailyEarnings.slice(-7).map(d => d.amount);
  const monthTotal = dailyEarnings.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0 bg-background/30">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-2 text-[10px] font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {t.icon}{t.label}
          </button>
        ))}
        <button onClick={load} className="ml-auto px-2 text-muted-foreground hover:text-foreground">
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">

          {/* ── Overview ───────────────────────────────────────────── */}
          {tab === "overview" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Total Earned", value: `${stats?.totalEarned ?? 0} cr`, icon: <Zap size={12} />, color: "text-primary" },
                  { label: "Pending Payout", value: `${stats?.pendingPayout ?? 0} cr`, icon: <Clock size={12} />, color: "text-amber-400" },
                  { label: "Paid Out", value: `${stats?.paidOut ?? 0} cr`, icon: <CheckCircle2 size={12} />, color: "text-green-400" },
                  { label: "Total Sales", value: stats?.totalSales ?? 0, icon: <CreditCard size={12} />, color: "text-blue-400" },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-xl border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{kpi.label}</span>
                      <span className={cn("opacity-60", kpi.color)}>{kpi.icon}</span>
                    </div>
                    <div className={cn("text-lg font-bold tabular-nums", kpi.color)}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {weekVals.some(v => v > 0) && (
                <div className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Last 7 Days</span>
                    <span className="text-xs font-bold text-primary">{weekVals.reduce((s, v) => s + v, 0)} cr</span>
                  </div>
                  {miniBar(weekVals)}
                  <div className="text-[10px] text-muted-foreground">Month total: {monthTotal} cr</div>
                </div>
              )}

              {(stats?.byItem ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Top Items</div>
                  {(stats?.byItem ?? []).sort((a, b) => b.total - a.total).slice(0, 5).map(item => (
                    <div key={item.itemId} className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                      <span className="text-muted-foreground font-mono text-[10px] truncate max-w-[150px]">{item.itemId}</span>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-primary">{item.total} cr</div>
                        <div className="text-[9px] text-muted-foreground">{item.sales} sales</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Earnings history ──────────────────────────────────── */}
          {tab === "earnings" && (
            <div className="space-y-1.5">
              {earnings.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-6">No earnings yet</p>
              )}
              {earnings.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[160px]">{e.itemId}</div>
                    <div className="text-[9px] text-muted-foreground/60">{e.timestamp?.slice(0, 10)}</div>
                  </div>
                  <div className="font-bold text-green-400 shrink-0">+{e.amount} cr</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Payouts ───────────────────────────────────────────── */}
          {tab === "payouts" && (
            <>
              {/* Request form */}
              <div className="rounded-xl border border-border p-3 space-y-2.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Request Payout</div>
                <div className="text-xs text-muted-foreground">Available: <span className="font-bold text-foreground">{stats?.pendingPayout ?? 0} credits</span></div>

                <input type="number" min={100} className="w-full h-7 px-2 bg-input border border-border rounded-md text-xs outline-none focus:ring-1 ring-primary"
                  placeholder="Amount (min 100)" value={amount} onChange={e => setAmount(e.target.value)} />

                <div className="flex gap-1">
                  {(["paypal", "stripe", "bank"] as const).map(m => (
                    <button key={m} onClick={() => setMethod(m)}
                      className={cn(
                        "flex-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors capitalize",
                        method === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      )}>
                      {m}
                    </button>
                  ))}
                </div>

                <input className="w-full h-7 px-2 bg-input border border-border rounded-md text-xs outline-none focus:ring-1 ring-primary"
                  placeholder={method === "paypal" ? "PayPal email" : method === "stripe" ? "Stripe account ID" : "Bank account info"}
                  value={methodDetails} onChange={e => setMethodDetails(e.target.value)} />

                {payoutError && <p className="text-[10px] text-red-400">{payoutError}</p>}

                <Button className="w-full h-7 text-xs" disabled={payoutLoading} onClick={handlePayoutRequest}>
                  {payoutLoading ? <Loader2 size={11} className="animate-spin" /> : "Request Payout"}
                </Button>
              </div>

              {/* History */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Payout History</div>
                {payouts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No payouts yet</p>}
                {payouts.map(p => (
                  <div key={p.id} className="rounded-lg border border-border p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm">{p.amount} cr</div>
                      <Badge className={cn("h-4 px-1.5 text-[9px] border", STATUS_BADGE[p.status])}>
                        {p.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="capitalize">{p.method}</span>
                      <span>·</span>
                      <span>{p.requestedAt.slice(0, 10)}</span>
                    </div>
                    {p.adminNote && (
                      <div className="text-[10px] text-muted-foreground bg-muted/20 rounded px-2 py-1">{p.adminNote}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
