import { Router } from "express";
import { spawn } from "child_process";
import { getProjectDir } from "./projects";
import { updateEnvStatus } from "./environments";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeploymentRecord {
  id: string;
  projectId: string;
  environment: "development" | "staging" | "production";
  version: string;
  commitHash: string;
  timestamp: string;
  status: "success" | "failed" | "rolled-back" | "in-progress";
  strategy: "standard" | "blue-green" | "canary";
  durationMs?: number;
  rolledBackAt?: string;
  rollbackReason?: string;
  buildLogs?: string[];
}

interface BlueGreenState {
  projectId: string;
  active: "blue" | "green" | null;
  blue: SlotState | null;
  green: SlotState | null;
}

interface SlotState {
  version: string;
  deployedAt: string;
  status: "deploying" | "healthy" | "unhealthy" | "idle";
  port?: number;
}

interface CanaryState {
  projectId: string;
  status: "idle" | "running" | "aborted" | "complete";
  trafficPercent: number;
  stableVersion: string;
  canaryVersion: string;
  startedAt?: string;
  completedAt?: string;
  errorRate: number;
  latencyMs: number;
  abortReason?: string;
}

// ── In-memory stores ─────────────────────────────────────────────────────────

const history = new Map<string, DeploymentRecord[]>();
const blueGreenStore = new Map<string, BlueGreenState>();
const canaryStore = new Map<string, CanaryState>();

function getHistory(projectId: string): DeploymentRecord[] {
  if (!history.has(projectId)) history.set(projectId, []);
  return history.get(projectId)!;
}

function addRecord(record: DeploymentRecord) {
  const list = getHistory(record.projectId);
  list.unshift(record);
  if (list.length > 100) list.pop();
}

function makeid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getBlueGreen(projectId: string): BlueGreenState {
  if (!blueGreenStore.has(projectId)) {
    blueGreenStore.set(projectId, { projectId, active: null, blue: null, green: null });
  }
  return blueGreenStore.get(projectId)!;
}

function getCanary(projectId: string): CanaryState {
  if (!canaryStore.has(projectId)) {
    canaryStore.set(projectId, {
      projectId,
      status: "idle",
      trafficPercent: 0,
      stableVersion: "v1.0.0",
      canaryVersion: "",
      errorRate: 0,
      latencyMs: 0,
    });
  }
  return canaryStore.get(projectId)!;
}

// ── Deployment History ────────────────────────────────────────────────────────

// GET /api/releases/:projectId/history
router.get("/releases/:projectId/history", (req, res) => {
  const { projectId } = req.params;
  const limit = Number(req.query.limit ?? 20);
  const env = req.query.env as string | undefined;
  let list = getHistory(projectId);
  if (env) list = list.filter(r => r.environment === env);
  res.json({ projectId, history: list.slice(0, limit) });
});

// POST /api/releases/:projectId/rollback
router.post("/releases/:projectId/rollback", (req, res) => {
  const { projectId } = req.params;
  const { deploymentId, reason } = req.body as { deploymentId: string; reason?: string };
  const list = getHistory(projectId);
  const target = list.find(r => r.id === deploymentId);
  if (!target) { res.status(404).json({ error: "Deployment not found" }); return; }

  // Mark the current successful deploy as rolled-back
  const current = list.find(r => r.status === "success" && r.environment === target.environment);
  if (current) {
    current.status = "rolled-back";
    current.rolledBackAt = new Date().toISOString();
    current.rollbackReason = reason ?? "Manual rollback";
  }

  // Record the rollback itself as a new deployment
  const rollbackRecord: DeploymentRecord = {
    id: makeid(),
    projectId,
    environment: target.environment,
    version: target.version,
    commitHash: target.commitHash,
    timestamp: new Date().toISOString(),
    status: "success",
    strategy: target.strategy,
    durationMs: 3000,
    buildLogs: [`[rollback] Restored to ${target.version} (${target.commitHash})`],
  };
  addRecord(rollbackRecord);

  updateEnvStatus(projectId, target.environment, {
    version: target.version,
    commitHash: target.commitHash,
    status: "running",
  });

  res.json({
    success: true,
    restoredTo: target.version,
    record: rollbackRecord,
  });
});

// POST /api/releases/:projectId/record — called after a deploy to record it
router.post("/releases/:projectId/record", (req, res) => {
  const { projectId } = req.params;
  const body = req.body as Omit<DeploymentRecord, "id" | "timestamp">;
  const record: DeploymentRecord = {
    ...body,
    id: makeid(),
    timestamp: new Date().toISOString(),
    projectId,
  };
  addRecord(record);
  res.json({ success: true, record });
});

// ── Blue-Green ────────────────────────────────────────────────────────────────

// GET /api/releases/:projectId/blue-green/status
router.get("/releases/:projectId/blue-green/status", (req, res) => {
  res.json(getBlueGreen(req.params.projectId));
});

// POST /api/releases/:projectId/blue-green/start — deploy green slot (SSE)
router.post("/releases/:projectId/blue-green/start", async (req, res) => {
  const { projectId } = req.params;
  const { version = `v${Date.now()}`, commitHash = "HEAD", buildCommand = "" } = req.body as {
    version?: string; commitHash?: string; buildCommand?: string;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const state = getBlueGreen(projectId);
  const startedAt = new Date().toISOString();

  send({ type: "log", message: `🟢 Starting Green deployment: ${version}` });
  state.green = { version, deployedAt: startedAt, status: "deploying" };

  // Simulate / run build
  if (buildCommand.trim()) {
    send({ type: "log", message: `🔨 Build: ${buildCommand}` });
    const projectDir = getProjectDir(projectId);
    await new Promise<void>(resolve => {
      const [cmd, ...args] = buildCommand.split(" ");
      const child = spawn(cmd, args, { cwd: projectDir, shell: true, timeout: 120_000 });
      child.stdout.on("data", (d: Buffer) => send({ type: "log", message: d.toString().trim() }));
      child.stderr.on("data", (d: Buffer) => send({ type: "log", message: "[stderr] " + d.toString().trim() }));
      child.on("close", code => {
        if (code !== 0) {
          state.green!.status = "unhealthy";
          send({ type: "error", message: "Build failed" });
        }
        resolve();
      });
    });
    if (state.green.status === "unhealthy") {
      send({ type: "done", status: "failed" });
      res.end();
      return;
    }
  }

  send({ type: "log", message: "🩺 Running health checks on Green..." });
  await new Promise(r => setTimeout(r, 1500));

  state.green.status = "healthy";
  send({ type: "log", message: "✅ Green slot is healthy" });
  send({ type: "log", message: `⏳ Ready to switch traffic. Call /blue-green/switch to go live.` });
  send({ type: "done", status: "ready", state: getBlueGreen(projectId) });
  res.end();
});

// POST /api/releases/:projectId/blue-green/switch — cut traffic to green
router.post("/releases/:projectId/blue-green/switch", (req, res) => {
  const { projectId } = req.params;
  const state = getBlueGreen(projectId);

  if (!state.green || state.green.status !== "healthy") {
    res.status(400).json({ error: "Green slot is not healthy. Deploy green first." }); return;
  }

  const prevActive = state.active;
  state.active = "green";
  state.blue = prevActive === "green" ? state.blue : (state.green ? { ...state.green, status: "idle" } : null);
  // keep old active as blue (rollback target)
  if (prevActive === "blue" && state.blue) {
    state.blue.status = "idle";
  }

  const record: DeploymentRecord = {
    id: makeid(),
    projectId,
    environment: "production",
    version: state.green.version,
    commitHash: "HEAD",
    timestamp: new Date().toISOString(),
    status: "success",
    strategy: "blue-green",
    durationMs: Date.now() - new Date(state.green.deployedAt).getTime(),
  };
  addRecord(record);

  res.json({ success: true, active: "green", state, record });
});

// POST /api/releases/:projectId/blue-green/rollback — cut traffic back to blue
router.post("/releases/:projectId/blue-green/rollback", (req, res) => {
  const { projectId } = req.params;
  const { reason = "Manual rollback" } = req.body as { reason?: string };
  const state = getBlueGreen(projectId);

  if (!state.blue) {
    res.status(400).json({ error: "No blue slot available for rollback." }); return;
  }

  state.active = "blue";
  state.blue.status = "healthy";
  if (state.green) state.green.status = "idle";

  res.json({ success: true, active: "blue", reason, state });
});

// ── Canary ────────────────────────────────────────────────────────────────────

const CANARY_STEPS = [1, 5, 10, 25, 50, 75, 100];

// GET /api/releases/:projectId/canary/status
router.get("/releases/:projectId/canary/status", (req, res) => {
  res.json(getCanary(req.params.projectId));
});

// POST /api/releases/:projectId/canary/start
router.post("/releases/:projectId/canary/start", (req, res) => {
  const { projectId } = req.params;
  const { canaryVersion = `v${Date.now()}`, stableVersion = "v1.0.0" } = req.body as {
    canaryVersion?: string; stableVersion?: string;
  };
  const state = getCanary(projectId);

  if (state.status === "running") {
    res.status(400).json({ error: "Canary already running. Abort first." }); return;
  }

  state.status = "running";
  state.trafficPercent = CANARY_STEPS[0];
  state.canaryVersion = canaryVersion;
  state.stableVersion = stableVersion;
  state.startedAt = new Date().toISOString();
  state.completedAt = undefined;
  state.abortReason = undefined;
  state.errorRate = 0;
  state.latencyMs = Math.round(80 + Math.random() * 40);

  res.json({ success: true, state });
});

// POST /api/releases/:projectId/canary/progress — advance to next step
router.post("/releases/:projectId/canary/progress", (req, res) => {
  const { projectId } = req.params;
  const state = getCanary(projectId);

  if (state.status !== "running") {
    res.status(400).json({ error: "No active canary." }); return;
  }

  // Simulate metrics drift
  state.errorRate = Math.max(0, Math.min(20, state.errorRate + (Math.random() - 0.3) * 2));
  state.latencyMs = Math.max(50, state.latencyMs + (Math.random() - 0.4) * 20);

  // Auto-abort check
  if (state.errorRate > 5) {
    state.status = "aborted";
    state.abortReason = `Error rate exceeded threshold: ${state.errorRate.toFixed(1)}%`;
    state.completedAt = new Date().toISOString();
    res.json({ aborted: true, reason: state.abortReason, state }); return;
  }

  const currentIdx = CANARY_STEPS.indexOf(state.trafficPercent);
  if (currentIdx === -1 || currentIdx === CANARY_STEPS.length - 1) {
    state.status = "complete";
    state.trafficPercent = 100;
    state.completedAt = new Date().toISOString();
    const record: DeploymentRecord = {
      id: makeid(), projectId,
      environment: "production",
      version: state.canaryVersion,
      commitHash: "HEAD",
      timestamp: new Date().toISOString(),
      status: "success",
      strategy: "canary",
      durationMs: Date.now() - new Date(state.startedAt!).getTime(),
    };
    addRecord(record);
    res.json({ complete: true, state, record }); return;
  }

  state.trafficPercent = CANARY_STEPS[currentIdx + 1];
  res.json({ advanced: true, trafficPercent: state.trafficPercent, state });
});

// POST /api/releases/:projectId/canary/abort
router.post("/releases/:projectId/canary/abort", (req, res) => {
  const { projectId } = req.params;
  const { reason = "Manual abort" } = req.body as { reason?: string };
  const state = getCanary(projectId);
  state.status = "aborted";
  state.trafficPercent = 0;
  state.abortReason = reason;
  state.completedAt = new Date().toISOString();
  res.json({ success: true, state });
});

export { getHistory };
export default router;
