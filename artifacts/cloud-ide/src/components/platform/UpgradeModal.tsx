import React, { useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import type { TrialStatus } from "../../hooks/use-trial";
import {
  Zap, CheckCircle2, X, Loader2, AlertTriangle, Crown, Users,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onSubscribe: (plan: "pro" | "team") => Promise<void>;
  trial: TrialStatus | null;
}

const PLAN_DETAILS = {
  pro: {
    name: "Pro",
    price: "$9/mo",
    credits: "5,000",
    icon: <Zap size={16} className="text-yellow-400" />,
    color: "border-yellow-700/40 bg-yellow-900/10",
    ctaColor: "bg-yellow-500 hover:bg-yellow-400 text-black",
    features: [
      "5,000 AI credits per month",
      "Code generation & refactoring",
      "AI DevOps & deployments",
      "Admin AI assistant",
      "Priority support",
    ],
  },
  team: {
    name: "Team",
    price: "$29/mo",
    credits: "20,000",
    icon: <Users size={16} className="text-purple-400" />,
    color: "border-purple-700/40 bg-purple-900/10",
    ctaColor: "bg-purple-500 hover:bg-purple-400 text-white",
    features: [
      "20,000 AI credits per month",
      "Everything in Pro",
      "Team workspaces & sharing",
      "Shared AI quota",
      "Advanced audit logs",
      "Priority support",
    ],
  },
};

export function UpgradeModal({ open, onClose, onSubscribe, trial }: UpgradeModalProps) {
  const [loading, setLoading] = useState<"pro" | "team" | null>(null);
  const [success, setSuccess] = useState<"pro" | "team" | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"pro" | "team">("pro");

  if (!open) return null;

  const handleSubscribe = async (plan: "pro" | "team") => {
    setLoading(plan);
    try {
      await onSubscribe(plan);
      setSuccess(plan);
      setTimeout(onClose, 1800);
    } catch {}
    finally { setLoading(null); }
  };

  const exhausted = trial && !trial.canUseAi;
  const progressPct = trial?.percentUsed ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Header */}
          <div className="relative px-5 pt-5 pb-4 border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
            >
              <X size={15} />
            </button>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                <Crown size={14} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Upgrade your plan</h2>
                <p className="text-[11px] text-muted-foreground">Unlock unlimited AI features</p>
              </div>
            </div>

            {/* Trial status pill */}
            {trial && (
              <div className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
                exhausted ? "bg-red-950/30 border border-red-900/40" : "bg-amber-950/20 border border-amber-900/30"
              )}>
                {exhausted
                  ? <AlertTriangle size={11} className="text-red-400 shrink-0" />
                  : <Zap size={11} className="text-amber-400 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  {exhausted
                    ? <span className="text-red-300 font-medium">Your free trial has ended</span>
                    : <span className="text-amber-300">
                        <span className="font-bold">{trial.trialCreditsRemaining.toLocaleString()}</span> trial credits remaining
                      </span>
                  }
                </div>
                {!exhausted && (
                  <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, progressPct)}%` }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Plan selector */}
          <div className="p-4 space-y-3">
            {success ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-12 h-12 rounded-full bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 size={24} className="text-green-400" />
                </div>
                <p className="text-sm font-semibold text-green-400">
                  Upgraded to {PLAN_DETAILS[success].name}!
                </p>
                <p className="text-xs text-muted-foreground">
                  {PLAN_DETAILS[success].credits} AI credits added to your account.
                </p>
              </div>
            ) : (
              <>
                {/* Plan tabs */}
                <div className="flex gap-1 p-1 bg-muted/30 rounded-xl">
                  {(["pro", "team"] as const).map(p => (
                    <button key={p} onClick={() => setSelectedPlan(p)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        selectedPlan === p ? "bg-background shadow text-foreground" : "text-muted-foreground"
                      )}>
                      {PLAN_DETAILS[p].name}
                    </button>
                  ))}
                </div>

                {/* Plan card */}
                {(["pro", "team"] as const).filter(p => p === selectedPlan).map(plan => {
                  const d = PLAN_DETAILS[plan];
                  return (
                    <div key={plan} className={cn("rounded-xl border p-4 space-y-3", d.color)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {d.icon}
                          <span className="text-sm font-bold">{d.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-bold">{d.price}</div>
                          <div className="text-[10px] text-muted-foreground">{d.credits} AI credits/mo</div>
                        </div>
                      </div>

                      <ul className="space-y-1.5">
                        {d.features.map(f => (
                          <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CheckCircle2 size={10} className="text-green-400 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      <Button
                        className={cn("w-full h-9 text-sm font-bold touch-manipulation", d.ctaColor)}
                        disabled={loading === plan}
                        onClick={() => handleSubscribe(plan)}
                      >
                        {loading === plan
                          ? <Loader2 size={14} className="animate-spin" />
                          : `Upgrade to ${d.name}`
                        }
                      </Button>
                    </div>
                  );
                })}

                <p className="text-[10px] text-muted-foreground text-center">
                  Demo mode — no payment required. Credits are added instantly.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
