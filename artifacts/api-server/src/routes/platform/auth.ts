import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";

const router = Router();

// ── Storage helpers ───────────────────────────────────────────────────────────

function getDataDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
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
    const raw = await fs.readFile(path.join(getDataDir(), "users.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeUsers(users: User[]): Promise<void> {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(path.join(getDataDir(), "users.json"), JSON.stringify(users, null, 2), "utf-8");
}

// ── Passkey credential storage ────────────────────────────────────────────────

interface StoredCredential {
  id: string;                           // base64url credential ID
  userId: string;
  publicKey: string;                    // base64 encoded Uint8Array
  counter: number;
  transports: AuthenticatorTransportFuture[];
  createdAt: string;
  deviceName?: string;
}

async function readCredentials(): Promise<StoredCredential[]> {
  try {
    const raw = await fs.readFile(path.join(getDataDir(), "passkeys.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeCredentials(creds: StoredCredential[]): Promise<void> {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(path.join(getDataDir(), "passkeys.json"), JSON.stringify(creds, null, 2));
}

// ── In-memory challenge store (keyed by userId or "anon-<ip>") ────────────────

const pendingChallenges = new Map<string, string>();

// ── JWT helpers ───────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  return process.env.SESSION_SECRET ?? "cloudide-secret-change-in-prod";
}

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { sub: string };
  } catch { return null; }
}

export function getAuthUser(authHeader?: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const payload = verifyToken(authHeader.slice(7));
  return payload?.sub ?? null;
}

// ── RP helpers ────────────────────────────────────────────────────────────────

function getRpID(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return "localhost";
  }
}

function getOrigin(req: any): string {
  return req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "http://localhost";
}

// ── Standard auth ─────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post("/auth/register", async (req, res) => {
  try {
    const { username, password, email } = req.body as {
      username?: string; password?: string; email?: string;
    };

    if (!username || !password) {
      res.status(400).json({ error: "username and password required" }); return;
    }
    if (username.length < 3 || password.length < 6) {
      res.status(400).json({ error: "username ≥3 chars, password ≥6 chars" }); return;
    }

    const users = await readUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({ error: "Username already taken" }); return;
    }
    if (email && users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      res.status(409).json({ error: "Email already registered" }); return;
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Registration failed" });
  }
});

// POST /api/auth/login — accepts username OR email
router.post("/auth/login", async (req, res) => {
  try {
    const { username, email, password } = req.body as {
      username?: string; email?: string; password?: string;
    };
    const identifier = username || email;

    if (!identifier || !password) {
      res.status(400).json({ error: "Email/username and password required" }); return;
    }

    const users = await readUsers();
    const user = users.find(u =>
      u.username.toLowerCase() === identifier.toLowerCase() ||
      u.email.toLowerCase() === identifier.toLowerCase()
    );

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" }); return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" }); return;
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Login failed" });
  }
});

// GET /api/auth/me
router.get("/auth/me", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const users = await readUsers();
    const user = users.find(u => u.id === userId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // Include passkey count
    const creds = await readCredentials();
    const passkeyCount = creds.filter(c => c.userId === userId).length;

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      passkeyCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Passkey registration ──────────────────────────────────────────────────────

// POST /api/auth/passkey/register-start
// Requires: Authorization header (user must be logged in to add a passkey)
router.post("/auth/passkey/register-start", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Login required to add a passkey" }); return; }

    const users = await readUsers();
    const user = users.find(u => u.id === userId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const creds = await readCredentials();
    const existingCreds = creds.filter(c => c.userId === userId);

    const origin = getOrigin(req);
    const rpID = getRpID(origin);

    const options = await generateRegistrationOptions({
      rpName: "CloudIDE",
      rpID,
      userName: user.username,
      userDisplayName: user.username,
      userID: new TextEncoder().encode(userId),
      attestationType: "none",
      excludeCredentials: existingCreds.map(c => ({
        id: c.id,
        transports: c.transports,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    pendingChallenges.set(`reg-${userId}`, options.challenge);
    res.json(options);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/passkey/register-finish
router.post("/auth/passkey/register-finish", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Login required" }); return; }

    const expectedChallenge = pendingChallenges.get(`reg-${userId}`);
    if (!expectedChallenge) { res.status(400).json({ error: "No pending challenge, start registration first" }); return; }

    const origin = getOrigin(req);
    const rpID = getRpID(origin);

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
    } catch (e: any) {
      res.status(400).json({ error: `Verification failed: ${e.message}` }); return;
    }

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: "Passkey verification failed" }); return;
    }

    const { credential } = verification.registrationInfo;

    const creds = await readCredentials();
    const stored: StoredCredential = {
      id: credential.id,
      userId,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      transports: (req.body.response?.transports ?? []) as AuthenticatorTransportFuture[],
      createdAt: new Date().toISOString(),
      deviceName: req.body.deviceName ?? "Passkey",
    };
    creds.push(stored);
    await writeCredentials(creds);

    pendingChallenges.delete(`reg-${userId}`);
    res.json({ success: true, credentialId: credential.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Passkey authentication ────────────────────────────────────────────────────

// POST /api/auth/passkey/login-start
router.post("/auth/passkey/login-start", async (req, res) => {
  try {
    const { username, email } = req.body as { username?: string; email?: string };
    const identifier = username || email;

    const origin = getOrigin(req);
    const rpID = getRpID(origin);

    let allowCredentials: { id: string; transports: AuthenticatorTransportFuture[] }[] = [];
    let challengeKey = `anon-${Date.now()}`;

    if (identifier) {
      const users = await readUsers();
      const user = users.find(u =>
        u.username.toLowerCase() === identifier.toLowerCase() ||
        u.email.toLowerCase() === identifier.toLowerCase()
      );
      if (user) {
        const creds = await readCredentials();
        const userCreds = creds.filter(c => c.userId === user.id);
        allowCredentials = userCreds.map(c => ({ id: c.id, transports: c.transports }));
        challengeKey = `auth-${user.id}`;
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "preferred",
    });

    pendingChallenges.set(challengeKey, options.challenge);
    // Also store a generic challenge keyed by the challenge itself for discoverable creds
    pendingChallenges.set(`challenge-${options.challenge}`, options.challenge);

    res.json({ ...options, challengeKey });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/passkey/login-finish
router.post("/auth/passkey/login-finish", async (req, res) => {
  try {
    const { challengeKey } = req.body as { challengeKey?: string };
    const credentialId = req.body.id as string;

    const creds = await readCredentials();
    const stored = creds.find(c => c.id === credentialId);
    if (!stored) { res.status(401).json({ error: "Passkey not recognized" }); return; }

    // Try to find challenge by user or by generic key
    const authKey = `auth-${stored.userId}`;
    const expectedChallenge =
      pendingChallenges.get(authKey) ||
      (challengeKey ? pendingChallenges.get(challengeKey) : undefined);

    if (!expectedChallenge) {
      res.status(400).json({ error: "Challenge expired, please try again" }); return;
    }

    const origin = getOrigin(req);
    const rpID = getRpID(origin);

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response: req.body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: stored.id,
          publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64")),
          counter: stored.counter,
          transports: stored.transports,
        },
      });
    } catch (e: any) {
      res.status(400).json({ error: `Verification failed: ${e.message}` }); return;
    }

    if (!verification.verified) {
      res.status(401).json({ error: "Passkey authentication failed" }); return;
    }

    // Update counter
    stored.counter = verification.authenticationInfo.newCounter;
    await writeCredentials(creds);

    pendingChallenges.delete(authKey);

    const users = await readUsers();
    const user = users.find(u => u.id === stored.userId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/passkey/list — list user's passkeys
router.get("/auth/passkey/list", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const creds = await readCredentials();
    const userCreds = creds
      .filter(c => c.userId === userId)
      .map(c => ({ id: c.id, deviceName: c.deviceName, createdAt: c.createdAt }));

    res.json({ passkeys: userCreds });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/passkey/:id — remove a passkey
router.delete("/auth/passkey/:id", async (req, res) => {
  try {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const creds = await readCredentials();
    const filtered = creds.filter(c => !(c.id === req.params.id && c.userId === userId));
    await writeCredentials(filtered);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
