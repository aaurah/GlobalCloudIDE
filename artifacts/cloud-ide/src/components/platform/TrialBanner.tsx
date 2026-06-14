import React, { useState } from "react";
import { useTrial } from "../../hooks/use-trial";
import { UpgradeModal } from "./UpgradeModal";
import { Button } from "../ui/button";
import { Zap, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/utils";

export function TrialBanner() {
  const { trial, upgradeModalOpen, openUpgradeModal, closeUpgradeModal, subscribe } = useTrial();
  const [dismissed, setDismissed] = useState(false);

  // Don't show for paid plans or if no trial data yet
  if (!trial || dismissed) return null;
  if (trial.plan === "pro" || trial.plan === "team") return null;
  // Don't show if trial is healthy and > 50% remaining
  if (trial.active && trial.percentUsed < 50) return null;

  const exhausted = !trial.canUseAi && trial.isTrial;
  const critical = trial.percentUsed >= 90;
  const warning  = trial.percentUsed >= 75 && trial.percentUsed < 90;
  const expired  = trial.expired;

  return (
    <>
      <div className={cn(
        "shrink-0 px-3 py-1.5 flex items-center gap-2.5 text-xs border-b transition-colors",
        exhausted || expired
          ? "bg-red-950/30 border-red-900/40 text-red-300"
          : critical
          ? "bg-orange-950/30 border-orange-900/40 text-orange-300"
          : "bg-amber-950/20 border-amber-900/30 text-amber-300"
      )}>
        {/* Icon */}
        <div className="shrink-0">
          {exhausted || expired
            ? <AlertTriangle size={12} className="text-red-400" />
            : <Zap size={12} className={critical ? "text-orange-400" : "text-amber-400"} />
          }
        </div>

        {/* Message */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="font-semibold shrink-0">
            {expired ? "Trial expired" : exhausted ? "Trial exhausted" : "Free AI Trial"}
          </span>
          <span className="text-[10px] opacity-75 truncate hidden sm:block">
            {expired
              ? "Your 14-day trial has ended."
              : exhausted
              ? "All trial credits used."
              : `${trial.trialCreditsRemaining.toLocaleString()} of ${trial.trialCreditLimit.toLocaleString()} credits remaining`
            }
          </span>

          {/* Progress bar — only when not exhausted */}
          {!exhausted && !expired && (
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    critical ? "bg-orange-400" : warning ? "bg-amber-400" : "bg-green-400"
                  )}
                  style={{ width: `${Math.min(100, trial.percentUsed)}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums opacity-70">{trial.percentUsed}%</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <Button
          size="sm"
          className={cn(
            "h-6 px-2.5 text-[10px] font-bold shrink-0 touch-manipulation",
            exhausted || expired || critical
              ? "bg-red-500 hover:bg-red-400 text-white"
              : "bg-amber-500 hover:bg-amber-400 text-black"
          )}
          onClick={openUpgradeModal}
        >
          Upgrade
        </Button>

        {/* Dismiss — only for warnings, not exhaustion */}
        {!exhausted && !expired && (
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 opacity-50 hover:opacity-100 transition-opacity touch-manipulation"
          >
            <X size={11} />
          </button>
        )}
      </div>

      <UpgradeModal
        open={upgradeModalOpen}
        onClose={closeUpgradeModal}
        onSubscribe={subscribe}
        trial={trial}
      />
    </>
  );
}
