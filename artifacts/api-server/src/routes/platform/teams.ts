import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

export interface TeamMember {
  userId: string;
  username: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  username: string;
  action: string;
  resource: string;
  timestamp: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: TeamMember[];
  activity: ActivityEvent[];
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

function getTeamsFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform/teams.json");
}

async function readTeams(): Promise<Team[]> {
  try {
    const raw = await fs.readFile(getTeamsFile(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeTeams(teams: Team[]): Promise<void> {
  const file = getTeamsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(teams, null, 2));
}

async function getUsernameById(userId: string): Promise<string> {
  try {
    const cwd = process.cwd();
    const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
    const raw = await fs.readFile(path.resolve(root, "ide-workspace/.platform/users.json"), "utf-8");
    const users = JSON.parse(raw);
    const user = users.find((u: any) => u.id === userId);
    return user?.username ?? "unknown";
  } catch {
    return "unknown";
  }
}

function logActivity(team: Team, userId: string, username: string, action: string, resource: string) {
  team.activity.unshift({
    id: randomUUID(),
    userId,
    username,
    action,
    resource,
    timestamp: new Date().toISOString(),
  });
  if (team.activity.length > 200) team.activity = team.activity.slice(0, 200);
  team.updatedAt = new Date().toISOString();
}

// GET /teams
router.get("/teams", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const teams = await readTeams();
  const mine = teams.filter(t => t.members.some(m => m.userId === userId));
  res.json(mine.map(t => ({ ...t, activity: t.activity.slice(0, 5) })));
});

// POST /teams
router.post("/teams", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { name, description = "" } = req.body as { name: string; description?: string };
  if (!name) return void res.status(400).json({ error: "name required" });

  const username = await getUsernameById(userId);
  const team: Team = {
    id: randomUUID(),
    name,
    description,
    ownerId: userId,
    members: [{ userId, username, role: "owner", joinedAt: new Date().toISOString() }],
    activity: [],
    projectIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  logActivity(team, userId, username, "created team", name);
  const teams = await readTeams();
  teams.push(team);
  await writeTeams(teams);
  res.status(201).json(team);
});

// GET /teams/:id
router.get("/teams/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const teams = await readTeams();
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return void res.status(404).json({ error: "Team not found" });
  if (!team.members.some(m => m.userId === userId)) return void res.status(403).json({ error: "Not a member" });
  res.json(team);
});

// PATCH /teams/:id
router.patch("/teams/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const teams = await readTeams();
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return void res.status(404).json({ error: "Team not found" });

  const member = team.members.find(m => m.userId === userId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return void res.status(403).json({ error: "Insufficient permissions" });
  }

  const { name, description } = req.body as { name?: string; description?: string };
  if (name) team.name = name;
  if (description !== undefined) team.description = description;
  logActivity(team, userId, member.username, "updated team settings", team.name);
  await writeTeams(teams);
  res.json(team);
});

// DELETE /teams/:id
router.delete("/teams/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  let teams = await readTeams();
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return void res.status(404).json({ error: "Team not found" });
  if (team.ownerId !== userId) return void res.status(403).json({ error: "Only owner can delete" });

  teams = teams.filter(t => t.id !== req.params.id);
  await writeTeams(teams);
  res.json({ ok: true });
});

// POST /teams/:id/invite
router.post("/teams/:id/invite", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const teams = await readTeams();
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return void res.status(404).json({ error: "Team not found" });

  const inviter = team.members.find(m => m.userId === userId);
  if (!inviter || (inviter.role !== "owner" && inviter.role !== "admin")) {
    return void res.status(403).json({ error: "Insufficient permissions" });
  }

  const { inviteeId, role = "member" } = req.body as { inviteeId: string; role?: TeamMember["role"] };
  if (!inviteeId) return void res.status(400).json({ error: "inviteeId required" });
  if (team.members.some(m => m.userId === inviteeId)) {
    return void res.status(400).json({ error: "User already a member" });
  }

  const username = await getUsernameById(inviteeId);
  team.members.push({ userId: inviteeId, username, role, joinedAt: new Date().toISOString() });
  logActivity(team, userId, inviter.username, "invited user", username);
  await writeTeams(teams);
  res.json({ ok: true, member: { userId: inviteeId, username, role } });
});

// PATCH /teams/:id/members/:memberId/role
router.patch("/teams/:id/members/:memberId/role", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const teams = await readTeams();
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return void res.status(404).json({ error: "Team not found" });
  if (team.ownerId !== userId) return void res.status(403).json({ error: "Only owner can change roles" });

  const { role } = req.body as { role: TeamMember["role"] };
  const member = team.members.find(m => m.userId === req.params.memberId);
  if (!member) return void res.status(404).json({ error: "Member not found" });
  if (req.params.memberId === userId) return void res.status(400).json({ error: "Cannot change own role" });

  const inviter = team.members.find(m => m.userId === userId)!;
  member.role = role;
  logActivity(team, userId, inviter.username, `changed ${member.username} role to ${role}`, team.name);
  await writeTeams(teams);
  res.json({ ok: true, member });
});

// DELETE /teams/:id/members/:memberId
router.delete("/teams/:id/members/:memberId", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const teams = await readTeams();
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return void res.status(404).json({ error: "Team not found" });

  const remover = team.members.find(m => m.userId === userId);
  const targetMember = team.members.find(m => m.userId === req.params.memberId);
  if (!targetMember) return void res.status(404).json({ error: "Member not found" });

  const canRemove = team.ownerId === userId || req.params.memberId === userId;
  if (!canRemove) return void res.status(403).json({ error: "Insufficient permissions" });
  if (req.params.memberId === team.ownerId) return void res.status(400).json({ error: "Cannot remove owner" });

  team.members = team.members.filter(m => m.userId !== req.params.memberId);
  logActivity(team, userId, remover?.username ?? "unknown", "removed member", targetMember.username);
  await writeTeams(teams);
  res.json({ ok: true });
});

// GET /teams/:id/activity
router.get("/teams/:id/activity", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const teams = await readTeams();
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return void res.status(404).json({ error: "Team not found" });
  if (!team.members.some(m => m.userId === userId)) return void res.status(403).json({ error: "Not a member" });

  const limit = parseInt(String(req.query.limit ?? "50"));
  res.json({ activity: team.activity.slice(0, limit), total: team.activity.length });
});

// POST /teams/:id/projects
router.post("/teams/:id/projects", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const teams = await readTeams();
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return void res.status(404).json({ error: "Team not found" });

  const member = team.members.find(m => m.userId === userId);
  if (!member || member.role === "viewer") return void res.status(403).json({ error: "Insufficient permissions" });

  const { projectId } = req.body as { projectId: string };
  if (!projectId) return void res.status(400).json({ error: "projectId required" });
  if (!team.projectIds.includes(projectId)) team.projectIds.push(projectId);
  logActivity(team, userId, member.username, "added project", projectId);
  await writeTeams(teams);
  res.json({ ok: true });
});

export default router;
