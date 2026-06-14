import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

export interface UsageEvent {
  id: string;
  type: "build" | "deploy-minute" | "ai-call" | "storage" | "credit-add" | "container-build";
  cost: number;
  description: string;
  timestamp: string;
}

export interface UserBilling {
  userId: string;
  credits: number;
  plan: "free" | "pro" | "team";
  usageHistory: UsageEvent[];
  totalSpent: number;
}

function getBillingFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform/billing.json");
}

async function readAllBilling(): Promise<UserBilling[]> {
  try {
    const raw = await fs.readFile(getBillingFile(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeAllBilling(billing: UserBilling[]): Promise<void> {
  const file = getBillingFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(billing, null, 2));
}

export async function getUserBilling(userId: string): Promise<UserBilling> {
  const all = await readAllBilling();
  const existing = all.find(b => b.userId === userId);
  if (existing) return existing;
  // New user gets 100 free credits
  const fresh: UserBilling = {
    userId,
    credits: 100,
    plan: "free",
    usageHistory: [{
      id: randomUUID(),
      type: "credit-add",
      cost: 0,
      description: "Welcome bonus: 100 free credits",
      timestamp: new Date().toISOString(),
    }],
    totalSpent: 0,
  };
  all.push(fresh);
  await writeAllBilling(all);
  return fresh;
}

export async function billingDeduct(
  userId: string,
  cost: number,
  type: UsageEvent["type"],
  description: string
): Promise<boolean> {
  const all = await readAllBilling();
  let record = all.find(b => b.userId === userId);
  if (!record) {
    // Initialize with 100 credits
    record = { userId, credits: 100, plan: "free", usageHistory: [], totalSpent: 0 };
    all.push(record);
  }
  if (record.credits < cost) return false;
  record.credits -= cost;
  record.totalSpent += cost;
  record.usageHistory.push({ id: randomUUID(), type, cost, description, timestamp: new Date().toISOString() });
  // Keep last 500 events
  if (record.usageHistory.length > 500) {
    record.usageHistory = record.usageHistory.slice(-500);
  }
  await writeAllBilling(all);
  return true;
}

// GET /billing/credits
router.get("/billing/credits", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const billing = await getUserBilling(userId);
  res.json({
    credits: billing.credits,
    plan: billing.plan,
    totalSpent: billing.totalSpent,
  });
});

// GET /billing/usage
router.get("/billing/usage", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const billing = await getUserBilling(userId);
  const limit = parseInt(String(req.query.limit ?? "50"));
  const events = [...billing.usageHistory].reverse().slice(0, limit);
  res.json({ events, total: billing.usageHistory.length });
});

// POST /billing/add — add credits (self-serve or admin)
router.post("/billing/add", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { amount, targetUserId } = req.body as { amount: number; targetUserId?: string };
  if (!amount || amount <= 0) return void res.status(400).json({ error: "amount must be positive" });
  if (amount > 10000) return void res.status(400).json({ error: "Max 10000 credits per add" });

  const targetId = targetUserId ?? userId;
  const all = await readAllBilling();
  let record = all.find(b => b.userId === targetId);
  if (!record) {
    record = { userId: targetId, credits: 0, plan: "free", usageHistory: [], totalSpent: 0 };
    all.push(record);
  }
  record.credits += amount;
  record.usageHistory.push({
    id: randomUUID(),
    type: "credit-add",
    cost: 0,
    description: `Added ${amount} credits`,
    timestamp: new Date().toISOString(),
  });
  await writeAllBilling(all);
  res.json({ ok: true, credits: record.credits });
});

// POST /billing/deduct — internal deduction endpoint
router.post("/billing/deduct", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { cost, type, description } = req.body as {
    cost: number; type: UsageEvent["type"]; description: string;
  };
  if (!cost || cost <= 0) return void res.status(400).json({ error: "cost must be positive" });

  const ok = await billingDeduct(userId, cost, type ?? "ai-call", description ?? "Usage");
  if (!ok) return void res.status(402).json({ error: "Insufficient credits" });
  res.json({ ok: true });
});

// PATCH /billing/plan — upgrade plan
router.patch("/billing/plan", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { plan } = req.body as { plan: "free" | "pro" | "team" | "enterprise" };
  if (!["free", "pro", "team", "enterprise"].includes(plan)) return void res.status(400).json({ error: "Invalid plan" });

  const all = await readAllBilling();
  let record = all.find(b => b.userId === userId);
  if (!record) {
    record = { userId, credits: 100, plan: "free", usageHistory: [], totalSpent: 0 };
    all.push(record);
  }
  const bonuses: Record<string, number> = { free: 0, pro: 500, team: 2000, enterprise: 9000 };
  const bonus = bonuses[plan] ?? 0;
  record.plan = plan;
  record.credits += bonus;
  if (bonus > 0) {
    record.usageHistory.push({
      id: randomUUID(),
      type: "credit-add",
      cost: 0,
      description: `Plan upgrade to ${plan}: ${bonus} bonus credits`,
      timestamp: new Date().toISOString(),
    });
  }
  await writeAllBilling(all);
  res.json({ ok: true, plan, credits: record.credits });
});

export default router;
