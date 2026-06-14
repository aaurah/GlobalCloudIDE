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
  catch { return (Array.isArray({} as T) ? [] : {}) as unknown as T; }
}

async function writeJSON(file: string, data: unknown) {
  const dir = getPlatformDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), JSON.stringify(data, null, 2));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Hub {
  id: string;
  name: string;
  slug: string;
  topic: string;
  description: string;
  icon: string;
  memberCount: number;
  members: string[];
  postCount: number;
  createdAt: string;
}

interface Post {
  id: string;
  hubId: string;
  hubName: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  codeSnippet?: string;
  language?: string;
  tags: string[];
  reactions: Record<string, string[]>;
  comments: PostComment[];
  views: number;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PostComment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  reactions: Record<string, string[]>;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  content: string;
  type: "text" | "code" | "system";
  language?: string;
  createdAt: string;
}

// ── Default hubs ──────────────────────────────────────────────────────────────

const DEFAULT_HUBS: Hub[] = [
  { id: "hub-python",     name: "Python",      slug: "python",     topic: "language",   description: "Python programming, tips, and projects",   icon: "🐍", memberCount: 0, members: [], postCount: 0, createdAt: new Date().toISOString() },
  { id: "hub-typescript", name: "TypeScript",  slug: "typescript", topic: "language",   description: "TypeScript development and best practices", icon: "🔷", memberCount: 0, members: [], postCount: 0, createdAt: new Date().toISOString() },
  { id: "hub-react",      name: "React",       slug: "react",      topic: "framework",  description: "React, hooks, components, and ecosystem",   icon: "⚛️",  memberCount: 0, members: [], postCount: 0, createdAt: new Date().toISOString() },
  { id: "hub-rust",       name: "Rust",        slug: "rust",       topic: "language",   description: "Systems programming with Rust",             icon: "🦀", memberCount: 0, members: [], postCount: 0, createdAt: new Date().toISOString() },
  { id: "hub-devops",     name: "DevOps",      slug: "devops",     topic: "ops",        description: "CI/CD, containers, cloud, deployment",      icon: "🚀", memberCount: 0, members: [], postCount: 0, createdAt: new Date().toISOString() },
  { id: "hub-ai",         name: "AI & ML",     slug: "ai-ml",      topic: "ai",         description: "AI, machine learning, LLMs, and tools",     icon: "🤖", memberCount: 0, members: [], postCount: 0, createdAt: new Date().toISOString() },
  { id: "hub-showcase",   name: "Showcase",    slug: "showcase",   topic: "community",  description: "Share your projects and get feedback",       icon: "✨", memberCount: 0, members: [], postCount: 0, createdAt: new Date().toISOString() },
  { id: "hub-help",       name: "Help & Q&A",  slug: "help",       topic: "community",  description: "Ask questions, get answers from peers",      icon: "🙋", memberCount: 0, members: [], postCount: 0, createdAt: new Date().toISOString() },
];

async function getHubs(): Promise<Hub[]> {
  const stored = await readJSON<Hub[]>("community-hubs.json");
  if (stored.length === 0) {
    await writeJSON("community-hubs.json", DEFAULT_HUBS);
    return DEFAULT_HUBS;
  }
  // Ensure all default hubs exist
  let changed = false;
  for (const def of DEFAULT_HUBS) {
    if (!stored.find(h => h.id === def.id)) { stored.push(def); changed = true; }
  }
  if (changed) await writeJSON("community-hubs.json", stored);
  return stored;
}

async function getUserDisplay(userId: string): Promise<string> {
  try {
    const users = await readJSON<Array<{ id: string; username: string }>>("users.json");
    return users.find(u => u.id === userId)?.username ?? userId.slice(0, 8);
  } catch { return userId.slice(0, 8); }
}

// ── Community Hubs ────────────────────────────────────────────────────────────

// GET /community/hubs
router.get("/community/hubs", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  const hubs = await getHubs();
  const result = hubs.map(h => ({
    ...h, isMember: userId ? h.members.includes(userId) : false,
  }));
  res.json({ hubs: result });
});

// POST /community/hubs/join/:id
router.post("/community/hubs/join/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const hubs = await getHubs();
  const hub = hubs.find(h => h.id === req.params.id || h.slug === req.params.id);
  if (!hub) return void res.status(404).json({ error: "Hub not found" });

  const joined = !hub.members.includes(userId);
  if (joined) { hub.members.push(userId); hub.memberCount++; }
  else { hub.members = hub.members.filter(m => m !== userId); hub.memberCount = Math.max(0, hub.memberCount - 1); }
  await writeJSON("community-hubs.json", hubs);
  res.json({ ok: true, joined, memberCount: hub.memberCount });
});

// GET /community/hubs/:id/posts?page=1
router.get("/community/hubs/:id/posts", async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const perPage = 20;
  const [posts, hubs] = await Promise.all([
    readJSON<Post[]>("community-posts.json"),
    getHubs(),
  ]);
  const resolvedHubId = hubs.find(h => h.slug === req.params.id)?.id ?? req.params.id;
  const hubPosts = posts
    .filter(p => p.hubId === resolvedHubId)
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice((page - 1) * perPage, page * perPage);

  res.json({ posts: hubPosts, page, perPage });
});

// POST /community/post  { hubId, title, body, codeSnippet, language, tags }
router.post("/community/post", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { hubId, title, body, codeSnippet, language, tags } = req.body as {
    hubId: string; title: string; body: string;
    codeSnippet?: string; language?: string; tags?: string[];
  };
  if (!hubId || !title?.trim() || !body?.trim()) return void res.status(400).json({ error: "hubId, title, and body required" });

  const hubs = await getHubs();
  const hub = hubs.find(h => h.id === hubId);
  if (!hub) return void res.status(404).json({ error: "Hub not found" });

  const authorName = await getUserDisplay(userId);
  const posts = await readJSON<Post[]>("community-posts.json");

  const post: Post = {
    id: randomUUID(), hubId, hubName: hub.name, authorId: userId, authorName,
    title: title.trim().slice(0, 200),
    body: body.trim().slice(0, 10000),
    codeSnippet: codeSnippet?.slice(0, 5000),
    language,
    tags: (tags ?? []).slice(0, 5).map(t => t.toLowerCase().trim()),
    reactions: {}, comments: [], views: 0, isPinned: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  posts.unshift(post);
  await writeJSON("community-posts.json", posts.slice(0, 2000));

  hub.postCount++;
  await writeJSON("community-hubs.json", hubs);

  res.json({ ok: true, post });
});

// GET /community/post/:id
router.get("/community/post/:id", async (req, res) => {
  const posts = await readJSON<Post[]>("community-posts.json");
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return void res.status(404).json({ error: "Not found" });
  post.views++;
  await writeJSON("community-posts.json", posts);
  res.json({ post });
});

// POST /community/post/:id/react  { emoji }
router.post("/community/post/:id/react", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const { emoji } = req.body as { emoji: string };
  if (!emoji) return void res.status(400).json({ error: "emoji required" });

  const posts = await readJSON<Post[]>("community-posts.json");
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return void res.status(404).json({ error: "Not found" });

  if (!post.reactions[emoji]) post.reactions[emoji] = [];
  const i = post.reactions[emoji].indexOf(userId);
  if (i === -1) post.reactions[emoji].push(userId); else post.reactions[emoji].splice(i, 1);
  await writeJSON("community-posts.json", posts);
  res.json({ ok: true, reactions: post.reactions });
});

// POST /community/post/:id/comment
router.post("/community/post/:id/comment", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const { content } = req.body as { content: string };
  if (!content?.trim()) return void res.status(400).json({ error: "content required" });

  const posts = await readJSON<Post[]>("community-posts.json");
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return void res.status(404).json({ error: "Not found" });

  const authorName = await getUserDisplay(userId);
  const comment: PostComment = {
    id: randomUUID(), authorId: userId, authorName,
    content: content.trim().slice(0, 2000),
    reactions: {}, createdAt: new Date().toISOString(),
  };
  post.comments.push(comment);
  post.updatedAt = new Date().toISOString();
  await writeJSON("community-posts.json", posts);
  res.json({ ok: true, comment });
});

// GET /community/feed?limit=30
router.get("/community/feed", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const posts = await readJSON<Post[]>("community-posts.json");
  const sorted = [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ posts: sorted.slice(0, limit) });
});

// ── Chat ──────────────────────────────────────────────────────────────────────

// POST /chat/send  { roomId, content, type?, language? }
router.post("/chat/send", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { roomId, content, type, language } = req.body as {
    roomId: string; content: string; type?: ChatMessage["type"]; language?: string;
  };
  if (!roomId || !content?.trim()) return void res.status(400).json({ error: "roomId and content required" });

  const username = await getUserDisplay(userId);
  const msg: ChatMessage = {
    id: randomUUID(), roomId, userId, username,
    content: content.trim().slice(0, 4000),
    type: type ?? "text", language,
    createdAt: new Date().toISOString(),
  };

  const all = await readJSON<ChatMessage[]>("chat-messages.json");
  all.push(msg);
  // Keep last 500 messages per room; keep total under 5000
  const cleaned = all.slice(-5000);
  await writeJSON("chat-messages.json", cleaned);
  res.json({ ok: true, message: msg });
});

// GET /chat/history/:roomId?limit=50
router.get("/chat/history/:roomId", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const all = await readJSON<ChatMessage[]>("chat-messages.json");
  const messages = all
    .filter(m => m.roomId === req.params.roomId)
    .slice(-limit);
  res.json({ messages });
});

// GET /chat/rooms  — list rooms user has messages in
router.get("/chat/rooms", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const all = await readJSON<ChatMessage[]>("chat-messages.json");
  const roomMap = new Map<string, { roomId: string; lastMessage: string; lastAt: string; unread: number }>();
  for (const msg of all) {
    const existing = roomMap.get(msg.roomId);
    if (!existing || msg.createdAt > existing.lastAt) {
      roomMap.set(msg.roomId, { roomId: msg.roomId, lastMessage: msg.content.slice(0, 60), lastAt: msg.createdAt, unread: 0 });
    }
  }
  res.json({ rooms: [...roomMap.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)) });
});

export default router;
