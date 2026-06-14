import { Router } from "express";
import { getProjectDir } from "./projects";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

export type EnvName = "development" | "staging" | "production";

export interface EnvConfig {
  name: EnvName;
  displayName: string;
  color: string;
  url?: string;
  port?: number;
  config: Record<string, string>;
  status: "idle" | "building" | "running" | "failed" | "stopped";
  version?: string;
  commitHash?: string;
  deployedAt?: string;
  deployedBy?: string;
}

const DEFAULTS: Record<EnvName, Omit<EnvConfig, "status">> = {
  development: {
    name: "development",
    displayName: "Development",
    color: "blue",
    config: { NODE_ENV: "development", LOG_LEVEL: "debug", PORT: "9001" },
  },
  staging: {
    name: "staging",
    displayName: "Staging",
    color: "amber",
    config: { NODE_ENV: "staging", LOG_LEVEL: "info", PORT: "9002" },
  },
  production: {
    name: "production",
    displayName: "Production",
    color: "green",
    config: { NODE_ENV: "production", LOG_LEVEL: "warn", PORT: "9003" },
  },
};

// In-memory store: projectId → env → config
const envStore = new Map<string, Map<EnvName, EnvConfig>>();

function getEnvStore(projectId: string): Map<EnvName, EnvConfig> {
  if (!envStore.has(projectId)) {
    const m = new Map<EnvName, EnvConfig>();
    for (const [name, def] of Object.entries(DEFAULTS)) {
      m.set(name as EnvName, { ...def, status: "idle" });
    }
    envStore.set(projectId, m);
  }
  return envStore.get(projectId)!;
}

export function getEnvConfig(projectId: string, env: EnvName): EnvConfig {
  return getEnvStore(projectId).get(env)!;
}

export function updateEnvStatus(projectId: string, env: EnvName, patch: Partial<EnvConfig>) {
  const store = getEnvStore(projectId);
  const current = store.get(env)!;
  store.set(env, { ...current, ...patch });
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/envs/:projectId/list
router.get("/envs/:projectId/list", (req, res) => {
  const { projectId } = req.params;
  const store = getEnvStore(projectId);
  const list = Array.from(store.values());
  res.json({ projectId, environments: list });
});

// GET /api/envs/:projectId/:env/config
router.get("/envs/:projectId/:env/config", (req, res) => {
  const { projectId, env } = req.params;
  if (!["development", "staging", "production"].includes(env)) {
    res.status(400).json({ error: "Invalid environment" }); return;
  }
  const cfg = getEnvConfig(projectId, env as EnvName);
  res.json(cfg);
});

// PUT /api/envs/:projectId/:env/config — update env vars
router.put("/envs/:projectId/:env/config", (req, res) => {
  const { projectId, env } = req.params;
  if (!["development", "staging", "production"].includes(env)) {
    res.status(400).json({ error: "Invalid environment" }); return;
  }
  const { config, url } = req.body as { config?: Record<string, string>; url?: string };
  const store = getEnvStore(projectId);
  const current = store.get(env as EnvName)!;
  store.set(env as EnvName, {
    ...current,
    config: { ...current.config, ...(config ?? {}) },
    ...(url !== undefined ? { url } : {}),
  });
  res.json({ success: true, env: store.get(env as EnvName) });
});

// POST /api/envs/:projectId/:env/promote — promote version between envs
router.post("/envs/:projectId/:env/promote", (req, res) => {
  const { projectId, env } = req.params;
  const { toEnv, version, commitHash } = req.body as {
    toEnv: EnvName;
    version?: string;
    commitHash?: string;
  };

  if (!["development", "staging", "production"].includes(env) ||
      !["development", "staging", "production"].includes(toEnv)) {
    res.status(400).json({ error: "Invalid environment" }); return;
  }

  const srcCfg = getEnvConfig(projectId, env as EnvName);
  updateEnvStatus(projectId, toEnv, {
    status: "idle",
    version: version ?? srcCfg.version,
    commitHash: commitHash ?? srcCfg.commitHash,
  });

  res.json({
    success: true,
    message: `Promoted from ${env} to ${toEnv}`,
    version: version ?? srcCfg.version,
  });
});

export default router;
