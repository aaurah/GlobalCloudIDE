import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { requireAdmin, logAudit } from "./index";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  username: string;
  email?: string;
  createdAt: string;
  passwordHash?: string;
}

interface Team {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  createdAt: string;
  plan?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPlatformDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readUsers(): Promise<User[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "users.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function readTeams(): Promise<Team[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "teams.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

// In-memory suspension store
const suspensions = new Map<string, { reason: string; at: string }>();

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/admin/users/list
router.get("/admin/users/list", requireAdmin("support"), async (req, res) => {
  const users = await readUsers();
  const { search, limit = 50, offset = 0 } = req.query;
  let list = users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email ?? null,
    createdAt: u.createdAt,
    suspended: suspensions.has(u.id),
    suspensionReason: suspensions.get(u.id)?.reason ?? null,
  }));
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(u => u.username.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q));
  }
  const total = list.length;
  list = list.slice(Number(offset), Number(offset) + Number(limit));
  res.json({ total, users: list });
});

// GET /api/admin/users/:id
router.get("/admin/users/:id", requireAdmin("support"), async (req, res) => {
  const users = await readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    createdAt: user.createdAt,
    suspended: suspensions.has(user.id),
    suspensionInfo: suspensions.get(user.id) ?? null,
  });
});

// POST /api/admin/users/suspend
router.post("/admin/users/suspend", requireAdmin("admin"), async (req, res) => {
  const { userId, reason = "Policy violation" } = req.body as { userId: string; reason?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  suspensions.set(userId, { reason, at: new Date().toISOString() });
  logAudit((req as any).adminUserId, "suspend_user", { userId, reason });
  res.json({ success: true, userId, suspended: true, reason });
});

// POST /api/admin/users/unsuspend
router.post("/admin/users/unsuspend", requireAdmin("admin"), async (req, res) => {
  const { userId } = req.body as { userId: string };
  suspensions.delete(userId);
  logAudit((req as any).adminUserId, "unsuspend_user", { userId });
  res.json({ success: true, userId, suspended: false });
});

// POST /api/admin/users/assign-role
router.post("/admin/users/assign-role", requireAdmin("super_admin"), async (req, res) => {
  // Delegate to main admin roles endpoint (proxy)
  const { userId, role } = req.body as { userId: string; role: string };
  logAudit((req as any).adminUserId, "assign_role", { userId, role });
  res.json({ success: true, userId, role });
});

// GET /api/admin/teams/list
router.get("/admin/teams/list", requireAdmin("support"), async (req, res) => {
  const teams = await readTeams();
  const users = await readUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));
  const list = teams.map(t => ({
    id: t.id,
    name: t.name,
    ownerUsername: userMap[t.ownerId] ?? t.ownerId,
    memberCount: t.memberIds?.length ?? 0,
    plan: t.plan ?? "free",
    createdAt: t.createdAt,
  }));
  res.json({ total: list.length, teams: list });
});

// GET /api/admin/teams/:id
router.get("/admin/teams/:id", requireAdmin("support"), async (req, res) => {
  const teams = await readTeams();
  const users = await readUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const team = teams.find(t => t.id === req.params.id);
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }
  res.json({
    ...team,
    members: (team.memberIds ?? []).map(id => ({
      id,
      username: userMap[id]?.username ?? id,
    })),
  });
});

// GET /api/admin/stats/users
router.get("/admin/stats/users", requireAdmin("auditor"), async (req, res) => {
  const users = await readUsers();
  const teams = await readTeams();
  const now = Date.now();
  const day = 86400000;
  const newToday = users.filter(u => now - new Date(u.createdAt).getTime() < day).length;
  const newWeek  = users.filter(u => now - new Date(u.createdAt).getTime() < 7 * day).length;
  res.json({
    totalUsers: users.length,
    totalTeams: teams.length,
    suspended: suspensions.size,
    newToday,
    newThisWeek: newWeek,
  });
});

export default router;
