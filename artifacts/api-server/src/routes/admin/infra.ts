import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { requireAdmin, logAudit } from "./index";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminNode {
  id: string;
  name: string;
  region: string;
  status: "online" | "offline" | "draining" | "overloaded";
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  deploymentCount: number;
  tags: string[];
  registeredAt: string;
}

interface Region {
  id: string;
  name: string;
  enabled: boolean;
  nodeCount: number;
  primaryRegion: boolean;
  disabledAt?: string;
  disabledReason?: string;
}

interface Plugin {
  id: string;
  name: string;
  version: string;
  author: string;
  status: "pending" | "approved" | "rejected";
  installedBy?: string;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  ownerId: string;
  status: "active" | "disabled";
  disabledAt?: string;
  disabledReason?: string;
  createdAt: string;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

function getPlatformDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readNodes(): Promise<AdminNode[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "nodes.json"), "utf-8");
    const nodes = JSON.parse(raw);
    return nodes.map((n: any) => ({
      id: n.id,
      name: n.name,
      region: n.region ?? "us-east-1",
      status: n.status === "overloaded" ? "overloaded" : n.status === "online" ? "online" : "offline",
      cpuPercent: n.cpuPercent ?? Math.round(Math.random() * 80),
      memoryUsedMb: n.memoryMb ?? Math.round(Math.random() * 4096),
      memoryTotalMb: n.memoryLimitMb ?? 8192,
      deploymentCount: n.deployments?.length ?? 0,
      tags: n.tags ?? [],
      registeredAt: n.registeredAt ?? new Date().toISOString(),
    }));
  } catch {
    // Return synthetic nodes for demo
    return [
      { id: "node-1", name: "us-east-1a", region: "us-east-1", status: "online", cpuPercent: 42, memoryUsedMb: 3200, memoryTotalMb: 8192, deploymentCount: 5, tags: ["prod"], registeredAt: new Date(Date.now() - 86400000 * 30).toISOString() },
      { id: "node-2", name: "us-east-1b", region: "us-east-1", status: "online", cpuPercent: 68, memoryUsedMb: 5800, memoryTotalMb: 8192, deploymentCount: 8, tags: ["prod"], registeredAt: new Date(Date.now() - 86400000 * 20).toISOString() },
      { id: "node-3", name: "eu-west-1a", region: "eu-west-1", status: "online", cpuPercent: 23, memoryUsedMb: 1024, memoryTotalMb: 4096, deploymentCount: 2, tags: ["staging"], registeredAt: new Date(Date.now() - 86400000 * 10).toISOString() },
      { id: "node-4", name: "ap-south-1a", region: "ap-south-1", status: "offline", cpuPercent: 0, memoryUsedMb: 0, memoryTotalMb: 4096, deploymentCount: 0, tags: [], registeredAt: new Date(Date.now() - 86400000 * 5).toISOString() },
    ];
  }
}

const drainingNodes = new Set<string>();
const disabledRegions = new Map<string, { reason: string; at: string }>();

const DEFAULT_REGIONS: Region[] = [
  { id: "us-east-1", name: "US East (N. Virginia)", enabled: true, nodeCount: 2, primaryRegion: true },
  { id: "eu-west-1", name: "EU West (Ireland)", enabled: true, nodeCount: 1, primaryRegion: false },
  { id: "ap-south-1", name: "Asia Pacific (Mumbai)", enabled: true, nodeCount: 1, primaryRegion: false },
  { id: "us-west-2", name: "US West (Oregon)", enabled: true, nodeCount: 0, primaryRegion: false },
];

async function readPlugins(): Promise<Plugin[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "plugins.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [
      { id: "plugin-1", name: "GitHub Integration", version: "1.2.0", author: "system", status: "approved", createdAt: new Date(Date.now() - 86400000 * 14).toISOString() },
      { id: "plugin-2", name: "Slack Notifier", version: "0.8.1", author: "community", status: "pending", createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
      { id: "plugin-3", name: "Docker Registry", version: "2.0.0", author: "system", status: "approved", createdAt: new Date(Date.now() - 86400000 * 30).toISOString() },
    ];
  }
}

async function readAgents(): Promise<Agent[]> {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "agents.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [
      { id: "agent-1", name: "DevOps Agent", type: "devops", ownerId: "system", status: "active", createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: "agent-2", name: "Code Review Agent", type: "review", ownerId: "system", status: "active", createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
    ];
  }
}

// In-memory plugin approvals
const pluginApprovals = new Map<string, "approved" | "rejected">();
const disabledAgents = new Set<string>();

// ── Node Routes ───────────────────────────────────────────────────────────────

// GET /api/admin/nodes/list
router.get("/admin/nodes/list", requireAdmin("support"), async (req, res) => {
  const nodes = await readNodes();
  const list = nodes.map(n => ({
    ...n,
    status: drainingNodes.has(n.id) ? "draining" as const : n.status,
  }));
  res.json({ total: list.length, nodes: list });
});

// POST /api/admin/nodes/drain
router.post("/admin/nodes/drain", requireAdmin("admin"), async (req, res) => {
  const { nodeId, reason = "Admin drain" } = req.body as { nodeId: string; reason?: string };
  if (!nodeId) { res.status(400).json({ error: "nodeId required" }); return; }
  drainingNodes.add(nodeId);
  logAudit((req as any).adminUserId, "drain_node", { nodeId, reason });
  res.json({ success: true, nodeId, status: "draining" });
});

// POST /api/admin/nodes/restore
router.post("/admin/nodes/restore", requireAdmin("admin"), async (req, res) => {
  const { nodeId } = req.body as { nodeId: string };
  drainingNodes.delete(nodeId);
  logAudit((req as any).adminUserId, "restore_node", { nodeId });
  res.json({ success: true, nodeId, status: "online" });
});

// ── Region Routes ─────────────────────────────────────────────────────────────

// GET /api/admin/regions/list
router.get("/admin/regions/list", requireAdmin("support"), (req, res) => {
  const regions = DEFAULT_REGIONS.map(r => ({
    ...r,
    enabled: !disabledRegions.has(r.id),
    disabledInfo: disabledRegions.get(r.id) ?? null,
  }));
  res.json({ regions });
});

// POST /api/admin/regions/disable
router.post("/admin/regions/disable", requireAdmin("super_admin"), (req, res) => {
  const { regionId, reason = "Maintenance" } = req.body as { regionId: string; reason?: string };
  disabledRegions.set(regionId, { reason, at: new Date().toISOString() });
  logAudit((req as any).adminUserId, "disable_region", { regionId, reason });
  res.json({ success: true, regionId, enabled: false });
});

// POST /api/admin/regions/enable
router.post("/admin/regions/enable", requireAdmin("super_admin"), (req, res) => {
  const { regionId } = req.body as { regionId: string };
  disabledRegions.delete(regionId);
  logAudit((req as any).adminUserId, "enable_region", { regionId });
  res.json({ success: true, regionId, enabled: true });
});

// ── Billing Admin Routes ──────────────────────────────────────────────────────

// GET /api/admin/billing/users
router.get("/admin/billing/users", requireAdmin("support"), async (req, res) => {
  try {
    const raw = await fs.readFile(path.join(getPlatformDir(), "billing.json"), "utf-8");
    const all: any[] = JSON.parse(raw);
    const list = all.map(b => ({
      userId: b.userId,
      credits: b.credits,
      plan: b.plan,
      totalSpent: b.totalSpent ?? 0,
      usageCount: b.usageHistory?.length ?? 0,
    }));
    res.json({ total: list.length, users: list });
  } catch {
    res.json({ total: 0, users: [] });
  }
});

// POST /api/admin/billing/adjust
router.post("/admin/billing/adjust", requireAdmin("admin"), async (req, res) => {
  const { userId, amount, reason = "Admin adjustment" } = req.body as {
    userId: string; amount: number; reason?: string;
  };
  if (!userId || typeof amount !== "number") {
    res.status(400).json({ error: "userId and numeric amount required" }); return;
  }
  try {
    const file = path.join(getPlatformDir(), "billing.json");
    const raw = await fs.readFile(file, "utf-8");
    const all: any[] = JSON.parse(raw);
    const user = all.find(b => b.userId === userId);
    if (!user) { res.status(404).json({ error: "User billing not found" }); return; }
    user.credits = Math.max(0, (user.credits ?? 0) + amount);
    user.usageHistory = user.usageHistory ?? [];
    user.usageHistory.push({
      id: Math.random().toString(36).slice(2, 10),
      type: "credit-add",
      cost: -amount,
      description: `Admin adjustment: ${reason}`,
      timestamp: new Date().toISOString(),
    });
    await fs.writeFile(file, JSON.stringify(all, null, 2));
    logAudit((req as any).adminUserId, "adjust_credits", { userId, amount, reason });
    res.json({ success: true, userId, newCredits: user.credits });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Plugin Routes ─────────────────────────────────────────────────────────────

// GET /api/admin/plugins/list
router.get("/admin/plugins/list", requireAdmin("support"), async (req, res) => {
  const plugins = await readPlugins();
  const list = plugins.map(p => ({
    ...p,
    status: pluginApprovals.get(p.id) ?? p.status,
  }));
  res.json({ total: list.length, plugins: list });
});

// POST /api/admin/plugins/approve
router.post("/admin/plugins/approve", requireAdmin("admin"), (req, res) => {
  const { pluginId } = req.body as { pluginId: string };
  pluginApprovals.set(pluginId, "approved");
  logAudit((req as any).adminUserId, "approve_plugin", { pluginId });
  res.json({ success: true, pluginId, status: "approved" });
});

// POST /api/admin/plugins/reject
router.post("/admin/plugins/reject", requireAdmin("admin"), (req, res) => {
  const { pluginId, reason = "Policy violation" } = req.body as { pluginId: string; reason?: string };
  pluginApprovals.set(pluginId, "rejected");
  logAudit((req as any).adminUserId, "reject_plugin", { pluginId, reason });
  res.json({ success: true, pluginId, status: "rejected" });
});

// ── Agent Routes ──────────────────────────────────────────────────────────────

// GET /api/admin/agents/list
router.get("/admin/agents/list", requireAdmin("support"), async (req, res) => {
  const agents = await readAgents();
  const list = agents.map(a => ({
    ...a,
    status: disabledAgents.has(a.id) ? "disabled" as const : a.status,
  }));
  res.json({ total: list.length, agents: list });
});

// POST /api/admin/agents/disable
router.post("/admin/agents/disable", requireAdmin("admin"), (req, res) => {
  const { agentId, reason = "Admin disabled" } = req.body as { agentId: string; reason?: string };
  disabledAgents.add(agentId);
  logAudit((req as any).adminUserId, "disable_agent", { agentId, reason });
  res.json({ success: true, agentId, status: "disabled" });
});

// POST /api/admin/agents/enable
router.post("/admin/agents/enable", requireAdmin("admin"), (req, res) => {
  const { agentId } = req.body as { agentId: string };
  disabledAgents.delete(agentId);
  logAudit((req as any).adminUserId, "enable_agent", { agentId });
  res.json({ success: true, agentId, status: "active" });
});

export default router;
