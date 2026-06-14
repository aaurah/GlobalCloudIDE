import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import { getAuthUser } from "./auth";

const router = Router();

export interface OrchestrationEvent {
  id: string;
  timestamp: string;
  type: "analyze" | "scale" | "migrate" | "restart" | "alert";
  summary: string;
  actions: OrchestratorAction[];
  status: "pending" | "running" | "done" | "failed";
}

export interface OrchestratorAction {
  id: string;
  type: "scale-up" | "scale-down" | "migrate-workload" | "restart-node" | "create-node" | "alert" | "noop";
  target: string;
  reason: string;
  executed: boolean;
  result?: string;
}

function getOrchestratorFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform/orchestrator.json");
}

async function readHistory(): Promise<OrchestrationEvent[]> {
  try {
    const raw = await fs.readFile(getOrchestratorFile(), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeHistory(events: OrchestrationEvent[]): Promise<void> {
  const file = getOrchestratorFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(events.slice(-100), null, 2));
}

async function readNodes(): Promise<any[]> {
  try {
    const cwd = process.cwd();
    const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
    const raw = await fs.readFile(path.resolve(root, "ide-workspace/.platform/nodes.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

// GET /orchestrator/history
router.get("/orchestrator/history", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const history = await readHistory();
  res.json(history.slice(-50).reverse());
});

// POST /orchestrator/analyze — SSE: AI reads system state and plans actions
router.post("/orchestrator/analyze", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { send({ type: "error", content: "OPENAI_API_KEY not set" }); return void res.end(); }

  const nodes = await readNodes();
  const history = await readHistory();

  const systemSnapshot = {
    nodes: nodes.map(n => ({
      id: n.id, name: n.name, region: n.region, status: n.status,
      cpuPercent: n.cpuPercent, memoryMb: n.memoryMb, memoryLimitMb: n.memoryLimitMb,
      deployments: n.deployments.length,
    })),
    recentEvents: history.slice(-5).map(e => ({ type: e.type, summary: e.summary, status: e.status })),
    timestamp: new Date().toISOString(),
  };

  send({ type: "status", content: "Analyzing system state..." });
  send({ type: "snapshot", data: systemSnapshot });

  try {
    const client = new OpenAI({ apiKey });
    const eventId = randomUUID();
    const actions: OrchestratorAction[] = [];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: `You are an AI Cloud Orchestrator. Analyze the system state and return a JSON analysis with:
1. A brief summary (1-2 sentences)
2. An array of actions to take

Each action has: { type: "scale-up"|"scale-down"|"migrate-workload"|"restart-node"|"alert"|"noop", target: string, reason: string }

Return ONLY valid JSON: { "summary": "...", "actions": [...] }

Rules:
- If any node CPU > 80%: recommend scale-up or migrate workload
- If any node is offline: recommend restart-node
- If all nodes are idle (<10% CPU): recommend scale-down
- If system is healthy: return noop
- Be specific about which node/deployment to target`,
        },
        {
          role: "user",
          content: `Current system state:\n${JSON.stringify(systemSnapshot, null, 2)}`,
        },
      ],
    });

    let buffer = "";
    send({ type: "thinking", content: "AI orchestrator analyzing..." });

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      buffer += delta;
      if (delta) send({ type: "stream", content: delta });
    }

    send({ type: "thinking", content: "Planning actions..." });

    let parsed: { summary: string; actions: Array<{ type: string; target: string; reason: string }> };
    try {
      const jsonMatch = buffer.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: buffer, actions: [] };
    } catch {
      parsed = { summary: buffer, actions: [{ type: "noop", target: "system", reason: "Analysis complete" }] };
    }

    for (const a of parsed.actions) {
      actions.push({
        id: randomUUID(),
        type: a.type as OrchestratorAction["type"],
        target: a.target,
        reason: a.reason,
        executed: false,
      });
    }

    const event: OrchestrationEvent = {
      id: eventId,
      timestamp: new Date().toISOString(),
      type: "analyze",
      summary: parsed.summary,
      actions,
      status: "done",
    };

    const history2 = await readHistory();
    history2.push(event);
    await writeHistory(history2);

    send({ type: "done", event });
  } catch (err: any) {
    send({ type: "error", content: err.message });
  }
  res.end();
});

// POST /orchestrator/execute — execute a specific action
router.post("/orchestrator/execute", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { eventId, actionId } = req.body as { eventId: string; actionId: string };
  const history = await readHistory();
  const event = history.find(e => e.id === eventId);
  if (!event) return void res.status(404).json({ error: "Event not found" });
  const action = event.actions.find(a => a.id === actionId);
  if (!action) return void res.status(404).json({ error: "Action not found" });

  // Simulate execution
  action.executed = true;
  action.result = `Executed ${action.type} on ${action.target} at ${new Date().toISOString()}`;

  const history2 = await readHistory();
  const ev2 = history2.find(e => e.id === eventId);
  if (ev2) {
    const a2 = ev2.actions.find(a => a.id === actionId);
    if (a2) { a2.executed = true; a2.result = action.result; }
  }
  await writeHistory(history2);
  res.json({ ok: true, action });
});

// GET /orchestrator/status — quick system health summary
router.get("/orchestrator/status", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const nodes = await readNodes();
  const unhealthy = nodes.filter(n => n.status !== "online" || n.cpuPercent > 80);
  const totalDeployments = nodes.reduce((s: number, n: any) => s + (n.deployments?.length ?? 0), 0);

  res.json({
    healthy: unhealthy.length === 0,
    nodeCount: nodes.length,
    onlineNodes: nodes.filter((n: any) => n.status === "online").length,
    unhealthyNodes: unhealthy.length,
    totalDeployments,
    avgCpu: nodes.length ? Math.round(nodes.reduce((s: number, n: any) => s + n.cpuPercent, 0) / nodes.length) : 0,
    timestamp: new Date().toISOString(),
  });
});

export default router;
