import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { requireAdmin, logAudit } from "./index";
import { deployments } from "../platform/deploy";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectMeta {
  id: string;
  name: string;
  type: string;
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPlatformDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readAllProjects(): Promise<ProjectMeta[]> {
  try {
    const dir = path.join(getPlatformDir().replace(".platform", ""), "projects");
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const projects: ProjectMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const metaPath = path.join(dir, entry.name, ".meta.json");
        const raw = await fs.readFile(metaPath, "utf-8");
        projects.push(JSON.parse(raw));
      } catch {
        // project dir without meta — skip
      }
    }
    return projects;
  } catch { return []; }
}

// In-memory lock store
const lockedProjects = new Map<string, { reason: string; at: string; by: string }>();

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/admin/projects/list
router.get("/admin/projects/list", requireAdmin("support"), async (req, res) => {
  const projects = await readAllProjects();
  const { search, ownerId } = req.query;
  let list = projects.map(p => ({
    ...p,
    locked: lockedProjects.has(p.id),
    lockInfo: lockedProjects.get(p.id) ?? null,
    deployment: deployments.has(p.id) ? {
      status: deployments.get(p.id)!.status,
      url: deployments.get(p.id)!.url,
      pid: deployments.get(p.id)!.pid,
    } : null,
  }));
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q));
  }
  if (ownerId) list = list.filter(p => p.ownerId === String(ownerId));
  res.json({ total: list.length, projects: list });
});

// GET /api/admin/projects/:id
router.get("/admin/projects/:id", requireAdmin("support"), async (req, res) => {
  const projects = await readAllProjects();
  const p = projects.find(x => x.id === req.params.id);
  if (!p) { res.status(404).json({ error: "Project not found" }); return; }
  res.json({
    ...p,
    locked: lockedProjects.has(p.id),
    lockInfo: lockedProjects.get(p.id) ?? null,
    deployment: deployments.get(p.id) ?? null,
  });
});

// POST /api/admin/projects/lock
router.post("/admin/projects/lock", requireAdmin("admin"), async (req, res) => {
  const { projectId, reason = "Admin lock" } = req.body as { projectId: string; reason?: string };
  if (!projectId) { res.status(400).json({ error: "projectId required" }); return; }
  lockedProjects.set(projectId, { reason, at: new Date().toISOString(), by: (req as any).adminUserId });
  logAudit((req as any).adminUserId, "lock_project", { projectId, reason });
  res.json({ success: true, projectId, locked: true });
});

// POST /api/admin/projects/unlock
router.post("/admin/projects/unlock", requireAdmin("admin"), async (req, res) => {
  const { projectId } = req.body as { projectId: string };
  lockedProjects.delete(projectId);
  logAudit((req as any).adminUserId, "unlock_project", { projectId });
  res.json({ success: true, projectId, locked: false });
});

// GET /api/admin/deployments/list
router.get("/admin/deployments/list", requireAdmin("support"), (req, res) => {
  const { status } = req.query;
  const list = Array.from(deployments.entries()).map(([projectId, state]) => ({
    projectId,
    status: state.status,
    url: state.url,
    pid: state.pid,
    port: state.port,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt,
  }));
  const filtered = status ? list.filter(d => d.status === String(status)) : list;
  res.json({ total: filtered.length, deployments: filtered });
});

// POST /api/admin/deployments/stop
router.post("/admin/deployments/stop", requireAdmin("admin"), (req, res) => {
  const { projectId, reason = "Admin forced stop" } = req.body as { projectId: string; reason?: string };
  const state = deployments.get(projectId);
  if (!state) { res.status(404).json({ error: "Deployment not found" }); return; }
  if (state.process) {
    try { state.process.kill("SIGTERM"); } catch {}
    state.process = undefined;
  }
  state.status = "stopped";
  state.stoppedAt = new Date().toISOString();
  logAudit((req as any).adminUserId, "force_stop_deployment", { projectId, reason });
  res.json({ success: true, projectId, status: "stopped" });
});

// GET /api/admin/stats/deployments
router.get("/admin/stats/deployments", requireAdmin("auditor"), (req, res) => {
  const all = Array.from(deployments.values());
  const counts = all.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});
  res.json({
    total: all.length,
    running: counts["running"] ?? 0,
    building: counts["building"] ?? 0,
    failed: counts["failed"] ?? 0,
    stopped: counts["stopped"] ?? 0,
    idle: counts["idle"] ?? 0,
  });
});

export default router;
