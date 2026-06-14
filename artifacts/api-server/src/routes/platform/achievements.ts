import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

// ── Definitions ───────────────────────────────────────────────────────────────

export const ACHIEVEMENT_DEFS = [
  { id: "first-ai-gen",    title: "First AI Generation",    description: "Run your first AI code generation.", credits: 300,   icon: "✨" },
  { id: "ai-gen-10",       title: "10 AI Generations",      description: "Use AI code generation 10 times.",   credits: 1_000, icon: "🚀" },
  { id: "ai-gen-50",       title: "50 AI Generations",      description: "Use AI code generation 50 times.",   credits: 3_000, icon: "🏆" },
  { id: "first-commit",    title: "First Commit",           description: "Save your first file in the IDE.",   credits: 500,   icon: "📝" },
  { id: "first-deploy",    title: "First Deployment",       description: "Deploy your first project.",         credits: 1_000, icon: "🚀" },
  { id: "first-plugin",    title: "First Plugin Installed", description: "Install a plugin from the store.",   credits: 500,   icon: "🧩" },
  { id: "referral-1",      title: "Social Starter",         description: "Invite your first friend.",          credits: 0,     icon: "👥", linkedTo: "referral" },
  { id: "streak-7",        title: "Weekly Warrior",         description: "Maintain a 7-day streak.",           credits: 0,     icon: "🔥", linkedTo: "streak" },
] as const;

export type AchievementId = (typeof ACHIEVEMENT_DEFS)[number]["id"];

// ── Data model ────────────────────────────────────────────────────────────────

export interface UserAchievements {
  userId: string;
  unlocked: { id: string; unlockedAt: string; creditsClaimed: boolean }[];
  aiGenCount: number;
}

// ── File helpers ──────────────────────────────────────────────────────────────

function getPlatformDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readAchievements(): Promise<UserAchievements[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "achievements.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeAchievements(data: UserAchievements[]): Promise<void> {
  const file = path.join(getPlatformDir(), "achievements.json");
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

async function addTrialCreditsInternal(userId: string, amount: number, description: string): Promise<void> {
  if (amount <= 0) return;
  const billing = await readBilling();
  const record = billing.find((b: any) => b.userId === userId) as any;
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

// ── Core: unlock achievement (idempotent) ─────────────────────────────────────

export async function unlockAchievement(
  userId: string,
  achievementId: string
): Promise<{ unlocked: boolean; creditsGranted: number; achievement: typeof ACHIEVEMENT_DEFS[number] | undefined }> {
  const def = ACHIEVEMENT_DEFS.find(a => a.id === achievementId);
  if (!def) return { unlocked: false, creditsGranted: 0, achievement: undefined };

  const all = await readAchievements();
  let record = all.find(r => r.userId === userId);
  if (!record) {
    record = { userId, unlocked: [], aiGenCount: 0 };
    all.push(record);
  }

  // Already unlocked
  if (record.unlocked.find(u => u.id === achievementId)) {
    return { unlocked: false, creditsGranted: 0, achievement: def };
  }

  record.unlocked.push({ id: achievementId, unlockedAt: new Date().toISOString(), creditsClaimed: def.credits > 0 });
  await writeAchievements(all);

  if (def.credits > 0) {
    await addTrialCreditsInternal(userId, def.credits, `Achievement: ${def.title}`);
  }

  return { unlocked: true, creditsGranted: def.credits, achievement: def };
}

// Called from AI routes after each AI call
export async function recordAiGeneration(userId: string): Promise<void> {
  const all = await readAchievements();
  let record = all.find(r => r.userId === userId);
  if (!record) {
    record = { userId, unlocked: [], aiGenCount: 0 };
    all.push(record);
  }

  record.aiGenCount += 1;
  await writeAchievements(all);

  // Unlock milestones
  if (record.aiGenCount === 1)  await unlockAchievement(userId, "first-ai-gen");
  if (record.aiGenCount === 10) await unlockAchievement(userId, "ai-gen-10");
  if (record.aiGenCount === 50) await unlockAchievement(userId, "ai-gen-50");
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/achievements/list
router.get("/achievements/list", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const all = await readAchievements();
    const record = all.find(r => r.userId === userId);

    const achievements = ACHIEVEMENT_DEFS.map(def => {
      const unlocked = record?.unlocked.find(u => u.id === def.id);
      return {
        ...def,
        unlocked: !!unlocked,
        unlockedAt: unlocked?.unlockedAt ?? null,
        creditsClaimed: unlocked?.creditsClaimed ?? false,
      };
    });

    const totalCreditsEarned = ACHIEVEMENT_DEFS.reduce((sum, def) => {
      const u = record?.unlocked.find(u => u.id === def.id);
      return sum + (u?.creditsClaimed ? def.credits : 0);
    }, 0);

    res.json({
      achievements,
      totalUnlocked: record?.unlocked.length ?? 0,
      totalAchievements: ACHIEVEMENT_DEFS.length,
      aiGenCount: record?.aiGenCount ?? 0,
      totalCreditsEarned,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/achievements/unlock — manually unlock (for first-commit, first-deploy, first-plugin)
router.post("/achievements/unlock", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { achievementId } = req.body as { achievementId: string };
    if (!achievementId) { res.status(400).json({ error: "achievementId required" }); return; }

    // Prevent unlocking AI gen achievements manually
    if (["first-ai-gen", "ai-gen-10", "ai-gen-50", "referral-1", "streak-7"].includes(achievementId)) {
      res.status(403).json({ error: "This achievement is unlocked automatically" }); return;
    }

    const result = await unlockAchievement(userId, achievementId);
    if (!result.achievement) { res.status(404).json({ error: "Achievement not found" }); return; }

    res.json({
      ...result,
      message: result.unlocked
        ? `Achievement unlocked: ${result.achievement.title}${result.creditsGranted ? ` (+${result.creditsGranted.toLocaleString()} credits)` : ""}`
        : "Achievement already unlocked",
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
