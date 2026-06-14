import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreatorProfile {
  userId: string;
  displayName: string;
  bio: string;
  isCreator: boolean;
  joinedAt: string;
  totalEarned: number;
  pendingPayout: number;
  paidOut: number;
  earningsHistory: EarningEntry[];
}

export interface EarningEntry {
  id: string;
  itemId: string;
  itemName: string;
  amount: number;
  buyerId: string;
  timestamp: string;
}

export interface PayoutRequest {
  id: string;
  userId: string;
  amount: number;
  method: "paypal" | "stripe" | "bank";
  methodDetails: string;
  status: "pending" | "approved" | "rejected" | "paid";
  requestedAt: string;
  processedAt?: string;
  adminNote?: string;
}

// ── Storage ──────────────────────────────────────────────────────────────────

function getPlatformDir() {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readCreators(): Promise<CreatorProfile[]> {
  try { return JSON.parse(await fs.readFile(path.join(getPlatformDir(), "creator-profiles.json"), "utf-8")); }
  catch { return []; }
}

async function writeCreators(d: CreatorProfile[]) {
  const dir = getPlatformDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "creator-profiles.json"), JSON.stringify(d, null, 2));
}

async function readPayouts(): Promise<PayoutRequest[]> {
  try { return JSON.parse(await fs.readFile(path.join(getPlatformDir(), "payout-requests.json"), "utf-8")); }
  catch { return []; }
}

async function writePayouts(d: PayoutRequest[]) {
  const dir = getPlatformDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "payout-requests.json"), JSON.stringify(d, null, 2));
}

async function getCreator(userId: string): Promise<CreatorProfile> {
  const all = await readCreators();
  const existing = all.find(c => c.userId === userId);
  if (existing) return existing;
  const fresh: CreatorProfile = {
    userId,
    displayName: `creator_${userId.slice(0, 6)}`,
    bio: "",
    isCreator: false,
    joinedAt: new Date().toISOString(),
    totalEarned: 0,
    pendingPayout: 0,
    paidOut: 0,
    earningsHistory: [],
  };
  all.push(fresh);
  await writeCreators(all);
  return fresh;
}

// ── Exported helper for marketplace-engine ──────────────────────────────────

export async function addCreatorEarning(
  creatorId: string,
  itemId: string,
  amount: number,
  buyerId: string,
): Promise<void> {
  const all = await readCreators();
  let profile = all.find(c => c.userId === creatorId);
  if (!profile) {
    profile = { userId: creatorId, displayName: `creator_${creatorId.slice(0, 6)}`, bio: "", isCreator: true, joinedAt: new Date().toISOString(), totalEarned: 0, pendingPayout: 0, paidOut: 0, earningsHistory: [] };
    all.push(profile);
  }
  profile.totalEarned += amount;
  profile.pendingPayout += amount;
  profile.isCreator = true;
  profile.earningsHistory.push({ id: randomUUID(), itemId, itemName: itemId, amount, buyerId, timestamp: new Date().toISOString() });
  if (profile.earningsHistory.length > 1000) profile.earningsHistory = profile.earningsHistory.slice(-1000);
  await writeCreators(all);
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /creator/register
router.post("/creator/register", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { displayName, bio } = req.body as { displayName?: string; bio?: string };
  const all = await readCreators();
  let profile = all.find(c => c.userId === userId);
  if (!profile) {
    profile = { userId, displayName: displayName ?? `creator_${userId.slice(0, 6)}`, bio: bio ?? "", isCreator: true, joinedAt: new Date().toISOString(), totalEarned: 0, pendingPayout: 0, paidOut: 0, earningsHistory: [] };
    all.push(profile);
  } else {
    profile.isCreator = true;
    if (displayName) profile.displayName = displayName;
    if (bio) profile.bio = bio;
  }
  await writeCreators(all);
  res.json({ ok: true, profile });
});

// GET /creator/dashboard
router.get("/creator/dashboard", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const profile = await getCreator(userId);
  const payouts = (await readPayouts()).filter(p => p.userId === userId);

  // Build earnings by item
  const byItem = new Map<string, { itemId: string; total: number; sales: number }>();
  for (const e of profile.earningsHistory) {
    const cur = byItem.get(e.itemId) ?? { itemId: e.itemId, total: 0, sales: 0 };
    cur.total += e.amount;
    cur.sales++;
    byItem.set(e.itemId, cur);
  }

  // Earnings over last 30 days by day
  const dailyEarnings: { date: string; amount: number }[] = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const amount = profile.earningsHistory
      .filter(e => e.timestamp.slice(0, 10) === dateStr)
      .reduce((s, e) => s + e.amount, 0);
    dailyEarnings.push({ date: dateStr, amount });
  }

  res.json({
    profile,
    stats: {
      totalEarned: profile.totalEarned,
      pendingPayout: profile.pendingPayout,
      paidOut: profile.paidOut,
      totalSales: profile.earningsHistory.length,
      byItem: Array.from(byItem.values()),
    },
    dailyEarnings,
    payouts,
  });
});

// GET /creator/earnings
router.get("/creator/earnings", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const profile = await getCreator(userId);
  const limit = parseInt(String(req.query.limit ?? "50"));
  const earnings = [...profile.earningsHistory].reverse().slice(0, limit);
  res.json({ earnings, total: profile.earningsHistory.length });
});

// POST /creator/payouts/request
router.post("/creator/payouts/request", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { amount, method, methodDetails } = req.body as {
    amount: number; method: PayoutRequest["method"]; methodDetails: string;
  };

  if (!amount || amount <= 0) return void res.status(400).json({ error: "Invalid amount" });
  if (!["paypal", "stripe", "bank"].includes(method)) return void res.status(400).json({ error: "Invalid method" });
  if (!methodDetails) return void res.status(400).json({ error: "Method details required" });

  const profile = await getCreator(userId);
  if (amount > profile.pendingPayout) return void res.status(400).json({ error: "Amount exceeds pending balance" });
  if (amount < 100) return void res.status(400).json({ error: "Minimum payout is 100 credits" });

  // Deduct from pending
  const all = await readCreators();
  const p = all.find(c => c.userId === userId)!;
  p.pendingPayout -= amount;
  await writeCreators(all);

  const payoutReq: PayoutRequest = {
    id: randomUUID(),
    userId,
    amount,
    method,
    methodDetails: methodDetails.slice(0, 200),
    status: "pending",
    requestedAt: new Date().toISOString(),
  };

  const payouts = await readPayouts();
  payouts.push(payoutReq);
  await writePayouts(payouts);

  res.json({ ok: true, payout: payoutReq });
});

// GET /creator/payouts/history
router.get("/creator/payouts/history", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const payouts = (await readPayouts()).filter(p => p.userId === userId);
  res.json({ payouts });
});

// ── Admin payout management ──────────────────────────────────────────────────

// GET /admin/payouts/list
router.get("/admin/payouts/list", async (req, res) => {
  const payouts = await readPayouts();
  const { status } = req.query as { status?: string };
  const filtered = status ? payouts.filter(p => p.status === status) : payouts;
  res.json({ payouts: filtered.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)) });
});

// PATCH /admin/payouts/:id
router.patch("/admin/payouts/:id", async (req, res) => {
  const { status, adminNote } = req.body as { status: PayoutRequest["status"]; adminNote?: string };
  const payouts = await readPayouts();
  const payout = payouts.find(p => p.id === req.params.id);
  if (!payout) return void res.status(404).json({ error: "Not found" });

  payout.status = status;
  payout.processedAt = new Date().toISOString();
  if (adminNote) payout.adminNote = adminNote;

  if (status === "paid") {
    const all = await readCreators();
    const profile = all.find(c => c.userId === payout.userId);
    if (profile) { profile.paidOut += payout.amount; }
    await writeCreators(all);
  } else if (status === "rejected") {
    // Refund pending balance
    const all = await readCreators();
    const profile = all.find(c => c.userId === payout.userId);
    if (profile) { profile.pendingPayout += payout.amount; }
    await writeCreators(all);
  }

  await writePayouts(payouts);
  res.json({ ok: true, payout });
});

export default router;
