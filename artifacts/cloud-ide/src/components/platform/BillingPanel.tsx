import React, { useState, useEffect } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Loader2, CreditCard, TrendingDown, Plus, Zap, Rocket, Users, Check } from "lucide-react";

interface BillingInfo {
  credits: number;
  plan: "free" | "pro" | "team";
  totalSpent: number;
}

interface UsageEvent {
  id: string;
  type: string;
  cost: number;
  description: string;
  timestamp: string;
}

const PLAN_COLORS = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  team: "bg-purple-600/20 text-purple-400 border-purple-600/30",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  "build": "text-amber-400",
  "container-build": "text-orange-400",
  "deploy-minute": "text-green-400",
  "ai-call": "text-blue-400",
  "storage": "text-cyan-400",
  "credit-add": "text-emerald-400",
};

export function BillingPanel() {
  const { token } = usePlatform();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [usage, setUsage] = useState<UsageEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState(100);
  const [isAdding, setIsAdding] = useState(false);

  const auth = { Authorization: `Bearer ${token}` };

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [b, u] = await Promise.all([
        fetch("/api/billing/credits", { headers: auth }).then(r => r.json()),
        fetch("/api/billing/usage?limit=30", { headers: auth }).then(r => r.json()),
      ]);
      setBilling(b);
      setUsage(u.events ?? []);
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const handleUpgrade = async (plan: string) => {
    setIsUpgrading(plan);
    try {
      await fetch("/api/billing/plan", {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      await load();
    } finally {
      setIsUpgrading(null);
    }
  };

  const handleAddCredits = async () => {
    setIsAdding(true);
    try {
      await fetch("/api/billing/add", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: addAmount }),
      });
      await load();
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  const plans = [
    { id: "free", label: "Free", icon: <Zap size={14} />, credits: "100", price: "$0", features: ["100 credits/month", "3 projects", "Community support"] },
    { id: "pro", label: "Pro", icon: <Rocket size={14} />, credits: "+500 bonus", price: "$9/mo", features: ["600 credits/month", "Unlimited projects", "Priority support", "Container runtime"] },
    { id: "team", label: "Team", icon: <Users size={14} />, credits: "+2000 bonus", price: "$29/mo", features: ["2100 credits/month", "Team collaboration", "Shared projects", "SSO & SAML"] },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Credit balance */}
        <div className="p-4 rounded-lg border border-border bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Credit Balance</span>
            <Badge variant="outline" className={`text-[10px] px-2 py-0 ${PLAN_COLORS[billing?.plan ?? "free"]}`}>
              {billing?.plan?.toUpperCase()}
            </Badge>
          </div>
          <div className="text-3xl font-bold text-foreground tabular-nums">{billing?.credits ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {billing?.totalSpent ?? 0} credits spent total
          </div>

          <div className="mt-3 flex items-center space-x-2">
            <input
              type="number"
              min={10}
              max={10000}
              value={addAmount}
              onChange={e => setAddAmount(parseInt(e.target.value) || 100)}
              className="flex-1 h-7 px-2 text-xs bg-background border border-border rounded-md text-foreground"
            />
            <Button size="sm" className="h-7 text-xs px-3" disabled={isAdding} onClick={handleAddCredits}>
              {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus size={12} className="mr-1" />Add</>}
            </Button>
          </div>
        </div>

        {/* Plan cards */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Plans</div>
          <div className="space-y-2">
            {plans.map(plan => (
              <div key={plan.id} className={`p-3 rounded-lg border transition-colors ${billing?.plan === plan.id ? "border-primary/50 bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">{plan.icon}</span>
                    <span className="text-sm font-semibold">{plan.label}</span>
                    {billing?.plan === plan.id && <Check size={12} className="text-primary" />}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{plan.price}</span>
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5 mb-2">
                  {plan.features.map(f => <div key={f}>• {f}</div>)}
                </div>
                {billing?.plan !== plan.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-6 text-[11px]"
                    disabled={isUpgrading === plan.id}
                    onClick={() => handleUpgrade(plan.id)}
                  >
                    {isUpgrading === plan.id ? <Loader2 className="w-3 h-3 animate-spin" /> : `Switch to ${plan.label} (${plan.credits})`}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Usage history */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Usage</div>
            <TrendingDown size={12} className="text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            {usage.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4">No usage yet</p>
            ) : (
              usage.map(ev => (
                <div key={ev.id} className="flex items-center justify-between text-[11px] py-1 border-b border-border/50">
                  <div className="min-w-0">
                    <span className={`font-medium ${EVENT_TYPE_COLORS[ev.type] ?? "text-muted-foreground"}`}>
                      {ev.type.replace(/-/g, " ")}
                    </span>
                    <div className="text-muted-foreground truncate max-w-[160px]">{ev.description}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className={ev.cost === 0 ? "text-emerald-400" : "text-foreground"}>
                      {ev.cost === 0 ? "+free" : `-${ev.cost}`}
                    </div>
                    <div className="text-muted-foreground/60">{new Date(ev.timestamp).toLocaleDateString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
