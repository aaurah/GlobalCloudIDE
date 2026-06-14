import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────

export interface FraudFlag {
  id: string;
  userId: string;
  reason: string;
  score: number;
  signals: string[];
  flaggedAt: string;
  reviewedBy?: string;
  status: "pending" | "cleared" | "blocked";
  resolvedAt?: string;
  adminNote?: string;
}

interface FraudRule {
  name: string;
  score: number;
  check: (signals: FraudSignals) => boolean;
}

interface FraudSignals {
  purchasesLast24h: number;
  purchasesLast7d: number;
  accountAgeDays: number;
  refundsLast30d: number;
  uniqueIpsLast7d: number;
  failedPaymentsLast7d: number;
  creditsAddedLast24h: number;
  payoutRequests: number;
  payoutRequestsLast7d: number;
}

// ── Fraud rules ──────────────────────────────────────────────────────────────

const FRAUD_RULES: FraudRule[] = [
  { name: "high_purchase_velocity", score: 30, check: s => s.purchasesLast24h > 10 },
  { name: "new_account_high_spend", score: 25, check: s => s.accountAgeDays < 3 && s.purchasesLast24h > 3 },
  { name: "excessive_refunds", score: 40, check: s => s.refundsLast30d > 3 },
  { name: "multiple_ips", score: 15, check: s => s.uniqueIpsLast7d > 5 },
  { name: "repeated_payment_failures", score: 20, check: s => s.failedPaymentsLast7d > 5 },
  { name: "rapid_credit_adds", score: 35, check: s => s.creditsAddedLast24h > 5000 },
  { name: "excessive_payout_requests", score: 45, check: s => s.payoutRequestsLast7d > 3 },
  { name: "new_account_payout", score: 50, check: s => s.accountAgeDays < 7 && s.payoutRequests > 0 },
  { name: "bulk_purchases_same_day", score: 20, check: s => s.purchasesLast24h > 5 },
];

// ── Storage ──────────────────────────────────────────────────────────────────

function getPlatformDir() {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readFlags(): Promise<FraudFlag[]> {
  try { return JSON.parse(await fs.readFile(path.join(getPlatformDir(), "fraud-flags.json"), "utf-8")); }
  catch { return []; }
}

async function writeFlags(d: FraudFlag[]) {
  const dir = getPlatformDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "fraud-flags.json"), JSON.stringify(d, null, 2));
}

// ── Core fraud scoring ───────────────────────────────────────────────────────

export async function scoreFraud(userId: string, signals: FraudSignals): Promise<{ score: number; triggered: string[] }> {
  const triggered: string[] = [];
  let score = 0;
  for (const rule of FRAUD_RULES) {
    if (rule.check(signals)) {
      triggered.push(rule.name);
      score += rule.score;
    }
  }
  score = Math.min(score, 100);

  if (score >= 30) {
    const flags = await readFlags();
    const existing = flags.find(f => f.userId === userId && f.status === "pending");
    if (!existing && triggered.length > 0) {
      const flag: FraudFlag = {
        id: randomUUID(),
        userId,
        reason: triggered.join(", "),
        score,
        signals: triggered,
        flaggedAt: new Date().toISOString(),
        status: "pending",
      };
      flags.push(flag);
      await writeFlags(flags);
    }
  }

  return { score, triggered };
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /fraud/score — compute fraud score for current user
router.post("/fraud/score", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const signals: FraudSignals = {
    purchasesLast24h: req.body.purchasesLast24h ?? 0,
    purchasesLast7d: req.body.purchasesLast7d ?? 0,
    accountAgeDays: req.body.accountAgeDays ?? 365,
    refundsLast30d: req.body.refundsLast30d ?? 0,
    uniqueIpsLast7d: req.body.uniqueIpsLast7d ?? 1,
    failedPaymentsLast7d: req.body.failedPaymentsLast7d ?? 0,
    creditsAddedLast24h: req.body.creditsAddedLast24h ?? 0,
    payoutRequests: req.body.payoutRequests ?? 0,
    payoutRequestsLast7d: req.body.payoutRequestsLast7d ?? 0,
  };

  const result = await scoreFraud(userId, signals);
  res.json(result);
});

// ── Admin routes ─────────────────────────────────────────────────────────────

// GET /admin/fraud/list
router.get("/admin/fraud/list", async (req, res) => {
  const flags = await readFlags();
  const { status } = req.query as { status?: string };
  const filtered = status ? flags.filter(f => f.status === status) : flags;
  res.json({ flags: filtered.sort((a, b) => b.flaggedAt.localeCompare(a.flaggedAt)), total: filtered.length });
});

// GET /admin/fraud/stats
router.get("/admin/fraud/stats", async (_req, res) => {
  const flags = await readFlags();
  const stats = {
    total: flags.length,
    pending: flags.filter(f => f.status === "pending").length,
    cleared: flags.filter(f => f.status === "cleared").length,
    blocked: flags.filter(f => f.status === "blocked").length,
    highRisk: flags.filter(f => f.score >= 70).length,
    mediumRisk: flags.filter(f => f.score >= 40 && f.score < 70).length,
    lowRisk: flags.filter(f => f.score < 40).length,
    topSignals: (() => {
      const counts = new Map<string, number>();
      flags.forEach(f => f.signals.forEach(s => counts.set(s, (counts.get(s) ?? 0) + 1)));
      return Array.from(counts.entries()).map(([signal, count]) => ({ signal, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    })(),
  };
  res.json(stats);
});

// POST /admin/fraud/flag — manually flag a user
router.post("/admin/fraud/flag", async (req, res) => {
  const { userId, reason, score } = req.body as { userId: string; reason: string; score?: number };
  if (!userId || !reason) return void res.status(400).json({ error: "userId and reason required" });

  const flags = await readFlags();
  const flag: FraudFlag = {
    id: randomUUID(),
    userId,
    reason,
    score: score ?? 50,
    signals: ["manual_flag"],
    flaggedAt: new Date().toISOString(),
    status: "pending",
  };
  flags.push(flag);
  await writeFlags(flags);
  res.json({ ok: true, flag });
});

// PATCH /admin/fraud/review/:id
router.patch("/admin/fraud/review/:id", async (req, res) => {
  const { status, adminNote } = req.body as { status: FraudFlag["status"]; adminNote?: string };
  const flags = await readFlags();
  const flag = flags.find(f => f.id === req.params.id);
  if (!flag) return void res.status(404).json({ error: "Not found" });

  flag.status = status;
  flag.resolvedAt = new Date().toISOString();
  if (adminNote) flag.adminNote = adminNote;

  await writeFlags(flags);
  res.json({ ok: true, flag });
});

export default router;
