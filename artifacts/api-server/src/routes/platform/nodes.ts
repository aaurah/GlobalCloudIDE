import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

export interface PlatformNode {
  id: string;
  name: string;
  url: string | null;
  status: "online" | "offline" | "overloaded";
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
  deployments: string[];
  registeredAt: string;
  lastHeartbeat: string;
  region: string;
  tags: string[];
}

function getNodesFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform/nodes.json");
}

async function readNodes(): Promise<PlatformNode[]> {
  try {
    const raw = await fs.readFile(getNodesFile(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeNodes(nodes: PlatformNode[]): Promise<void> {
  const file = getNodesFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(nodes, null, 2));
}

// Ensure local node always exists
async function ensureLocalNode(): Promise<PlatformNode[]> {
  let nodes = await readNodes();
  const localExists = nodes.find(n => n.id === "local-0");
  if (!localExists) {
    const local: PlatformNode = {
      id: "local-0",
      name: "local-primary",
      url: null,
      status: "online",
      cpuPercent: 0,
      memoryMb: 0,
      memoryLimitMb: 2048,
      deployments: [],
      registeredAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      region: "local",
      tags: ["primary", "local"],
    };
    nodes = [local, ...nodes];
    await writeNodes(nodes);
  }
  return nodes;
}

function pickNode(nodes: PlatformNode[]): PlatformNode | null {
  const available = nodes.filter(n => n.status === "online");
  if (!available.length) return null;
  // Least-loaded by deployment count
  return available.reduce((a, b) => a.deployments.length <= b.deployments.length ? a : b);
}

// Simulate CPU/memory refresh
function refreshMetrics(nodes: PlatformNode[]): PlatformNode[] {
  return nodes.map(n => ({
    ...n,
    cpuPercent: n.status === "online" ? Math.min(95, n.deployments.length * 15 + Math.random() * 10) : 0,
    memoryMb: n.status === "online" ? n.deployments.length * 128 + Math.floor(Math.random() * 50) : 0,
    lastHeartbeat: n.status === "online" ? new Date().toISOString() : n.lastHeartbeat,
  }));
}

// GET /nodes
router.get("/nodes", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const nodes = refreshMetrics(await ensureLocalNode());
  await writeNodes(nodes);
  res.json(nodes);
});

// POST /nodes/register
router.post("/nodes/register", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { name, url, region = "us-east", memoryLimitMb = 1024, tags = [] } = req.body as {
    name: string; url?: string; region?: string; memoryLimitMb?: number; tags?: string[];
  };

  if (!name) return void res.status(400).json({ error: "name required" });

  const nodes = await ensureLocalNode();
  const node: PlatformNode = {
    id: randomUUID(),
    name,
    url: url ?? null,
    status: "online",
    cpuPercent: 0,
    memoryMb: 0,
    memoryLimitMb,
    deployments: [],
    registeredAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    region,
    tags,
  };
  nodes.push(node);
  await writeNodes(nodes);
  res.status(201).json(node);
});

// GET /nodes/:id/status
router.get("/nodes/:id/status", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const nodes = refreshMetrics(await ensureLocalNode());
  const node = nodes.find(n => n.id === req.params.id);
  if (!node) return void res.status(404).json({ error: "Node not found" });
  res.json(node);
});

// POST /nodes/assign — assign a deployment to best available node
router.post("/nodes/assign", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { projectId, nodeId } = req.body as { projectId: string; nodeId?: string };
  if (!projectId) return void res.status(400).json({ error: "projectId required" });

  const nodes = await ensureLocalNode();
  let target: PlatformNode | null = null;

  if (nodeId) {
    target = nodes.find(n => n.id === nodeId) ?? null;
    if (!target) return void res.status(404).json({ error: "Node not found" });
  } else {
    target = pickNode(nodes);
    if (!target) return void res.status(503).json({ error: "No nodes available" });
  }

  // Remove projectId from any other node
  for (const n of nodes) {
    n.deployments = n.deployments.filter(d => d !== projectId);
  }

  if (!target.deployments.includes(projectId)) {
    target.deployments.push(projectId);
  }

  await writeNodes(nodes);
  res.json({ nodeId: target.id, nodeName: target.name, projectId });
});

// DELETE /nodes/:id — deregister node
router.delete("/nodes/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  if (req.params.id === "local-0") return void res.status(400).json({ error: "Cannot remove primary node" });

  let nodes = await ensureLocalNode();
  nodes = nodes.filter(n => n.id !== req.params.id);
  await writeNodes(nodes);
  res.json({ ok: true });
});

// POST /nodes/:id/heartbeat — worker nodes ping this
router.post("/nodes/:id/heartbeat", async (req, res) => {
  const { cpuPercent, memoryMb } = req.body as { cpuPercent?: number; memoryMb?: number };
  const nodes = await ensureLocalNode();
  const node = nodes.find(n => n.id === req.params.id);
  if (!node) return void res.status(404).json({ error: "Node not found" });

  node.lastHeartbeat = new Date().toISOString();
  node.status = "online";
  if (cpuPercent !== undefined) node.cpuPercent = cpuPercent;
  if (memoryMb !== undefined) node.memoryMb = memoryMb;
  if (node.cpuPercent > 90) node.status = "overloaded";

  await writeNodes(nodes);
  res.json({ ok: true });
});

export default router;
