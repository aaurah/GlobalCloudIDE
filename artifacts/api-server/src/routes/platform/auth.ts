import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const router = Router();

function getDataDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

function getUsersFile(): string {
  return path.join(getDataDir(), "users.json");
}

interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

async function readUsers(): Promise<User[]> {
  try {
    const raw = await fs.readFile(getUsersFile(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeUsers(users: User[]): Promise<void> {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(getUsersFile(), JSON.stringify(users, null, 2), "utf-8");
}

function getJwtSecret(): string {
  return process.env.SESSION_SECRET ?? "cloudide-secret-change-in-prod";
}

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { sub: string };
  } catch {
    return null;
  }
}

export function getAuthUser(authHeader?: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const payload = verifyToken(authHeader.slice(7));
  return payload?.sub ?? null;
}

// POST /api/auth/register
router.post("/auth/register", async (req, res) => {
  const { username, password, email } = req.body as {
    username?: string;
    password?: string;
    email?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }
  if (username.length < 3 || password.length < 6) {
    res.status(400).json({ error: "username ≥3 chars, password ≥6 chars" });
    return;
  }

  const users = await readUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user: User = {
    id: randomUUID(),
    username,
    email: email ?? "",
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeUsers(users);

  const token = signToken(user.id);
  res.status(201).json({
    token,
    user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt },
  });
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }

  const users = await readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt },
  });
});

// GET /api/auth/me
router.get("/auth/me", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const users = await readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ id: user.id, username: user.username, email: user.email, createdAt: user.createdAt });
});

export default router;
