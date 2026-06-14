import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { getAuthUser } from "./auth";

const router = Router();

export interface CloudFunction {
  id: string;
  userId: string;
  name: string;
  description: string;
  runtime: "node" | "python" | "bash";
  trigger: "http" | "schedule" | "event" | "manual";
  schedule?: string;
  eventPattern?: string;
  code: string;
  deployed: boolean;
  createdAt: string;
  updatedAt: string;
  logs: FunctionLog[];
  invocations: number;
  lastRun?: string;
}

interface FunctionLog {
  id: string;
  timestamp: string;
  duration: number;
  status: "ok" | "error";
  output: string;
}

function getFunctionsFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform/functions.json");
}

async function readFunctions(): Promise<CloudFunction[]> {
  try {
    const raw = await fs.readFile(getFunctionsFile(), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeFunctions(fns: CloudFunction[]): Promise<void> {
  const file = getFunctionsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(fns, null, 2));
}

const STARTER_CODE: Record<string, string> = {
  node: `// Cloud Function — Node.js
// Available: fetch, process.env, console.log
async function handler(event) {
  console.log("Event:", JSON.stringify(event));
  return { status: "ok", message: "Hello from Cloud Function!", timestamp: new Date().toISOString() };
}

handler({ source: "manual" }).then(r => console.log(JSON.stringify(r)));`,

  python: `# Cloud Function — Python 3
import json
import datetime

def handler(event):
    print("Event:", json.dumps(event))
    return {
        "status": "ok",
        "message": "Hello from Cloud Function!",
        "timestamp": datetime.datetime.now().isoformat()
    }

result = handler({"source": "manual"})
print(json.dumps(result))`,

  bash: `#!/bin/bash
# Cloud Function — Bash
echo "Event: $1"
echo "Hello from Cloud Function!"
echo "Timestamp: $(date -Iseconds)"`,
};

// GET /functions
router.get("/functions", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const fns = await readFunctions();
  res.json(fns.filter(f => f.userId === userId).map(f => ({ ...f, logs: f.logs.slice(-5) })));
});

// POST /functions — create
router.post("/functions", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { name, description = "", runtime = "node", trigger = "manual", schedule, eventPattern } = req.body as {
    name: string; description?: string; runtime?: "node" | "python" | "bash";
    trigger?: CloudFunction["trigger"]; schedule?: string; eventPattern?: string;
  };
  if (!name) return void res.status(400).json({ error: "name required" });

  const fn: CloudFunction = {
    id: randomUUID(),
    userId,
    name,
    description,
    runtime,
    trigger,
    schedule,
    eventPattern,
    code: STARTER_CODE[runtime] ?? STARTER_CODE.node,
    deployed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [],
    invocations: 0,
  };

  const fns = await readFunctions();
  fns.push(fn);
  await writeFunctions(fns);
  res.status(201).json(fn);
});

// GET /functions/:id
router.get("/functions/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const fns = await readFunctions();
  const fn = fns.find(f => f.id === req.params.id && f.userId === userId);
  if (!fn) return void res.status(404).json({ error: "Function not found" });
  res.json(fn);
});

// PUT /functions/:id — update code/config
router.put("/functions/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const fns = await readFunctions();
  const fn = fns.find(f => f.id === req.params.id && f.userId === userId);
  if (!fn) return void res.status(404).json({ error: "Function not found" });

  const { name, description, runtime, trigger, schedule, eventPattern, code } = req.body;
  if (name !== undefined) fn.name = name;
  if (description !== undefined) fn.description = description;
  if (runtime !== undefined) fn.runtime = runtime;
  if (trigger !== undefined) fn.trigger = trigger;
  if (schedule !== undefined) fn.schedule = schedule;
  if (eventPattern !== undefined) fn.eventPattern = eventPattern;
  if (code !== undefined) { fn.code = code; fn.deployed = false; }
  fn.updatedAt = new Date().toISOString();
  await writeFunctions(fns);
  res.json(fn);
});

// DELETE /functions/:id
router.delete("/functions/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  let fns = await readFunctions();
  fns = fns.filter(f => !(f.id === req.params.id && f.userId === userId));
  await writeFunctions(fns);
  res.json({ ok: true });
});

// POST /functions/:id/deploy
router.post("/functions/:id/deploy", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const fns = await readFunctions();
  const fn = fns.find(f => f.id === req.params.id && f.userId === userId);
  if (!fn) return void res.status(404).json({ error: "Function not found" });
  fn.deployed = true;
  fn.updatedAt = new Date().toISOString();
  await writeFunctions(fns);
  res.json({ ok: true, deployed: true });
});

// POST /functions/:id/run — SSE streaming run
router.post("/functions/:id/run", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const fns = await readFunctions();
  const fn = fns.find(f => f.id === req.params.id && f.userId === userId);
  if (!fn) return void res.status(404).json({ error: "Function not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const event = req.body.event ?? { source: "manual" };
  const tmpDir = path.resolve(process.cwd(), "../../ide-workspace/.platform/tmp");
  await fs.mkdir(tmpDir, { recursive: true });

  const ext = { node: "js", python: "py", bash: "sh" }[fn.runtime];
  const tmpFile = path.join(tmpDir, `fn-${fn.id}.${ext}`);
  await fs.writeFile(tmpFile, fn.code, "utf-8");

  const cmd = { node: "node", python: "python3", bash: "bash" }[fn.runtime];
  const startTime = Date.now();
  send({ type: "start", function: fn.name, event });

  let output = "";
  await new Promise<void>(resolve => {
    const proc = spawn(cmd, [tmpFile], {
      env: { ...process.env, FUNCTION_EVENT: JSON.stringify(event) },
    });
    proc.stdout.on("data", (d: Buffer) => {
      const text = d.toString();
      output += text;
      send({ type: "stdout", content: text });
    });
    proc.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      output += text;
      send({ type: "stderr", content: text });
    });
    proc.on("close", (code) => {
      const duration = Date.now() - startTime;
      send({ type: "done", exitCode: code, duration });
      fn.invocations++;
      fn.lastRun = new Date().toISOString();
      fn.logs.push({ id: randomUUID(), timestamp: new Date().toISOString(), duration, status: code === 0 ? "ok" : "error", output: output.slice(0, 1000) });
      if (fn.logs.length > 50) fn.logs = fn.logs.slice(-50);
      writeFunctions(fns).catch(() => {});
      resolve();
    });
    setTimeout(() => { proc.kill(); send({ type: "timeout" }); resolve(); }, 30000);
  });

  try { await fs.unlink(tmpFile); } catch {}
  res.end();
});

// GET /functions/:id/logs
router.get("/functions/:id/logs", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const fns = await readFunctions();
  const fn = fns.find(f => f.id === req.params.id && f.userId === userId);
  if (!fn) return void res.status(404).json({ error: "Function not found" });
  const limit = parseInt(String(req.query.limit ?? "20"));
  res.json({ logs: fn.logs.slice(-limit).reverse(), total: fn.logs.length });
});

export default router;
