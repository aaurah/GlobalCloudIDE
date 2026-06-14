import { Router, type Request, type Response } from "express";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs/promises";
import path from "path";
import http from "http";
import { getProjectDir } from "./projects";

const router = Router();

// ── In-memory deployment state ────────────────────────────────────────────────

export interface DeploymentState {
  projectId: string;
  status: "idle" | "building" | "running" | "stopped" | "failed";
  process?: ChildProcess;
  port?: number;
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  buildLogs: string[];
  runtimeLogs: string[];
  url?: string;
}

const deployments = new Map<string, DeploymentState>();

function getDeployment(projectId: string): DeploymentState {
  if (!deployments.has(projectId)) {
    deployments.set(projectId, {
      projectId,
      status: "idle",
      buildLogs: [],
      runtimeLogs: [],
    });
  }
  return deployments.get(projectId)!;
}

function addLog(state: DeploymentState, type: "build" | "runtime", message: string) {
  const entry = `[${new Date().toISOString()}] ${message}`;
  if (type === "build") {
    state.buildLogs.push(entry);
    if (state.buildLogs.length > 500) state.buildLogs.shift();
  } else {
    state.runtimeLogs.push(entry);
    if (state.runtimeLogs.length > 500) state.runtimeLogs.shift();
  }
}

async function findFreePort(): Promise<number> {
  // Find a port in range 9000-9999
  const base = 9000 + Math.floor(Math.random() * 1000);
  return base;
}

async function runBuildCommand(
  command: string,
  cwd: string,
  onLog: (msg: string) => void
): Promise<boolean> {
  if (!command.trim()) return true;

  return new Promise(resolve => {
    const [cmd, ...args] = command.split(" ");
    const child = spawn(cmd, args, { cwd, shell: true, timeout: 60_000 });
    child.stdout.on("data", (d: Buffer) => onLog(d.toString()));
    child.stderr.on("data", (d: Buffer) => onLog("[stderr] " + d.toString()));
    child.on("close", code => resolve(code === 0));
    child.on("error", err => { onLog(`[error] ${err.message}`); resolve(false); });
  });
}

// POST /api/deploy/:projectId/start — SSE streaming
router.post("/deploy/:projectId/start", async (req, res) => {
  const { projectId } = req.params;
  const {
    type = "node",
    buildCommand = "",
    startCommand,
    entryPoint = "index.js",
  } = req.body as {
    type?: string;
    buildCommand?: string;
    startCommand?: string;
    entryPoint?: string;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const state = getDeployment(projectId);

  // Stop existing process if running
  if (state.process && state.status === "running") {
    try { state.process.kill("SIGTERM"); } catch {}
    state.process = undefined;
  }

  state.status = "building";
  state.buildLogs = [];
  state.startedAt = new Date().toISOString();
  state.stoppedAt = undefined;

  const projectDir = getProjectDir(projectId);

  try {
    await fs.access(projectDir);
  } catch {
    send({ type: "error", message: "Project directory not found" });
    send({ type: "done", status: "failed" });
    res.end();
    state.status = "failed";
    return;
  }

  send({ type: "log", level: "info", message: `Starting deployment for project ${projectId}...` });
  addLog(state, "build", `Starting deployment (type: ${type})`);

  // Build step
  if (buildCommand?.trim()) {
    send({ type: "log", level: "info", message: `Running build: ${buildCommand}` });
    addLog(state, "build", `Build command: ${buildCommand}`);

    const buildOk = await runBuildCommand(buildCommand, projectDir, (msg) => {
      addLog(state, "build", msg.trim());
      send({ type: "log", level: "build", message: msg.trim() });
    });

    if (!buildOk) {
      state.status = "failed";
      send({ type: "log", level: "error", message: "Build failed!" });
      send({ type: "done", status: "failed" });
      res.end();
      return;
    }
    send({ type: "log", level: "info", message: "Build succeeded." });
  }

  // Static sites — serve via the proxy static handler, no process needed
  if (type === "static") {
    state.status = "running";
    state.url = `/deploy/${projectId}/app`;
    send({ type: "log", level: "info", message: "Static site ready." });
    send({ type: "done", status: "running", url: state.url });
    res.end();
    return;
  }

  // Dynamic process start
  const port = await findFreePort();
  state.port = port;

  const resolvedStart = startCommand?.trim() ?? (
    type === "python" ? `python3 ${entryPoint}` : `node ${entryPoint}`
  );

  send({ type: "log", level: "info", message: `Starting: ${resolvedStart} on port ${port}` });
  addLog(state, "build", `Start command: ${resolvedStart}`);

  const [cmd, ...args] = resolvedStart.split(" ");
  const child = spawn(cmd, args, {
    cwd: projectDir,
    shell: true,
    env: { ...process.env, PORT: String(port) },
  });

  state.process = child;
  state.pid = child.pid;
  state.status = "running";
  state.url = `/deploy/${projectId}/app`;

  child.stdout.on("data", (d: Buffer) => {
    const msg = d.toString().trim();
    addLog(state, "runtime", msg);
  });

  child.stderr.on("data", (d: Buffer) => {
    const msg = d.toString().trim();
    addLog(state, "runtime", "[stderr] " + msg);
  });

  child.on("close", (code) => {
    addLog(state, "runtime", `Process exited with code ${code}`);
    state.status = code === 0 ? "stopped" : "failed";
    state.stoppedAt = new Date().toISOString();
    state.process = undefined;
  });

  child.on("error", (err) => {
    addLog(state, "runtime", `Process error: ${err.message}`);
    state.status = "failed";
    state.process = undefined;
  });

  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 1500));

  send({ type: "log", level: "info", message: `App running! PID: ${child.pid}` });
  send({ type: "done", status: "running", url: state.url, pid: child.pid, port });
  res.end();

  req.on("close", () => { /* SSE client disconnected — keep process running */ });
});

// POST /api/deploy/:projectId/stop
router.post("/deploy/:projectId/stop", (req, res) => {
  const { projectId } = req.params;
  const state = getDeployment(projectId);

  if (state.process) {
    try { state.process.kill("SIGTERM"); } catch {}
    state.process = undefined;
  }
  state.status = "stopped";
  state.stoppedAt = new Date().toISOString();

  res.json({ success: true, status: "stopped" });
});

// GET /api/deploy/:projectId/status
router.get("/deploy/:projectId/status", (req, res) => {
  const { projectId } = req.params;
  const state = getDeployment(projectId);

  res.json({
    projectId: state.projectId,
    status: state.status,
    url: state.url,
    pid: state.pid,
    port: state.port,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt,
  });
});

// GET /api/deploy/:projectId/logs
router.get("/deploy/:projectId/logs", (req, res) => {
  const { projectId } = req.params;
  const state = getDeployment(projectId);
  const type = (req.query.type as string) ?? "all";

  if (type === "build") {
    res.json({ projectId, type: "build", logs: state.buildLogs });
  } else if (type === "runtime") {
    res.json({ projectId, type: "runtime", logs: state.runtimeLogs });
  } else {
    res.json({
      projectId,
      type: "all",
      logs: [
        ...state.buildLogs.map(l => ({ source: "build", message: l })),
        ...state.runtimeLogs.map(l => ({ source: "runtime", message: l })),
      ],
    });
  }
});

// ALL /api/deploy/:projectId/app/* — Reverse proxy to running process
router.all("/deploy/:projectId/app", proxyHandler);
router.all("/deploy/:projectId/app/*splat", proxyHandler);

function proxyHandler(req: Request, res: Response) {
  const projectId = req.params["projectId"] as string;
  const state = deployments.get(projectId);

  // Static site — serve files directly
  if (state?.status === "running" && !state.port) {
    serveStaticFile(projectId, req, res);
    return;
  }

  if (!state || state.status !== "running" || !state.port) {
    res.status(503).send(`
      <html><body style="font-family:system-ui;padding:40px;text-align:center">
        <h2>App not running</h2>
        <p>Status: <strong>${state?.status ?? "idle"}</strong></p>
        <p>Deploy your project from the CloudIDE to see it here.</p>
      </body></html>
    `);
    return;
  }

  // Build the upstream path
  const rawPath = req.url.replace(`/api/deploy/${projectId}/app`, "") || "/";
  const options = {
    hostname: "127.0.0.1",
    port: state.port,
    path: rawPath || "/",
    method: req.method,
    headers: { ...req.headers, host: `localhost:${state.port}` },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("error", () => {
    res.status(502).send(`
      <html><body style="font-family:system-ui;padding:40px;text-align:center">
        <h2>502 Bad Gateway</h2>
        <p>The app process is not responding yet. Try refreshing in a moment.</p>
      </body></html>
    `);
  });

  if (req.body && req.method !== "GET" && req.method !== "HEAD") {
    proxy.write(JSON.stringify(req.body));
  }
  proxy.end();
}

async function serveStaticFile(projectId: string, req: Request, res: Response) {
  const projectDir = getProjectDir(projectId);
  const rawPath = req.url.replace(`/api/deploy/${projectId}/app`, "") || "/index.html";
  const filePath = path.join(projectDir, rawPath === "/" ? "index.html" : rawPath);

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
    };
    res.setHeader("Content-Type", mimeMap[ext] ?? "text/plain");
    res.send(content);
  } catch {
    res.status(404).send("Not found");
  }
}

export { deployments };
export default router;
