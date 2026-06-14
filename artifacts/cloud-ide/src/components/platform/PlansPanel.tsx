import React, { useState, useEffect } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import {
  Zap, Rocket, Users, Building2, Check, Loader2,
  BarChart3, HardDrive, Wifi, BrainCircuit,
} from "lucide-react";
import { cn } from "../../lib/utils";

// ── Plan definitions ──────────────────────────────────────────────────────────

interface Plan {
  id: "free" | "pro" | "team" | "enterprise";
  label: string;
  price: string;
  priceNote: string;
  credits: number;
  bonusCredits: number;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  features: string[];
  highlight?: string;
}

const PLANS: Plan[] = [
  {
    id: "free",
    label: "Free",
    price: "$0",
    priceNote: "forever",
    credits: 100,
    bonusCredits: 0,
    icon: <Zap size={16} />,
    color: "text-muted-foreground",
    borderColor: "border-border",
    features: [
      "100 credits/month",
      "3 projects",
      "Community support",
      "Basic IDE features",
      "Public deployments",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    price: "$9",
    priceNote: "/month",
    credits: 600,
    bonusCredits: 500,
    icon: <Rocket size={16} />,
    color: "text-blue-400",
    borderColor: "border-blue-600/40",
    highlight: "Most Popular",
    features: [
      "600 credits/month",
      "Unlimited projects",
      "Priority support",
      "Container runtime",
      "Custom domains",
      "Marketplace access",
      "AI autocomplete",
    ],
  },
  {
    id: "team",
    label: "Team",
    price: "$29",
    priceNote: "/month",
    credits: 2100,
    bonusCredits: 2000,
    icon: <Users size={16} />,
    color: "text-purple-400",
    borderColor: "border-purple-600/40",
    features: [
      "2100 credits/month",
      "Up to 10 team members",
      "Shared workspaces",
      "SSO & SAML",
      "Audit logs",
      "Advanced analytics",
      "Creator program",
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "$99",
    priceNote: "/month",
    credits: 10000,
    bonusCredits: 9000,
    icon: <Building2 size={16} />,
    color: "text-yellow-400",
    borderColor: "border-yellow-600/40",
    features: [
      "10,000 credits/month",
      "Unlimited team members",
      "On-premise deployment",
      "Dedicated support SLA",
      "Custom AI models",
      "Advanced fraud protection",
      "Revenue share program",
      "White-label option",
    ],
  },
];

// ── Usage rates ───────────────────────────────────────────────────────────────

const USAGE_RATES = [
  { icon: <BrainCircuit size={12} />, label: "AI tokens", rate: "1 cr per 1,000 tokens" },
  { icon: <BarChart3 size={12} />,    label: "Compute",   rate: "2 cr per CPU-minute" },
  { icon: <HardDrive size={12} />,    label: "Storage",   rate: "0.5 cr per GB/month" },
  { icon: <Wifi size={12} />,         label: "Bandwidth", rate: "0.5 cr per GB" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export function PlansPanel() {
  const { token } = usePlatform();
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [credits, setCredits] = useState<number>(0);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUsage, setShowUsage] = useState(false);

  const h = { Authorization: `Bearer ${token}` };

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch("/api/billing/credits", { headers: h });
      const d = await r.json();
      setCurrentPlan(d.plan ?? "free");
      setCredits(d.credits ?? 0);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    try {
      await fetch("/api/billing/plan", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      await load();
    } finally { setUpgrading(null); }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">

          {/* Current plan banner */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Current Plan</span>
              <Badge variant="outline" className="text-[9px] capitalize px-1.5 h-4 border-primary/40 text-primary">
                {currentPlan}
              </Badge>
            </div>
            <div className="text-2xl font-bold tabular-nums">{credits.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">credits remaining</div>
          </div>

          {/* Plan cards */}
          <div className="space-y-2.5">
            {PLANS.map(plan => {
              const isActive = currentPlan === plan.id;
              return (
                <div key={plan.id}
                  className={cn(
                    "rounded-xl border p-3 space-y-3 transition-all",
                    isActive ? `${plan.borderColor} bg-card` : "border-border hover:border-muted-foreground/20"
                  )}>
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("opacity-80", plan.color)}>{plan.icon}</div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold">{plan.label}</span>
                          {plan.highlight && (
                            <Badge className="h-3.5 px-1 text-[8px] bg-blue-600/20 text-blue-400 border-blue-600/30">
                              {plan.highlight}
                            </Badge>
                          )}
                          {isActive && <Check size={11} className="text-primary" />}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="font-bold text-foreground text-sm">{plan.price}</span>
                          {plan.priceNote}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-sm font-bold tabular-nums", plan.color)}>
                        {plan.credits.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-muted-foreground">cr/month</div>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="space-y-1">
                    {plan.features.map(f => (
                      <div key={f} className="flex items-center gap-1.5 text-[10px]">
                        <Check size={9} className={cn("shrink-0", plan.color)} />
                        <span className="text-foreground/80">{f}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  {!isActive && (
                    <Button
                      size="sm"
                      className={cn(
                        "w-full h-7 text-xs",
                        plan.id === "enterprise" ? "bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 border border-yellow-600/30" : ""
                      )}
                      variant={plan.id === "pro" ? "default" : "outline"}
                      disabled={upgrading === plan.id}
                      onClick={() => handleUpgrade(plan.id)}
                    >
                      {upgrading === plan.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : plan.id === "free"
                          ? "Downgrade to Free"
                          : <>Upgrade to {plan.label} · {plan.bonusCredits > 0 ? `+${plan.bonusCredits.toLocaleString()} bonus cr` : ""}</>
                      }
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Usage-based pricing */}
          <div className="space-y-2">
            <button
              onClick={() => setShowUsage(v => !v)}
              className="w-full flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-1">
              Usage-Based Pricing
              <span className="normal-case font-normal">{showUsage ? "▲" : "▼"}</span>
            </button>
            {showUsage && (
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {USAGE_RATES.map(r => (
                  <div key={r.label} className="flex items-center gap-2.5 px-3 py-2">
                    <div className="text-muted-foreground shrink-0">{r.icon}</div>
                    <div className="flex-1 text-xs">{r.label}</div>
                    <div className="text-[10px] font-mono text-primary">{r.rate}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
