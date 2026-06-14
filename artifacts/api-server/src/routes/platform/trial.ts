import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";
import { getUserBilling, billingDeduct, type UserBilling } from "./billing";
import { requireAdmin, logAudit } from "../admin/index";

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────

export const TRIAL_CREDIT_LIMIT = 10_000;
export const TRIAL_DAYS = 14;

export const AI_COSTS: Record<string, number> = {
  "ide-ai":      10,   // code gen/fix/explain/refactor
  "ide-chat":     5,   // conversational AI
  "deploy-ai":    5,   // release AI, pipeline AI
  "admin-ai":     5,   // admin AI assistant
  "infragen":    10,   // infrastructure generation
  "devops":       5,   // devops AI
  "healing":      3,   // auto-healing AI
  default:       10,
};

export const PLANS = {
  free: {
    id: "free", name: "Free", price: 0, currency: "USD",
    aiCreditsMonthly: 0,
    description: "Basic IDE features. No AI after trial.",
    features: ["File editing", "Terminal", "Basic deployments"],
  },
  pro: {
    id: "pro", name: "Pro", price: 9, currency: "USD",
    aiCreditsMonthly: 5_000,
    description: "Full AI access + advanced features.",
    features: ["5,000 AI credits/month", "All AI features", "Priority deployments", "Advanced observability"],
  },
  team: {
    id: "team", name: "Team", price: 29, currency: "USD",
    aiCreditsMonthly: 20_000,
    description: "Team collaboration + max AI quota.",
    features: ["20,000 AI credits/month", "Team management", "Shared workspaces", "Audit logs", "Priority support"],
  },
} as const;

// ── Trial helpers ─────────────────────────────────────────────────────────────

function getPlatformDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readAllBilling(): Promise<UserBilling[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "billing.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeAllBilling(data: UserBilling[]): Promise<void> {
  const file = path.join(getPlatformDir(), "billing.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export async function getTrialStatus(userId: string): Promise<{
  isTrial: boolean;
  active: boolean;
  expired: boolean;
  trialStartedAt: string;
  trialExpiresAt: string;
  trialCreditLimit: number;
  trialCreditsUsed: number;
  trialCreditsRemaining: number;
  percentUsed: number;
  plan: string;
  credits: number;
  canUseAi: boolean;
  suspiciousUsage: boolean;
}> {
  const billing = await getUserBilling(userId);
  const b = billing as any;

  const now = new Date();
  const expiresAt = b.trialExpiresAt ? new Date(b.trialExpiresAt) : null;
  const expired = expiresAt ? now > expiresAt : false;

  const used = b.trialCreditsUsed ?? 0;
  const limit = b.trialCreditLimit ?? TRIAL_CREDIT_LIMIT;
  const remaining = Math.max(0, limit - used);
  const percentUsed = limit > 0 ? Math.round((used / limit) * 100) : 0;

  // Can use AI if: (trial active + not exhausted) OR paid plan
  const trialActive = (b.isTrial ?? true) && !expired && remaining > 0;
  const paidPlan = billing.plan === "pro" || billing.plan === "team";
  const canUseAi = trialActive || (paidPlan && billing.credits > 0);

  return {
    isTrial: b.isTrial ?? true,
    active: trialActive,
    expired,
    trialStartedAt: b.trialStartedAt ?? billing.usageHistory[0]?.timestamp ?? now.toISOString(),
    trialExpiresAt: b.trialExpiresAt ?? new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
    trialCreditLimit: limit,
    trialCreditsUsed: used,
    trialCreditsRemaining: remaining,
    percentUsed,
    plan: billing.plan,
    credits: billing.credits,
    canUseAi,
    suspiciousUsage: b.suspiciousUsage ?? false,
  };
}

// ── Core metering function (used by AI routes) ────────────────────────────────

export async function checkAndDeductAiCredits(
  userId: string,
  costKey: keyof typeof AI_COSTS | string,
  description: string
): Promise<{ allowed: boolean; remaining: number; code?: string; message?: string }> {
  const cost = AI_COSTS[costKey] ?? AI_COSTS.default;
  const status = await getTrialStatus(userId);

  if (!status.canUseAi) {
    const code = status.expired || status.trialCreditsRemaining === 0
      ? "TRIAL_EXHAUSTED"
      : "NO_AI_ACCESS";
    const message = status.expired
      ? "Your free AI trial has expired. Upgrade to continue."
      : status.trialCreditsRemaining === 0
      ? "Your free AI trial credits are exhausted. Upgrade to continue."
      : "AI features require a Pro or Team plan.";
    return { allowed: false, remaining: 0, code, message };
  }

  // Deduct from trial if on trial, else from billing credits
  const all = await readAllBilling();
  const record = all.find(b => b.userId === userId) as any;
  if (!record) return { allowed: true, remaining: 9999 }; // fallback — allow

  if ((record.isTrial ?? true) && !status.expired) {
    // Deduct from trial balance
    record.trialCreditsUsed = (record.trialCreditsUsed ?? 0) + cost;
    record.usageHistory = record.usageHistory ?? [];
    record.usageHistory.push({
      id: randomUUID(),
      type: "ai-call",
      cost,
      description,
      timestamp: new Date().toISOString(),
    });
    record.totalSpent = (record.totalSpent ?? 0) + cost;
    if (record.usageHistory.length > 500) record.usageHistory = record.usageHistory.slice(-500);
    await writeAllBilling(all);
    const remaining = Math.max(0, (record.trialCreditLimit ?? TRIAL_CREDIT_LIMIT) - record.trialCreditsUsed);
    return { allowed: true, remaining };
  } else {
    // Deduct from paid credits
    const ok = await billingDeduct(userId, cost, "ai-call", description);
    if (!ok) return { allowed: false, remaining: 0, code: "INSUFFICIENT_CREDITS", message: "Insufficient credits." };
    const updated = await getUserBilling(userId);
    return { allowed: true, remaining: updated.credits };
  }
}

// ── Initialize trial for new user (called from auth.ts on register) ───────────

export async function initializeUserTrial(userId: string): Promise<void> {
  const all = await readAllBilling();
  const existing = all.find(b => b.userId === userId) as any;
  if (existing) {
    // Already initialized — patch trial fields if missing
    if (existing.isTrial === undefined) {
      const now = new Date();
      existing.isTrial = true;
      existing.trialStartedAt = now.toISOString();
      existing.trialExpiresAt = new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString();
      existing.trialCreditLimit = TRIAL_CREDIT_LIMIT;
      existing.trialCreditsUsed = 0;
      existing.suspiciousUsage = false;
      await writeAllBilling(all);
    }
    return;
  }

  // Create fresh trial record
  const now = new Date();
  const fresh: any = {
    userId,
    credits: 100,
    plan: "free",
    usageHistory: [{
      id: randomUUID(),
      type: "credit-add",
      cost: 0,
      description: `Welcome! ${TRIAL_CREDIT_LIMIT.toLocaleString()} free AI trial credits for 14 days`,
      timestamp: now.toISOString(),
    }],
    totalSpent: 0,
    isTrial: true,
    trialStartedAt: now.toISOString(),
    trialExpiresAt: new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString(),
    trialCreditLimit: TRIAL_CREDIT_LIMIT,
    trialCreditsUsed: 0,
    suspiciousUsage: false,
  };
  all.push(fresh);
  await writeAllBilling(all);
}

// ── Trial routes ──────────────────────────────────────────────────────────────

// GET /api/trial/status
router.get("/trial/status", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const status = await getTrialStatus(userId);
    res.json(status);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/trial/activate — idempotent activation (re-initialize if not started)
router.post("/trial/activate", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    await initializeUserTrial(userId);
    const status = await getTrialStatus(userId);
    res.json({ success: true, ...status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/trial/upgrade-info
router.get("/trial/upgrade-info", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    const status = userId ? await getTrialStatus(userId) : null;
    res.json({
      plans: Object.values(PLANS),
      currentPlan: status?.plan ?? "free",
      trialStatus: status,
      message: "Upgrade to Pro or Team to continue using AI features after your trial ends.",
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Plan routes ───────────────────────────────────────────────────────────────

// GET /api/plans/list
router.get("/plans/list", (req, res) => {
  res.json({ plans: Object.values(PLANS) });
});

// GET /api/plans/status
router.get("/plans/status", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const billing = await getUserBilling(userId);
    const plan = PLANS[billing.plan as keyof typeof PLANS] ?? PLANS.free;
    res.json({ plan: billing.plan, details: plan, credits: billing.credits });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/plans/subscribe — simulate plan upgrade
router.post("/plans/subscribe", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { plan } = req.body as { plan: "pro" | "team" };
    if (!["pro", "team"].includes(plan)) {
      res.status(400).json({ error: "Invalid plan. Choose: pro or team" }); return;
    }

    const all = await readAllBilling();
    let record = all.find(b => b.userId === userId) as any;
    if (!record) {
      record = { userId, credits: 0, plan: "free", usageHistory: [], totalSpent: 0 };
      all.push(record);
    }

    const planDef = PLANS[plan];
    const bonus = planDef.aiCreditsMonthly;

    record.plan = plan;
    record.credits = (record.credits ?? 0) + bonus;
    // Mark as no longer trial when upgrading
    record.isTrial = false;
    record.upgradedAt = new Date().toISOString();
    record.upgradedTo = plan;
    record.usageHistory = record.usageHistory ?? [];
    record.usageHistory.push({
      id: randomUUID(),
      type: "credit-add",
      cost: 0,
      description: `Upgraded to ${plan}: ${bonus.toLocaleString()} AI credits added`,
      timestamp: new Date().toISOString(),
    });

    await writeAllBilling(all);
    logAudit(userId, "plan_upgrade", { plan, creditsAdded: bonus });

    res.json({
      success: true,
      plan,
      creditsAdded: bonus,
      totalCredits: record.credits,
      message: `Successfully upgraded to ${planDef.name}. ${bonus.toLocaleString()} AI credits added.`,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Admin trial routes ─────────────────────────────────────────────────────────

// GET /api/admin/trial/users
router.get("/admin/trial/users", requireAdmin("support"), async (req, res) => {
  try {
    const all = await readAllBilling() as any[];
    const users = all.map(b => ({
      userId: b.userId,
      plan: b.plan,
      isTrial: b.isTrial ?? true,
      trialStartedAt: b.trialStartedAt,
      trialExpiresAt: b.trialExpiresAt,
      trialCreditLimit: b.trialCreditLimit ?? TRIAL_CREDIT_LIMIT,
      trialCreditsUsed: b.trialCreditsUsed ?? 0,
      trialCreditsRemaining: Math.max(0, (b.trialCreditLimit ?? TRIAL_CREDIT_LIMIT) - (b.trialCreditsUsed ?? 0)),
      percentUsed: Math.round(((b.trialCreditsUsed ?? 0) / (b.trialCreditLimit ?? TRIAL_CREDIT_LIMIT)) * 100),
      totalSpent: b.totalSpent ?? 0,
      upgradedAt: b.upgradedAt ?? null,
      suspiciousUsage: b.suspiciousUsage ?? false,
    }));
    res.json({ total: users.length, users });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/trial/reset
router.post("/admin/trial/reset", requireAdmin("admin"), async (req, res) => {
  try {
    const { userId } = req.body as { userId: string };
    if (!userId) { res.status(400).json({ error: "userId required" }); return; }
    const all = await readAllBilling() as any[];
    const record = all.find(b => b.userId === userId);
    if (!record) { res.status(404).json({ error: "User billing not found" }); return; }

    const now = new Date();
    record.isTrial = true;
    record.trialStartedAt = now.toISOString();
    record.trialExpiresAt = new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString();
    record.trialCreditLimit = TRIAL_CREDIT_LIMIT;
    record.trialCreditsUsed = 0;
    await writeAllBilling(all);
    logAudit((req as any).adminUserId, "reset_trial", { userId });
    res.json({ success: true, userId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/trial/adjust
router.post("/admin/trial/adjust", requireAdmin("admin"), async (req, res) => {
  try {
    const { userId, creditsToAdd, newLimit } = req.body as {
      userId: string; creditsToAdd?: number; newLimit?: number;
    };
    if (!userId) { res.status(400).json({ error: "userId required" }); return; }
    const all = await readAllBilling() as any[];
    const record = all.find(b => b.userId === userId);
    if (!record) { res.status(404).json({ error: "User billing not found" }); return; }

    if (typeof creditsToAdd === "number") {
      // Reduce used credits (effectively adding back)
      record.trialCreditsUsed = Math.max(0, (record.trialCreditsUsed ?? 0) - creditsToAdd);
    }
    if (typeof newLimit === "number" && newLimit > 0) {
      record.trialCreditLimit = newLimit;
    }
    await writeAllBilling(all);
    logAudit((req as any).adminUserId, "adjust_trial", { userId, creditsToAdd, newLimit });
    const remaining = Math.max(0, (record.trialCreditLimit ?? TRIAL_CREDIT_LIMIT) - (record.trialCreditsUsed ?? 0));
    res.json({ success: true, userId, remaining });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/trial/analytics
router.get("/admin/trial/analytics", requireAdmin("auditor"), async (req, res) => {
  try {
    const all = await readAllBilling() as any[];
    const total = all.length;
    const trialUsers = all.filter(b => b.isTrial ?? true);
    const exhausted = trialUsers.filter(b =>
      (b.trialCreditsUsed ?? 0) >= (b.trialCreditLimit ?? TRIAL_CREDIT_LIMIT)
    );
    const expired = trialUsers.filter(b =>
      b.trialExpiresAt && new Date(b.trialExpiresAt) < new Date()
    );
    const upgraded = all.filter(b => b.plan !== "free");
    const suspicious = all.filter(b => b.suspiciousUsage);

    // AI feature usage distribution
    const featureUsage: Record<string, number> = {};
    for (const record of all) {
      for (const event of record.usageHistory ?? []) {
        if (event.type === "ai-call") {
          const key = event.description?.split(":")[0]?.trim() ?? "unknown";
          featureUsage[key] = (featureUsage[key] ?? 0) + 1;
        }
      }
    }

    // Average credits used by trial users
    const avgCreditsUsed = trialUsers.length > 0
      ? Math.round(trialUsers.reduce((s: number, b: any) => s + (b.trialCreditsUsed ?? 0), 0) / trialUsers.length)
      : 0;

    res.json({
      overview: {
        totalUsers: total,
        trialUsers: trialUsers.length,
        exhaustedTrial: exhausted.length,
        expiredTrial: expired.length,
        upgradedToProOrTeam: upgraded.length,
        conversionRate: total > 0 ? `${Math.round((upgraded.length / total) * 100)}%` : "0%",
        suspiciousUsage: suspicious.length,
        avgCreditsUsedPerTrialUser: avgCreditsUsed,
      },
      featureUsage,
      planDistribution: {
        free: all.filter(b => b.plan === "free").length,
        pro: all.filter(b => b.plan === "pro").length,
        team: all.filter(b => b.plan === "team").length,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
