import { Router } from "express";
import crypto from "crypto";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

type EnvScope = "development" | "staging" | "production" | "all";

interface SecretMeta {
  id: string;
  key: string;
  environment: EnvScope;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory store: key = `${projectId}:${environment}:${key}`
const secretValues = new Map<string, string>();
const secretMeta = new Map<string, SecretMeta>();

function storeKey(projectId: string, env: EnvScope, key: string): string {
  return `${projectId}:${env}:${key}`;
}

function encrypt(value: string): string {
  // Simple obfuscation (in prod: use KMS or AES-GCM with a real key)
  return Buffer.from(value).toString("base64");
}

function decrypt(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf8");
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/secrets/:projectId/list?env=
router.get("/secrets/:projectId/list", (req, res) => {
  const { projectId } = req.params;
  const env = (req.query.env as EnvScope | undefined);

  const results: SecretMeta[] = [];
  for (const [, meta] of secretMeta) {
    if (meta.projectId !== projectId) continue;
    if (env && meta.environment !== env && meta.environment !== "all") continue;
    results.push(meta);
  }

  results.sort((a, b) => a.key.localeCompare(b.key));
  res.json({ projectId, secrets: results });
});

// POST /api/secrets/:projectId/set
router.post("/secrets/:projectId/set", (req, res) => {
  const { projectId } = req.params;
  const { key, value, environment = "all" } = req.body as {
    key: string;
    value: string;
    environment?: EnvScope;
  };

  if (!key || !value) {
    res.status(400).json({ error: "key and value are required" }); return;
  }
  if (!/^[A-Z0-9_]+$/i.test(key)) {
    res.status(400).json({ error: "Secret key must be alphanumeric + underscores" }); return;
  }

  const sk = storeKey(projectId, environment, key);
  const existing = secretMeta.get(sk);
  const now = new Date().toISOString();

  const meta: SecretMeta = {
    id: existing?.id ?? crypto.randomUUID(),
    key,
    environment,
    projectId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  secretValues.set(sk, encrypt(value));
  secretMeta.set(sk, meta);

  res.json({ success: true, secret: meta });
});

// GET /api/secrets/:projectId/get?key=&env= — returns decrypted value
router.get("/secrets/:projectId/get", (req, res) => {
  const { projectId } = req.params;
  const key = req.query.key as string;
  const env = (req.query.env as EnvScope) ?? "all";

  if (!key) { res.status(400).json({ error: "key is required" }); return; }

  // Look up: exact env first, then "all"
  const sk = storeKey(projectId, env, key);
  const sk2 = storeKey(projectId, "all", key);
  const encoded = secretValues.get(sk) ?? secretValues.get(sk2);

  if (!encoded) { res.status(404).json({ error: "Secret not found" }); return; }

  res.json({ key, value: decrypt(encoded), environment: env });
});

// DELETE /api/secrets/:projectId/delete
router.delete("/secrets/:projectId/delete", (req, res) => {
  const { projectId } = req.params;
  const { key, environment = "all" } = req.body as { key: string; environment?: EnvScope };
  const sk = storeKey(projectId, environment, key);

  if (!secretMeta.has(sk)) {
    res.status(404).json({ error: "Secret not found" }); return;
  }

  secretValues.delete(sk);
  secretMeta.delete(sk);
  res.json({ success: true, deleted: key });
});

// POST /api/secrets/:projectId/inject — get all secrets as env object for a given environment
router.post("/secrets/:projectId/inject", (req, res) => {
  const { projectId } = req.params;
  const { environment } = req.body as { environment: EnvScope };

  const envVars: Record<string, string> = {};
  for (const [sk, meta] of secretMeta) {
    if (meta.projectId !== projectId) continue;
    if (meta.environment !== environment && meta.environment !== "all") continue;
    const encoded = secretValues.get(sk);
    if (encoded) envVars[meta.key] = decrypt(encoded);
  }

  res.json({ environment, count: Object.keys(envVars).length, env: envVars });
});

export default router;
