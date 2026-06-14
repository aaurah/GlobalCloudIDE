import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";
import { requireAdmin, logAudit } from "../admin/index";
import { TRIAL_CREDIT_LIMIT } from "./trial";

const router = Router();

// ── Constants ────────────────────────────────────────────────────────────────

export const REFERRAL_TIERS = [
  { count: 1,  bonus: 2_000,  label: "First Invite" },
  { count: 5,  bonus: 15_000, label: "Social Starter" },
  { count: 10, bonus: 50_000, label: "Growth Champion" },
];

export const NEW_USER_REFERRAL_BONUS = 1_500; // extra credits for the referred user

// ── Data model ────────────────────────────────────────────────────────────────

export interface ReferralRecord {
  userId: string;
  code: string;
  referredBy: string | null;      // referrer's userId
  referralCount: number;
  referredUsers: string[];        // userIds of people they referred
  rewardsClaimed: number[];       // tier counts already rewarded (1, 5, 10…)
  suspiciousScore: number;
  registrationIp: string | null;
  createdAt: string;
}

// ── File helpers ──────────────────────────────────────────────────────────────

function getPlatformDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readReferrals(): Promise<ReferralRecord[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "referrals.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeReferrals(data: ReferralRecord[]): Promise<void> {
  const file = path.join(getPlatformDir(), "referrals.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function readBilling(): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "billing.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeBilling(data: any[]): Promise<void> {
  const file = path.join(getPlatformDir(), "billing.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

// ── Core helpers ──────────────────────────────────────────────────────────────

function generateCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function getOrCreateReferral(userId: string, ip?: string): Promise<ReferralRecord> {
  const all = await readReferrals();
  const existing = all.find(r => r.userId === userId);
  if (existing) return existing;

  let code = generateCode();
  while (all.find(r => r.code === code)) code = generateCode();

  const record: ReferralRecord = {
    userId, code,
    referredBy: null,
    referralCount: 0,
    referredUsers: [],
    rewardsClaimed: [],
    suspiciousScore: 0,
    registrationIp: ip ?? null,
    createdAt: new Date().toISOString(),
  };
  all.push(record);
  await writeReferrals(all);
  return record;
}

async function addTrialCredits(userId: string, amount: number, description: string): Promise<void> {
  const billing = await readBilling();
  let record = billing.find((b: any) => b.userId === userId) as any;
  if (!record) {
    record = {
      userId, credits: 100, plan: "free", usageHistory: [], totalSpent: 0,
      isTrial: true,
      trialStartedAt: new Date().toISOString(),
      trialExpiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      trialCreditLimit: TRIAL_CREDIT_LIMIT,
      trialCreditsUsed: 0, suspiciousUsage: false,
    };
    billing.push(record);
  }
  // Add to trial credit limit (extends quota rather than deducting from used)
  record.trialCreditLimit = (record.trialCreditLimit ?? TRIAL_CREDIT_LIMIT) + amount;
  record.usageHistory = record.usageHistory ?? [];
  record.usageHistory.push({
    id: randomUUID(), type: "credit-add", cost: 0,
    description, timestamp: new Date().toISOString(),
  });
  if (record.usageHistory.length > 500) record.usageHistory = record.usageHistory.slice(-500);
  await writeBilling(billing);
}

async function checkAndGrantReferralRewards(referrerId: string, count: number): Promise<number> {
  const all = await readReferrals();
  const record = all.find(r => r.userId === referrerId);
  if (!record) return 0;

  let totalGranted = 0;
  for (const tier of REFERRAL_TIERS) {
    if (count >= tier.count && !record.rewardsClaimed.includes(tier.count)) {
      record.rewardsClaimed.push(tier.count);
      await addTrialCredits(referrerId, tier.bonus, `Referral reward: ${tier.label} (${tier.count} invites)`);
      totalGranted += tier.bonus;
    }
  }
  if (totalGranted > 0) await writeReferrals(all);
  return totalGranted;
}

// Called from auth.ts on new user registration
export async function initializeReferral(
  newUserId: string,
  referralCode: string | null,
  registrationIp: string | null
): Promise<void> {
  const all = await readReferrals();

  // Create referral record for new user
  let code = generateCode();
  while (all.find(r => r.code === code)) code = generateCode();

  const newRecord: ReferralRecord = {
    userId: newUserId, code,
    referredBy: null,
    referralCount: 0,
    referredUsers: [],
    rewardsClaimed: [],
    suspiciousScore: 0,
    registrationIp,
    createdAt: new Date().toISOString(),
  };

  // Resolve referrer
  if (referralCode) {
    const referrer = all.find(r => r.code === referralCode.toUpperCase());
    if (referrer && referrer.userId !== newUserId) {
      // Anti-abuse: same IP as referrer?
      if (registrationIp && referrer.registrationIp === registrationIp) {
        newRecord.suspiciousScore += 5;
        referrer.suspiciousScore = (referrer.suspiciousScore ?? 0) + 2;
      }
      // Anti-abuse: referrer already has 20+ referrals from same IP cluster?
      const sameIpReferrals = all.filter(r =>
        r.referredBy === referrer.userId && r.registrationIp === registrationIp
      );
      if (sameIpReferrals.length >= 3) {
        newRecord.suspiciousScore += 10;
        referrer.suspiciousScore = (referrer.suspiciousScore ?? 0) + 5;
      }

      newRecord.referredBy = referrer.userId;
      referrer.referralCount += 1;
      referrer.referredUsers.push(newUserId);

      // Grant new user referral bonus
      all.push(newRecord);
      await writeReferrals(all);
      await addTrialCredits(newUserId, NEW_USER_REFERRAL_BONUS,
        `Referral bonus: joined via invite code ${referralCode}`);
      // Check tier rewards for referrer
      await checkAndGrantReferralRewards(referrer.userId, referrer.referralCount);
      return;
    }
  }

  all.push(newRecord);
  await writeReferrals(all);
}

// ── User routes ───────────────────────────────────────────────────────────────

// GET /api/referral/code
router.get("/referral/code", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const record = await getOrCreateReferral(userId,
      String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? ""));
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      code: record.code,
      referralUrl: `${baseUrl}/invite/${record.code}`,
      shortUrl: `/invite/${record.code}`,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/referral/stats
router.get("/referral/stats", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const record = await getOrCreateReferral(userId);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const nextTier = REFERRAL_TIERS.find(t =>
      !record.rewardsClaimed.includes(t.count) && t.count > record.referralCount
    );
    const tiers = REFERRAL_TIERS.map(t => ({
      ...t,
      claimed: record.rewardsClaimed.includes(t.count),
      reached: record.referralCount >= t.count,
    }));
    res.json({
      code: record.code,
      referralUrl: `${baseUrl}/invite/${record.code}`,
      referralCount: record.referralCount,
      referredBy: record.referredBy,
      tiers,
      nextTier: nextTier ?? null,
      progressToNext: nextTier
        ? { current: record.referralCount, target: nextTier.count, bonus: nextTier.bonus }
        : null,
      totalCreditsEarned: record.rewardsClaimed.reduce((sum, claimed) => {
        const tier = REFERRAL_TIERS.find(t => t.count === claimed);
        return sum + (tier?.bonus ?? 0);
      }, 0),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/referral/redeem — apply a referral code retroactively (within 24h of signup)
router.post("/referral/redeem", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { code } = req.body as { code: string };
    if (!code) { res.status(400).json({ error: "code required" }); return; }

    const all = await readReferrals();
    const myRecord = all.find(r => r.userId === userId);
    if (!myRecord) { res.status(404).json({ error: "Referral record not found" }); return; }
    if (myRecord.referredBy) { res.status(409).json({ error: "Already redeemed a referral code" }); return; }

    // Check 24h window
    const createdAt = new Date(myRecord.createdAt);
    if (Date.now() - createdAt.getTime() > 24 * 3600 * 1000) {
      res.status(410).json({ error: "Referral redemption window has passed (24h)" }); return;
    }

    const referrer = all.find(r => r.code === code.toUpperCase());
    if (!referrer) { res.status(404).json({ error: "Invalid referral code" }); return; }
    if (referrer.userId === userId) { res.status(400).json({ error: "Cannot use your own referral code" }); return; }

    myRecord.referredBy = referrer.userId;
    referrer.referralCount += 1;
    referrer.referredUsers.push(userId);

    await writeReferrals(all);
    await addTrialCredits(userId, NEW_USER_REFERRAL_BONUS,
      `Referral bonus: redeemed invite code ${code}`);
    const granted = await checkAndGrantReferralRewards(referrer.userId, referrer.referralCount);

    res.json({
      success: true,
      creditsAdded: NEW_USER_REFERRAL_BONUS,
      referrerRewarded: granted > 0,
      message: `${NEW_USER_REFERRAL_BONUS.toLocaleString()} bonus AI credits added to your trial!`,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Admin routes ──────────────────────────────────────────────────────────────

// GET /api/admin/growth/stats
router.get("/admin/growth/stats", requireAdmin("auditor"), async (req, res) => {
  try {
    const all = await readReferrals();
    const totalReferrals = all.reduce((s, r) => s + r.referralCount, 0);
    const usersWithReferrer = all.filter(r => r.referredBy).length;
    const conversionRate = all.length > 0
      ? `${Math.round((usersWithReferrer / all.length) * 100)}%` : "0%";
    const totalCreditsGranted = all.reduce((s, r) =>
      s + r.rewardsClaimed.reduce((rs, c) => rs + (REFERRAL_TIERS.find(t => t.count === c)?.bonus ?? 0), 0), 0);
    const suspicious = all.filter(r => r.suspiciousScore >= 5);

    res.json({
      totalUsers: all.length,
      totalReferrals,
      usersWithReferrer,
      conversionRate,
      totalCreditsGrantedViaReferrals: totalCreditsGranted,
      suspiciousUsers: suspicious.length,
      tierDistribution: REFERRAL_TIERS.map(t => ({
        tier: t.label,
        count: t.count,
        usersReached: all.filter(r => r.referralCount >= t.count).length,
        claimed: all.filter(r => r.rewardsClaimed.includes(t.count)).length,
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/growth/referrers
router.get("/admin/growth/referrers", requireAdmin("support"), async (req, res) => {
  try {
    const all = await readReferrals();
    const referrers = all
      .filter(r => r.referralCount > 0)
      .sort((a, b) => b.referralCount - a.referralCount)
      .slice(0, 50)
      .map(r => ({
        userId: r.userId,
        code: r.code,
        referralCount: r.referralCount,
        rewardsClaimed: r.rewardsClaimed,
        suspiciousScore: r.suspiciousScore,
        createdAt: r.createdAt,
      }));
    res.json({ referrers });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/referrals/suspicious
router.get("/admin/referrals/suspicious", requireAdmin("support"), async (req, res) => {
  try {
    const all = await readReferrals();
    const suspicious = all
      .filter(r => r.suspiciousScore > 0)
      .sort((a, b) => b.suspiciousScore - a.suspiciousScore)
      .map(r => ({ userId: r.userId, code: r.code, suspiciousScore: r.suspiciousScore,
        referralCount: r.referralCount, registrationIp: r.registrationIp, createdAt: r.createdAt }));
    res.json({ suspicious });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
