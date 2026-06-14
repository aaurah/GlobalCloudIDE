import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────

export const STREAK_MILESTONES = [
  { days: 1,  credits: 200,    label: "Showing Up" },
  { days: 3,  credits: 500,    label: "On a Roll" },
  { days: 7,  credits: 2_000,  label: "Weekly Warrior" },
  { days: 14, credits: 5_000,  label: "Two-Week Titan" },
  { days: 30, credits: 10_000, label: "Unstoppable" },
];

// ── Data model ────────────────────────────────────────────────────────────────

export interface StreakRecord {
  userId: string;
  streakCount: number;
  lastActiveDate: string | null;  // ISO date only "YYYY-MM-DD"
  longestStreak: number;
  claimedMilestones: number[];    // days values already rewarded
  totalStreakCredits: number;
  activeDates: string[];          // last 90 active dates
}

// ── File helpers ──────────────────────────────────────────────────────────────

function getPlatformDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readStreaks(): Promise<StreakRecord[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "streaks.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeStreaks(data: StreakRecord[]): Promise<void> {
  const file = path.join(getPlatformDir(), "streaks.json");
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

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
  );
}

async function addTrialCreditsInternal(userId: string, amount: number, description: string): Promise<void> {
  const billing = await readBilling();
  let record = billing.find((b: any) => b.userId === userId) as any;
  if (!record) return;
  record.trialCreditLimit = (record.trialCreditLimit ?? 10000) + amount;
  record.usageHistory = record.usageHistory ?? [];
  record.usageHistory.push({
    id: randomUUID(), type: "credit-add", cost: 0,
    description, timestamp: new Date().toISOString(),
  });
  if (record.usageHistory.length > 500) record.usageHistory = record.usageHistory.slice(-500);
  await writeBilling(billing);
}

// ── Core: record activity (called by AI routes) ───────────────────────────────

export async function recordActivity(userId: string): Promise<{
  streakUpdated: boolean;
  newStreak: number;
  milestonesUnlocked: { days: number; credits: number; label: string }[];
}> {
  const all = await readStreaks();
  let record = all.find(r => r.userId === userId);
  const today = todayDate();

  if (!record) {
    record = {
      userId, streakCount: 0, lastActiveDate: null, longestStreak: 0,
      claimedMilestones: [], totalStreakCredits: 0, activeDates: [],
    };
    all.push(record);
  }

  // Already recorded today
  if (record.lastActiveDate === today) {
    await writeStreaks(all);
    return { streakUpdated: false, newStreak: record.streakCount, milestonesUnlocked: [] };
  }

  // Compute new streak
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (record.lastActiveDate === yesterday) {
    record.streakCount += 1;
  } else if (record.lastActiveDate && daysBetween(record.lastActiveDate, today) === 1) {
    record.streakCount += 1;
  } else {
    record.streakCount = 1; // reset
  }

  record.lastActiveDate = today;
  if (record.streakCount > record.longestStreak) record.longestStreak = record.streakCount;

  // Track active dates (last 90)
  if (!record.activeDates.includes(today)) {
    record.activeDates.push(today);
    if (record.activeDates.length > 90) record.activeDates = record.activeDates.slice(-90);
  }

  // Auto-grant milestone credits
  const milestonesUnlocked: { days: number; credits: number; label: string }[] = [];
  for (const m of STREAK_MILESTONES) {
    if (record.streakCount >= m.days && !record.claimedMilestones.includes(m.days)) {
      record.claimedMilestones.push(m.days);
      record.totalStreakCredits += m.credits;
      milestonesUnlocked.push(m);
    }
  }

  await writeStreaks(all);

  // Grant credits
  for (const m of milestonesUnlocked) {
    await addTrialCreditsInternal(userId, m.credits,
      `Streak milestone: ${m.label} (${m.days}-day streak)`);
  }

  return { streakUpdated: true, newStreak: record.streakCount, milestonesUnlocked };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/streak/status
router.get("/streak/status", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const all = await readStreaks();
    let record = all.find(r => r.userId === userId);
    if (!record) {
      record = { userId, streakCount: 0, lastActiveDate: null, longestStreak: 0,
        claimedMilestones: [], totalStreakCredits: 0, activeDates: [] };
    }

    const today = todayDate();
    const activeToday = record.lastActiveDate === today;
    const nextMilestone = STREAK_MILESTONES.find(
      m => record!.streakCount < m.days && !record!.claimedMilestones.includes(m.days)
    );

    res.json({
      streakCount: record.streakCount,
      longestStreak: record.longestStreak,
      lastActiveDate: record.lastActiveDate,
      activeToday,
      activeDates: record.activeDates,
      claimedMilestones: record.claimedMilestones,
      totalStreakCredits: record.totalStreakCredits,
      milestones: STREAK_MILESTONES.map(m => ({
        ...m,
        claimed: record!.claimedMilestones.includes(m.days),
        reached: record!.streakCount >= m.days,
        daysAway: Math.max(0, m.days - record!.streakCount),
      })),
      nextMilestone: nextMilestone
        ? { ...nextMilestone, daysAway: nextMilestone.days - record.streakCount }
        : null,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/streak/reward — manually trigger streak check (also called internally)
router.post("/streak/reward", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await recordActivity(userId);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
