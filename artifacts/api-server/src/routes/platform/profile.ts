import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────

export type SkillLevel = "beginner" | "intermediate" | "expert";
export type UXMode = "beginner" | "intermediate" | "expert";

export interface BehaviorEvent {
  id: string;
  type:
    | "file_edit" | "file_create" | "code_run" | "deploy"
    | "ai_prompt" | "plugin_install" | "error_encountered"
    | "terminal_use" | "search" | "marketplace_browse";
  detail: string;
  language?: string;
  framework?: string;
  timestamp: string;
}

export interface UserProfile {
  userId: string;
  displayName?: string;
  skillLevel: SkillLevel;
  uxMode: UXMode;
  preferredLanguages: string[];
  preferredFrameworks: string[];
  goals: string[];                    // goal ids
  // UX preferences
  editorFontSize: number;
  sidebarDensity: "compact" | "comfortable" | "spacious";
  aiSuggestionsFrequency: "low" | "medium" | "high";
  terminalSize: "small" | "medium" | "large";
  // Personalization flags
  personalizationEnabled: boolean;
  adaptiveAiEnabled: boolean;
  // Computed stats
  totalEdits: number;
  totalRuns: number;
  totalDeploys: number;
  totalAiPrompts: number;
  totalErrors: number;
  // Behavior history (last 200)
  behaviorHistory: BehaviorEvent[];
  // Activity by day (last 30 days)
  activityByDay: Record<string, number>;
  // Language usage counts
  languageUsage: Record<string, number>;
  // Meta
  createdAt: string;
  updatedAt: string;
}

// ── Storage ──────────────────────────────────────────────────────────────────

function getPlatformDir() {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readProfiles(): Promise<UserProfile[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(getPlatformDir(), "user-profiles.json"), "utf-8"));
  } catch { return []; }
}

async function writeProfiles(d: UserProfile[]) {
  const dir = getPlatformDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "user-profiles.json"), JSON.stringify(d, null, 2));
}

function freshProfile(userId: string): UserProfile {
  return {
    userId,
    skillLevel: "beginner",
    uxMode: "beginner",
    preferredLanguages: [],
    preferredFrameworks: [],
    goals: [],
    editorFontSize: 14,
    sidebarDensity: "comfortable",
    aiSuggestionsFrequency: "medium",
    terminalSize: "medium",
    personalizationEnabled: true,
    adaptiveAiEnabled: true,
    totalEdits: 0,
    totalRuns: 0,
    totalDeploys: 0,
    totalAiPrompts: 0,
    totalErrors: 0,
    behaviorHistory: [],
    activityByDay: {},
    languageUsage: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function getOrCreateProfile(userId: string): Promise<UserProfile> {
  const all = await readProfiles();
  const existing = all.find(p => p.userId === userId);
  if (existing) return existing;
  const fresh = freshProfile(userId);
  all.push(fresh);
  await writeProfiles(all);
  return fresh;
}

// ── Skill auto-detection ─────────────────────────────────────────────────────

function detectSkillLevel(profile: UserProfile): SkillLevel {
  const total = profile.totalEdits + profile.totalRuns + profile.totalDeploys + profile.totalAiPrompts;
  if (total < 20) return "beginner";
  if (total < 200) return "intermediate";
  return "expert";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  js: "javascript", ts: "typescript", py: "python", rb: "ruby",
  go: "go", rs: "rust", java: "java", cs: "csharp", cpp: "cpp",
  jsx: "javascript", tsx: "typescript", vue: "vue", svelte: "svelte",
};

function detectLanguage(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /profile/get
router.get("/profile/get", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const profile = await getOrCreateProfile(userId);
  res.json({ profile });
});

// PUT /profile/update
router.put("/profile/update", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const updates = req.body as Partial<UserProfile>;
  const all = await readProfiles();
  let profile = all.find(p => p.userId === userId);
  if (!profile) { profile = freshProfile(userId); all.push(profile); }

  // Allow safe field updates
  const safe: (keyof UserProfile)[] = [
    "displayName", "uxMode", "preferredLanguages", "preferredFrameworks",
    "editorFontSize", "sidebarDensity", "aiSuggestionsFrequency",
    "terminalSize", "personalizationEnabled", "adaptiveAiEnabled",
  ];
  for (const key of safe) {
    if (updates[key] !== undefined) (profile as any)[key] = updates[key];
  }
  profile.updatedAt = new Date().toISOString();
  await writeProfiles(all);
  res.json({ ok: true, profile });
});

// POST /profile/behavior — record a behavior event
router.post("/profile/behavior", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { type, detail, language, framework, filename } = req.body as {
    type: BehaviorEvent["type"];
    detail?: string;
    language?: string;
    framework?: string;
    filename?: string;
  };

  if (!type) return void res.status(400).json({ error: "type required" });

  const all = await readProfiles();
  let profile = all.find(p => p.userId === userId);
  if (!profile) { profile = freshProfile(userId); all.push(profile); }

  if (!profile.personalizationEnabled) return void res.json({ ok: true, skipped: true });

  // Update counters
  if (type === "file_edit") profile.totalEdits++;
  if (type === "code_run") profile.totalRuns++;
  if (type === "deploy") profile.totalDeploys++;
  if (type === "ai_prompt") profile.totalAiPrompts++;
  if (type === "error_encountered") profile.totalErrors++;

  // Track language
  const lang = language ?? (filename ? detectLanguage(filename) : null);
  if (lang) {
    profile.languageUsage[lang] = (profile.languageUsage[lang] ?? 0) + 1;
    if (!profile.preferredLanguages.includes(lang) && (profile.languageUsage[lang] ?? 0) >= 3) {
      profile.preferredLanguages = [
        ...profile.preferredLanguages.filter(l => l !== lang),
        lang,
      ].slice(-5);
    }
  }

  // Activity by day
  const today = new Date().toISOString().slice(0, 10);
  profile.activityByDay[today] = (profile.activityByDay[today] ?? 0) + 1;
  // Keep last 30 days
  const days = Object.keys(profile.activityByDay).sort().slice(-30);
  profile.activityByDay = Object.fromEntries(days.map(d => [d, profile.activityByDay[d]]));

  // Append behavior event
  const event: BehaviorEvent = {
    id: randomUUID(),
    type,
    detail: (detail ?? "").slice(0, 200),
    language: lang ?? undefined,
    framework: framework ?? undefined,
    timestamp: new Date().toISOString(),
  };
  profile.behaviorHistory.push(event);
  if (profile.behaviorHistory.length > 200) {
    profile.behaviorHistory = profile.behaviorHistory.slice(-200);
  }

  // Auto-update skill level
  const detected = detectSkillLevel(profile);
  if (detected !== profile.skillLevel) {
    profile.skillLevel = detected;
    if (profile.uxMode === profile.skillLevel && detected !== profile.uxMode) {
      // only auto-upgrade uxMode if user hasn't manually set it differently
    }
  }

  profile.updatedAt = new Date().toISOString();
  await writeProfiles(all);
  res.json({ ok: true, skillLevel: profile.skillLevel });
});

// GET /profile/activity — recent activity + stats
router.get("/profile/activity", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const profile = await getOrCreateProfile(userId);
  const recent = [...profile.behaviorHistory].reverse().slice(0, 30);

  // Top languages by usage
  const topLangs = Object.entries(profile.languageUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang, count]) => ({ lang, count }));

  // Last 14 days activity
  const activityLast14: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    activityLast14.push({ date: d, count: profile.activityByDay[d] ?? 0 });
  }

  res.json({
    stats: {
      totalEdits: profile.totalEdits,
      totalRuns: profile.totalRuns,
      totalDeploys: profile.totalDeploys,
      totalAiPrompts: profile.totalAiPrompts,
      skillLevel: profile.skillLevel,
    },
    topLangs,
    activityLast14,
    recentEvents: recent,
  });
});

// GET /profile/privacy — view collected data summary
router.get("/profile/privacy", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const profile = await getOrCreateProfile(userId);
  res.json({
    dataCollected: {
      behaviorEvents: profile.behaviorHistory.length,
      languagesTracked: Object.keys(profile.languageUsage).length,
      activityDays: Object.keys(profile.activityByDay).length,
      goalsSet: profile.goals.length,
    },
    personalizationEnabled: profile.personalizationEnabled,
    adaptiveAiEnabled: profile.adaptiveAiEnabled,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  });
});

// DELETE /profile/reset
router.delete("/profile/reset", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const all = await readProfiles();
  const idx = all.findIndex(p => p.userId === userId);
  const fresh = freshProfile(userId);
  if (idx >= 0) all[idx] = fresh; else all.push(fresh);
  await writeProfiles(all);
  res.json({ ok: true, profile: fresh });
});

export default router;
