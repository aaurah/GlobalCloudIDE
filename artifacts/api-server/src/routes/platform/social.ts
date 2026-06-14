import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

// ── Storage ───────────────────────────────────────────────────────────────────

function getPlatformDir() {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readJSON<T>(file: string): Promise<T> {
  try { return JSON.parse(await fs.readFile(path.join(getPlatformDir(), file), "utf-8")); }
  catch { return [] as unknown as T; }
}

async function writeJSON(file: string, data: unknown) {
  const dir = getPlatformDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), JSON.stringify(data, null, 2));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SocialProfile {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  skills: string[];
  languages: string[];
  badges: string[];
  followers: string[];
  following: string[];
  isPublic: boolean;
  githubUrl?: string;
  websiteUrl?: string;
  location?: string;
  totalProjects: number;
  totalDeployments: number;
  joinedAt: string;
  updatedAt: string;
}

interface ActivityItem {
  id: string;
  type: "commit" | "deploy" | "plugin_install" | "achievement" | "streak" | "comment" | "fork" | "star" | "follow" | "project_create" | "snippet_share";
  userId: string;
  username: string;
  payload: Record<string, unknown>;
  timestamp: string;
  isPublic: boolean;
}

interface ProjectSocial {
  projectId: string;
  ownerId: string;
  name: string;
  description: string;
  isPublic: boolean;
  stars: string[];
  forkCount: number;
  forkedFrom?: string;
  comments: ProjectComment[];
  tags: string[];
  language: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectComment {
  id: string;
  userId: string;
  username: string;
  content: string;
  reactions: Record<string, string[]>;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrCreateSocialProfile(userId: string, username = ""): Promise<SocialProfile> {
  const all = await readJSON<SocialProfile[]>("social-profiles.json");
  const existing = all.find(p => p.userId === userId);
  if (existing) return existing;
  const profile: SocialProfile = {
    userId, username, displayName: username,
    bio: "", avatarUrl: "", skills: [], languages: [],
    badges: ["newcomer"], followers: [], following: [],
    isPublic: true, totalProjects: 0, totalDeployments: 0,
    joinedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  all.push(profile);
  await writeJSON("social-profiles.json", all);
  return profile;
}

async function getUserUsername(userId: string): Promise<string> {
  const all = await readJSON<SocialProfile[]>("social-profiles.json");
  return all.find(p => p.userId === userId)?.username ?? userId.slice(0, 8);
}

async function pushActivity(item: Omit<ActivityItem, "id" | "timestamp">) {
  const feed = await readJSON<ActivityItem[]>("activity-feed.json");
  const entry: ActivityItem = { ...item, id: randomUUID(), timestamp: new Date().toISOString() };
  feed.unshift(entry);
  await writeJSON("activity-feed.json", feed.slice(0, 1000)); // cap at 1000
}

// ── Social Profile ────────────────────────────────────────────────────────────

// GET /social/profile/:userId
router.get("/social/profile/:userId", async (req, res) => {
  const requesterId = getAuthUser(req.headers.authorization);
  const { userId } = req.params;
  const all = await readJSON<SocialProfile[]>("social-profiles.json");
  const profile = all.find(p => p.userId === userId);
  if (!profile) return void res.status(404).json({ error: "Profile not found" });
  if (!profile.isPublic && requesterId !== userId)
    return void res.status(403).json({ error: "Profile is private" });
  res.json({ profile });
});

// GET /social/profile — own profile
router.get("/social/profile", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const profile = await getOrCreateSocialProfile(userId);
  res.json({ profile });
});

// PUT /social/profile/update
router.put("/social/profile/update", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const all = await readJSON<SocialProfile[]>("social-profiles.json");
  let profile = all.find(p => p.userId === userId);
  if (!profile) { profile = await getOrCreateSocialProfile(userId); all.push(profile); }

  const safe: (keyof SocialProfile)[] = [
    "displayName", "bio", "avatarUrl", "skills", "languages",
    "isPublic", "githubUrl", "websiteUrl", "location",
  ];
  const body = req.body as Partial<SocialProfile>;
  for (const key of safe) {
    if (body[key] !== undefined) (profile as Record<string, unknown>)[key] = body[key];
  }
  profile.updatedAt = new Date().toISOString();
  const idx = all.findIndex(p => p.userId === userId);
  if (idx >= 0) all[idx] = profile; else all.push(profile);
  await writeJSON("social-profiles.json", all);
  res.json({ ok: true, profile });
});

// POST /social/follow
router.post("/social/follow", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const { targetUserId } = req.body as { targetUserId: string };
  if (!targetUserId || targetUserId === userId) return void res.status(400).json({ error: "Invalid target" });

  const all = await readJSON<SocialProfile[]>("social-profiles.json");
  let me = all.find(p => p.userId === userId);
  let them = all.find(p => p.userId === targetUserId);
  if (!me) { me = await getOrCreateSocialProfile(userId); all.push(me); }
  if (!them) { them = await getOrCreateSocialProfile(targetUserId); all.push(them); }

  if (!me.following.includes(targetUserId)) {
    me.following.push(targetUserId);
    them.followers.push(userId);
    await writeJSON("social-profiles.json", all);
    await pushActivity({ type: "follow", userId, username: me.username,
      payload: { targetUserId, targetUsername: them.username }, isPublic: true });
  }
  res.json({ ok: true, following: me.following.length });
});

// DELETE /social/unfollow/:targetUserId
router.delete("/social/unfollow/:targetUserId", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const { targetUserId } = req.params;
  const all = await readJSON<SocialProfile[]>("social-profiles.json");
  const me = all.find(p => p.userId === userId);
  const them = all.find(p => p.userId === targetUserId);
  if (me) me.following = me.following.filter(id => id !== targetUserId);
  if (them) them.followers = them.followers.filter(id => id !== userId);
  await writeJSON("social-profiles.json", all);
  res.json({ ok: true });
});

// GET /social/search?q=
router.get("/social/search", async (req, res) => {
  const q = ((req.query.q as string) ?? "").toLowerCase().trim();
  if (!q) return void res.json({ users: [] });
  const all = await readJSON<SocialProfile[]>("social-profiles.json");
  const users = all
    .filter(p => p.isPublic && (
      p.username.toLowerCase().includes(q) ||
      p.displayName.toLowerCase().includes(q) ||
      p.skills.some(s => s.toLowerCase().includes(q))
    ))
    .slice(0, 20)
    .map(p => ({ userId: p.userId, username: p.username, displayName: p.displayName,
      bio: p.bio, avatarUrl: p.avatarUrl, skills: p.skills, followers: p.followers.length }));
  res.json({ users });
});

// ── Activity Feed ─────────────────────────────────────────────────────────────

// GET /social/feed?limit=30&offset=0
router.get("/social/feed", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const offset = Number(req.query.offset ?? 0);
  const feed = await readJSON<ActivityItem[]>("activity-feed.json");
  const items = feed.filter(i => i.isPublic).slice(offset, offset + limit);
  res.json({ items, total: feed.filter(i => i.isPublic).length });
});

// GET /social/feed/user/:userId
router.get("/social/feed/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const feed = await readJSON<ActivityItem[]>("activity-feed.json");
  const items = feed.filter(i => i.userId === userId && i.isPublic).slice(0, limit);
  res.json({ items });
});

// POST /social/activity — record an activity event
router.post("/social/activity", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const { type, payload, isPublic } = req.body as {
    type: ActivityItem["type"]; payload: Record<string, unknown>; isPublic?: boolean;
  };
  if (!type) return void res.status(400).json({ error: "type required" });
  const username = await getUserUsername(userId);
  await pushActivity({ type, userId, username, payload: payload ?? {}, isPublic: isPublic !== false });
  res.json({ ok: true });
});

// ── Public Projects ───────────────────────────────────────────────────────────

// GET /projects/public?q=&lang=&page=1
router.get("/projects/public", async (req, res) => {
  const q = ((req.query.q as string) ?? "").toLowerCase();
  const lang = (req.query.lang as string) ?? "";
  const page = Number(req.query.page ?? 1);
  const perPage = 20;
  const all = await readJSON<ProjectSocial[]>("project-social.json");
  let filtered = all.filter(p => p.isPublic);
  if (q) filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some(t => t.includes(q)));
  if (lang) filtered = filtered.filter(p => p.language.toLowerCase() === lang.toLowerCase());
  filtered = [...filtered].sort((a, b) => b.stars.length - a.stars.length);
  const items = filtered.slice((page - 1) * perPage, page * perPage);
  res.json({ projects: items, total: filtered.length, page, perPage });
});

// POST /projects/publish  { projectId, name, description, tags, language }
router.post("/projects/publish", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const { projectId, name, description, tags, language } = req.body as {
    projectId: string; name: string; description?: string; tags?: string[]; language?: string;
  };
  if (!projectId || !name) return void res.status(400).json({ error: "projectId and name required" });

  const all = await readJSON<ProjectSocial[]>("project-social.json");
  const existing = all.find(p => p.projectId === projectId);
  if (existing) {
    existing.isPublic = true;
    existing.name = name;
    existing.description = description ?? existing.description;
    existing.tags = tags ?? existing.tags;
    existing.language = language ?? existing.language;
    existing.updatedAt = new Date().toISOString();
  } else {
    all.push({ projectId, ownerId: userId, name,
      description: description ?? "", isPublic: true, stars: [],
      forkCount: 0, comments: [], tags: tags ?? [], language: language ?? "",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  await writeJSON("project-social.json", all);
  const username = await getUserUsername(userId);
  await pushActivity({ type: "project_create", userId, username, payload: { projectId, name }, isPublic: true });
  res.json({ ok: true });
});

// POST /projects/:id/star
router.post("/projects/:id/star", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const all = await readJSON<ProjectSocial[]>("project-social.json");
  const project = all.find(p => p.projectId === req.params.id);
  if (!project) return void res.status(404).json({ error: "Project not found" });

  const idx = project.stars.indexOf(userId);
  const starred = idx === -1;
  if (starred) project.stars.push(userId); else project.stars.splice(idx, 1);
  await writeJSON("project-social.json", all);
  res.json({ ok: true, starred, stars: project.stars.length });
});

// POST /projects/fork  { projectId }
router.post("/projects/fork", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const { projectId } = req.body as { projectId: string };
  const all = await readJSON<ProjectSocial[]>("project-social.json");
  const original = all.find(p => p.projectId === projectId && p.isPublic);
  if (!original) return void res.status(404).json({ error: "Project not found" });

  original.forkCount++;
  const newId = `${userId}-fork-${randomUUID().slice(0, 8)}`;
  const fork: ProjectSocial = { ...original, projectId: newId, ownerId: userId,
    stars: [], forkCount: 0, forkedFrom: projectId, comments: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  all.push(fork);
  await writeJSON("project-social.json", all);

  const username = await getUserUsername(userId);
  await pushActivity({ type: "fork", userId, username,
    payload: { projectId: newId, originalId: projectId, originalName: original.name }, isPublic: true });
  res.json({ ok: true, projectId: newId });
});

// GET /projects/:id/comments
router.get("/projects/:id/comments", async (req, res) => {
  const all = await readJSON<ProjectSocial[]>("project-social.json");
  const project = all.find(p => p.projectId === req.params.id);
  if (!project) return void res.status(404).json({ error: "Project not found" });
  res.json({ comments: project.comments });
});

// POST /projects/:id/comments
router.post("/projects/:id/comments", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const { content } = req.body as { content: string };
  if (!content?.trim()) return void res.status(400).json({ error: "content required" });

  const all = await readJSON<ProjectSocial[]>("project-social.json");
  const project = all.find(p => p.projectId === req.params.id);
  if (!project) return void res.status(404).json({ error: "Project not found" });

  const username = await getUserUsername(userId);
  const comment: ProjectComment = { id: randomUUID(), userId, username,
    content: content.trim().slice(0, 2000), reactions: {}, createdAt: new Date().toISOString() };
  project.comments.push(comment);
  await writeJSON("project-social.json", all);

  await pushActivity({ type: "comment", userId, username,
    payload: { projectId: req.params.id, projectName: project.name, commentId: comment.id }, isPublic: true });
  res.json({ ok: true, comment });
});

// POST /projects/:id/react  { emoji }
router.post("/projects/:id/react", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const { emoji, commentId } = req.body as { emoji: string; commentId?: string };
  if (!emoji) return void res.status(400).json({ error: "emoji required" });

  const all = await readJSON<ProjectSocial[]>("project-social.json");
  const project = all.find(p => p.projectId === req.params.id);
  if (!project) return void res.status(404).json({ error: "Not found" });

  if (commentId) {
    const comment = project.comments.find(c => c.id === commentId);
    if (comment) {
      if (!comment.reactions[emoji]) comment.reactions[emoji] = [];
      const r = comment.reactions[emoji];
      const i = r.indexOf(userId);
      if (i === -1) r.push(userId); else r.splice(i, 1);
    }
  }
  await writeJSON("project-social.json", all);
  res.json({ ok: true });
});

export default router;
