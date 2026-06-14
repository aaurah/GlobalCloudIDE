import { Router, type Request, type Response } from "express";
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

interface CollabSession {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  projectPath: string;
  participants: Participant[];
  isActive: boolean;
  isPublic: boolean;
  inviteCode: string;
  createdAt: string;
  lastActivity: string;
}

interface Participant {
  userId: string;
  username: string;
  color: string;
  role: "owner" | "editor" | "viewer";
  joinedAt: string;
  cursor?: { line: number; col: number; file: string };
  isOnline: boolean;
  lastSeen: string;
}

interface PresenceUpdate {
  sessionId: string;
  userId: string;
  cursor?: { line: number; col: number; file: string };
  selection?: { startLine: number; startCol: number; endLine: number; endCol: number; file: string };
  isTyping?: boolean;
  timestamp: string;
}

// ── In-memory SSE clients map ─────────────────────────────────────────────────

const presenceClients = new Map<string, Map<string, Response>>();

function broadcastToSession(sessionId: string, event: string, data: unknown) {
  const clients = presenceClients.get(sessionId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients.values()) {
    try { res.write(payload); } catch { /* client disconnected */ }
  }
}

// ── Participant colors ────────────────────────────────────────────────────────

const COLORS = [
  "#60a5fa", "#34d399", "#f472b6", "#fb923c",
  "#a78bfa", "#fbbf24", "#38bdf8", "#f87171",
];

function pickColor(index: number) { return COLORS[index % COLORS.length]; }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserDisplay(userId: string): Promise<string> {
  try {
    const users = await readJSON<Array<{ id: string; username: string }>>("users.json");
    return users.find(u => u.id === userId)?.username ?? userId.slice(0, 8);
  } catch { return userId.slice(0, 8); }
}

// ── Session management ────────────────────────────────────────────────────────

// POST /collab/session/create
router.post("/collab/session/create", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { name, projectPath, isPublic } = req.body as {
    name?: string; projectPath?: string; isPublic?: boolean;
  };

  const ownerName = await getUserDisplay(userId);
  const session: CollabSession = {
    id: randomUUID(),
    name: (name ?? `${ownerName}'s session`).slice(0, 80),
    ownerId: userId,
    ownerName,
    projectPath: projectPath ?? "/",
    participants: [{
      userId, username: ownerName,
      color: pickColor(0), role: "owner",
      joinedAt: new Date().toISOString(),
      isOnline: true, lastSeen: new Date().toISOString(),
    }],
    isActive: true,
    isPublic: isPublic !== false,
    inviteCode: randomUUID().slice(0, 8).toUpperCase(),
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };

  const all = await readJSON<CollabSession[]>("collab-sessions.json");
  all.push(session);
  await writeJSON("collab-sessions.json", all);
  res.json({ ok: true, session });
});

// POST /collab/session/join/:id  — join by session id or invite code
router.post("/collab/session/join/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const all = await readJSON<CollabSession[]>("collab-sessions.json");
  const session = all.find(s =>
    (s.id === req.params.id || s.inviteCode === req.params.id.toUpperCase()) && s.isActive
  );
  if (!session) return void res.status(404).json({ error: "Session not found or inactive" });

  const already = session.participants.find(p => p.userId === userId);
  if (already) {
    already.isOnline = true;
    already.lastSeen = new Date().toISOString();
  } else {
    const username = await getUserDisplay(userId);
    const participant: Participant = {
      userId, username,
      color: pickColor(session.participants.length),
      role: "editor",
      joinedAt: new Date().toISOString(),
      isOnline: true,
      lastSeen: new Date().toISOString(),
    };
    session.participants.push(participant);
    broadcastToSession(session.id, "participant_joined", { userId, username, color: participant.color });
  }

  session.lastActivity = new Date().toISOString();
  const idx = all.findIndex(s => s.id === session.id);
  all[idx] = session;
  await writeJSON("collab-sessions.json", all);
  res.json({ ok: true, session });
});

// DELETE /collab/session/leave/:id
router.delete("/collab/session/leave/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const all = await readJSON<CollabSession[]>("collab-sessions.json");
  const session = all.find(s => s.id === req.params.id);
  if (!session) return void res.status(404).json({ error: "Session not found" });

  const p = session.participants.find(p => p.userId === userId);
  if (p) { p.isOnline = false; p.lastSeen = new Date().toISOString(); }

  // Owner ending session closes it for all
  if (session.ownerId === userId) {
    session.isActive = false;
    broadcastToSession(session.id, "session_closed", { message: "Host ended the session" });
  } else {
    broadcastToSession(session.id, "participant_left", { userId, username: p?.username });
  }

  await writeJSON("collab-sessions.json", all);
  res.json({ ok: true });
});

// GET /collab/session/:id
router.get("/collab/session/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const all = await readJSON<CollabSession[]>("collab-sessions.json");
  const session = all.find(s => s.id === req.params.id);
  if (!session) return void res.status(404).json({ error: "Not found" });
  res.json({ session });
});

// GET /collab/sessions/active — list active sessions (public or yours)
router.get("/collab/sessions/active", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const all = await readJSON<CollabSession[]>("collab-sessions.json");
  const sessions = all
    .filter(s => s.isActive && (s.isPublic || s.ownerId === userId || s.participants.some(p => p.userId === userId)))
    .map(s => ({
      id: s.id, name: s.name, ownerName: s.ownerName, projectPath: s.projectPath,
      participantCount: s.participants.filter(p => p.isOnline).length,
      isPublic: s.isPublic, inviteCode: s.ownerId === userId ? s.inviteCode : undefined,
      createdAt: s.createdAt, lastActivity: s.lastActivity,
    }));
  res.json({ sessions });
});

// ── Presence (SSE) ────────────────────────────────────────────────────────────

// GET /collab/presence/:sessionId  — SSE stream
router.get("/collab/presence/:sessionId", (req: Request, res: Response) => {
  const userId = getAuthUser(req.headers.authorization ?? (req.query.token as string));
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { sessionId } = req.params;

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  if (!presenceClients.has(sessionId)) presenceClients.set(sessionId, new Map());
  presenceClients.get(sessionId)!.set(userId, res);

  res.write(`event: connected\ndata: ${JSON.stringify({ userId, sessionId })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat\n\n`); } catch { clearInterval(heartbeat); }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    presenceClients.get(sessionId)?.delete(userId);
    broadcastToSession(sessionId, "presence_offline", { userId });
  });
});

// POST /collab/presence/update — broadcast cursor/selection to session
router.post("/collab/presence/update", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const update = req.body as PresenceUpdate;
  if (!update.sessionId) return void res.status(400).json({ error: "sessionId required" });

  // Persist cursor in session
  const all = await readJSON<CollabSession[]>("collab-sessions.json");
  const session = all.find(s => s.id === update.sessionId);
  if (session) {
    const p = session.participants.find(p => p.userId === userId);
    if (p) {
      if (update.cursor) p.cursor = update.cursor;
      p.lastSeen = new Date().toISOString();
      p.isOnline = true;
    }
    session.lastActivity = new Date().toISOString();
    await writeJSON("collab-sessions.json", all);
  }

  broadcastToSession(update.sessionId, "presence_update", {
    userId,
    cursor: update.cursor,
    selection: update.selection,
    isTyping: update.isTyping,
    timestamp: new Date().toISOString(),
  });

  res.json({ ok: true });
});

// ── AI Collaboration ──────────────────────────────────────────────────────────

// POST /collab/ai/summary  { sessionId }
router.post("/collab/ai/summary", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { sessionId } = req.body as { sessionId: string };
  if (!sessionId) return void res.status(400).json({ error: "sessionId required" });

  const all = await readJSON<CollabSession[]>("collab-sessions.json");
  const session = all.find(s => s.id === sessionId);
  if (!session) return void res.status(404).json({ error: "Session not found" });

  const onlineParticipants = session.participants.filter(p => p.isOnline);

  // Build a text summary without AI (fallback)
  const summary = {
    sessionName: session.name,
    duration: Math.round((Date.now() - new Date(session.createdAt).getTime()) / 60000),
    participants: onlineParticipants.map(p => p.username),
    projectPath: session.projectPath,
    activeCursors: onlineParticipants.filter(p => p.cursor).map(p => ({
      user: p.username, file: p.cursor?.file, line: p.cursor?.line,
    })),
    summary: `${onlineParticipants.length} developer${onlineParticipants.length !== 1 ? "s" : ""} collaborating on ${session.projectPath}. Session started ${Math.round((Date.now() - new Date(session.createdAt).getTime()) / 60000)} minutes ago.`,
  };

  // If OpenAI available, enhance
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey });
      const prompt = `Summarize this coding session in 2-3 sentences: ${JSON.stringify(summary)}`;
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
      });
      summary.summary = completion.choices[0]?.message?.content ?? summary.summary;
    } catch { /* use fallback */ }
  }

  res.json({ summary });
});

// POST /collab/ai/suggest  { context, language, partial }
router.post("/collab/ai/suggest", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { context, language, partial } = req.body as {
    context?: string; language?: string; partial?: string;
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return void res.json({ suggestion: "", error: "AI not configured" });

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });
    const prompt = `You are pair-programming. Complete this ${language ?? "code"} snippet concisely (max 5 lines).
Context: ${(context ?? "").slice(0, 500)}
Partial code: ${partial ?? ""}
Complete it:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
    });
    res.json({ suggestion: completion.choices[0]?.message?.content ?? "" });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

export default router;
