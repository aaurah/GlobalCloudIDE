import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";
import { getProjectDir } from "./projects";
import { billingDeduct } from "./billing";

const router = Router();

export interface ContainerSpec {
  base: "node:20" | "python:3.11" | "ubuntu:22.04" | string;
  build: string[];
  run: string;
  env: Record<string, string>;
  ports: number[];
  resources: {
    cpuLimit: number;
    memoryMb: number;
    timeoutSecs: number;
  };
}

const DEFAULT_SPEC: ContainerSpec = {
  base: "node:20",
  build: ["npm install"],
  run: "node index.js",
  env: {},
  ports: [3000],
  resources: { cpuLimit: 1, memoryMb: 512, timeoutSecs: 300 },
};

async function getContainerSpecFile(projectId: string): Promise<string> {
  return path.join(getProjectDir(projectId), "container.json");
}

async function readContainerSpec(projectId: string): Promise<ContainerSpec> {
  try {
    const raw = await fs.readFile(await getContainerSpecFile(projectId), "utf-8");
    return { ...DEFAULT_SPEC, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SPEC };
  }
}

async function writeContainerSpec(projectId: string, spec: ContainerSpec): Promise<void> {
  const dir = getProjectDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "container.json"), JSON.stringify(spec, null, 2), "utf-8");
}

// Track running container processes
const runningContainers = new Map<string, { pid: number; startedAt: string; port: number | null }>();

// GET /containers/:projectId
router.get("/containers/:projectId", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { projectId } = req.params;
  const spec = await readContainerSpec(projectId);
  const running = runningContainers.get(projectId);

  res.json({
    spec,
    status: running ? "running" : "stopped",
    pid: running?.pid ?? null,
    startedAt: running?.startedAt ?? null,
    port: running?.port ?? null,
  });
});

// PUT /containers/:projectId
router.put("/containers/:projectId", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { projectId } = req.params;
  const update = req.body as Partial<ContainerSpec>;
  const existing = await readContainerSpec(projectId);
  const merged: ContainerSpec = {
    ...existing,
    ...update,
    resources: { ...existing.resources, ...(update.resources ?? {}) },
    env: { ...existing.env, ...(update.env ?? {}) },
  };
  await writeContainerSpec(projectId, merged);
  res.json({ ok: true, spec: merged });
});

// POST /containers/:projectId/build  — SSE streaming build
router.post("/containers/:projectId/build", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { projectId } = req.params;
  const spec = await readContainerSpec(projectId);
  const projectDir = getProjectDir(projectId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ log: `[container] Starting build for project ${projectId}` });
  send({ log: `[container] Base: ${spec.base}` });
  send({ log: `[container] Env vars: ${Object.keys(spec.env).length} set` });

  try {
    // Deduct build credit
    await billingDeduct(userId, 2, "build", `Container build: project ${projectId}`);

    // Run build commands sequentially
    for (const cmd of spec.build) {
      send({ log: `[container] $ ${cmd}` });
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("bash", ["-c", cmd], {
          cwd: projectDir,
          env: { ...process.env, ...spec.env },
        });
        proc.stdout.on("data", (d: Buffer) => send({ log: d.toString().trimEnd() }));
        proc.stderr.on("data", (d: Buffer) => send({ log: `[stderr] ${d.toString().trimEnd()}` }));
        proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
        setTimeout(() => { proc.kill(); reject(new Error("Build timeout")); }, spec.resources.timeoutSecs * 1000);
      });
    }

    // Kill any existing container
    const existing = runningContainers.get(projectId);
    if (existing) {
      try { process.kill(existing.pid, "SIGTERM"); } catch {}
      runningContainers.delete(projectId);
    }

    // Assign port
    const port = spec.ports[0] ?? 3000;
    send({ log: `[container] Starting runtime: ${spec.run}` });
    send({ log: `[container] Port: ${port}` });

    const proc = spawn("bash", ["-c", spec.run], {
      cwd: projectDir,
      env: { ...process.env, ...spec.env, PORT: String(port) },
      detached: false,
    });

    proc.stdout.on("data", (d: Buffer) => send({ log: d.toString().trimEnd() }));
    proc.stderr.on("data", (d: Buffer) => send({ log: `[stderr] ${d.toString().trimEnd()}` }));

    runningContainers.set(projectId, { pid: proc.pid!, startedAt: new Date().toISOString(), port });

    proc.on("close", (code) => {
      runningContainers.delete(projectId);
      send({ log: `[container] Process exited with code ${code}` });
    });

    send({ status: "running", port });
    res.end();
  } catch (err: any) {
    send({ log: `[error] ${err.message}` });
    send({ status: "error" });
    res.end();
  }
});

// POST /containers/:projectId/stop
router.post("/containers/:projectId/stop", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { projectId } = req.params;
  const running = runningContainers.get(projectId);
  if (!running) return void res.json({ ok: true, message: "Not running" });

  try { process.kill(running.pid, "SIGTERM"); } catch {}
  runningContainers.delete(projectId);
  res.json({ ok: true });
});

// DELETE /containers/:projectId
router.delete("/containers/:projectId", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { projectId } = req.params;
  const existing = runningContainers.get(projectId);
  if (existing) {
    try { process.kill(existing.pid, "SIGTERM"); } catch {}
    runningContainers.delete(projectId);
  }
  try { await fs.unlink(await getContainerSpecFile(projectId)); } catch {}
  res.json({ ok: true });
});

export default router;
