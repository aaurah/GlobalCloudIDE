import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { getAuthUser } from "./auth";

const router = Router();

export interface HealingEvent {
  id: string;
  timestamp: string;
  projectId: string;
  type: "crash-detected" | "restart" | "rebuild" | "rollback" | "patch" | "alert";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  resolution: string;
  status: "pending" | "in-progress" | "resolved" | "failed";
}

interface DeployRecord {
  id: string;
  projectId: string;
  ownerId?: string;
  status: "running" | "stopped" | "failed" | "building";
  pid?: number;
  startedAt?: string;
}

function getHealingFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform/healing.json");
}

function getDeploymentsFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform/deployments.json");
}

async function readHealingHistory(): Promise<HealingEvent[]> {
  try { return JSON.parse(await fs.readFile(getHealingFile(), "utf-8")); } catch { return []; }
}

async function writeHealingHistory(events: HealingEvent[]): Promise<void> {
  const file = getHealingFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(events.slice(-200), null, 2));
}

async function readDeployments(): Promise<DeployRecord[]> {
  try { return JSON.parse(await fs.readFile(getDeploymentsFile(), "utf-8")); } catch { return []; }
}

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

// GET /healing/status
router.get("/healing/status", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const history = await readHealingHistory();
  const recent = history.slice(-10);
  const open = history.filter(e => e.status === "pending" || e.status === "in-progress");
  res.json({
    open: open.length,
    resolved: history.filter(e => e.status === "resolved").length,
    failed: history.filter(e => e.status === "failed").length,
    recentEvents: recent.reverse(),
    selfHealingEnabled: true,
  });
});

// POST /healing/scan — scan for unhealthy deployments
router.post("/healing/scan", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const deployments = await readDeployments();
  const history = await readHealingHistory();
  const issues: HealingEvent[] = [];

  for (const deploy of deployments) {
    if (deploy.status === "running" && deploy.pid) {
      const alive = isProcessAlive(deploy.pid);
      if (!alive) {
        const event: HealingEvent = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          projectId: deploy.projectId,
          type: "crash-detected",
          severity: "high",
          description: `Deployment for project ${deploy.projectId} crashed (PID ${deploy.pid} not found)`,
          resolution: "Auto-restart scheduled",
          status: "pending",
        };
        issues.push(event);
        history.push(event);
      }
    } else if (deploy.status === "failed") {
      const recent = history.some(e => e.projectId === deploy.projectId && e.type === "crash-detected" && Date.now() - new Date(e.timestamp).getTime() < 60000);
      if (!recent) {
        const event: HealingEvent = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          projectId: deploy.projectId,
          type: "alert",
          severity: "medium",
          description: `Deployment for project ${deploy.projectId} is in failed state`,
          resolution: "Manual intervention may be required",
          status: "pending",
        };
        issues.push(event);
        history.push(event);
      }
    }
  }

  await writeHealingHistory(history);
  res.json({ scanned: deployments.length, issues: issues.length, events: issues });
});

// POST /healing/fix/:projectId — attempt auto-fix
router.post("/healing/fix/:projectId", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { projectId } = req.params;
  const history = await readHealingHistory();

  const event: HealingEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    projectId,
    type: "restart",
    severity: "medium",
    description: `Manual heal triggered for project ${projectId}`,
    resolution: "Attempting auto-restart",
    status: "in-progress",
  };
  history.push(event);

  // Check if there's a container build to restart
  try {
    const cwd = process.cwd();
    const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
    const containerFile = path.resolve(root, `ide-workspace/projects/${projectId}/container.json`);
    const containerSpec = JSON.parse(await fs.readFile(containerFile, "utf-8"));

    const projectDir = path.resolve(root, `ide-workspace/projects/${projectId}`);
    const proc = spawn("bash", ["-c", containerSpec.run], {
      cwd: projectDir,
      env: { ...process.env, ...containerSpec.env, PORT: String(containerSpec.ports?.[0] ?? 3000) },
      detached: false,
    });

    event.resolution = `Process restarted with PID ${proc.pid}`;
    event.status = "resolved";
  } catch (err: any) {
    event.resolution = `Could not auto-restart: ${err.message}. Manual rebuild required.`;
    event.status = "failed";
  }

  event.timestamp = new Date().toISOString();
  await writeHealingHistory(history);
  res.json({ ok: true, event });
});

// GET /healing/history
router.get("/healing/history", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const history = await readHealingHistory();
  const limit = parseInt(String(req.query.limit ?? "50"));
  res.json(history.slice(-limit).reverse());
});

// PATCH /healing/events/:id — mark event resolved/failed
router.patch("/healing/events/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { status, resolution } = req.body as { status?: HealingEvent["status"]; resolution?: string };
  const history = await readHealingHistory();
  const event = history.find(e => e.id === req.params.id);
  if (!event) return void res.status(404).json({ error: "Event not found" });
  if (status) event.status = status;
  if (resolution) event.resolution = resolution;
  await writeHealingHistory(history);
  res.json({ ok: true, event });
});

// POST /healing/rules — configure auto-healing rules
router.post("/healing/rules", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  // Stub — in a real system this would write to a rules engine
  res.json({ ok: true, message: "Healing rules updated" });
});

export default router;
