import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

const REGIONS = [
  { id: "us-east", label: "US East (N. Virginia)", lat: 37.9, lon: -77.4 },
  { id: "us-west", label: "US West (Oregon)", lat: 45.5, lon: -122.8 },
  { id: "eu-central", label: "EU Central (Frankfurt)", lat: 50.1, lon: 8.7 },
  { id: "ap-southeast", label: "Asia Pacific (Singapore)", lat: 1.3, lon: 103.8 },
  { id: "local", label: "Local (Dev)", lat: 0, lon: 0 },
];

export interface RegionHealth {
  regionId: string;
  label: string;
  status: "healthy" | "degraded" | "outage";
  latencyMs: number;
  nodeCount: number;
  deploymentCount: number;
  cpuAvg: number;
  memoryAvg: number;
  lat: number;
  lon: number;
}

export interface WorkloadAssignment {
  id: string;
  projectId: string;
  regionId: string;
  nodeId: string;
  assignedAt: string;
  status: "running" | "failed" | "migrating";
  failoverRegion?: string;
}

export interface ScalingPrediction {
  regionId: string;
  currentLoad: number;
  predictedLoad: number;
  recommendation: "scale-up" | "scale-down" | "hold";
  confidence: number;
}

function getSchedulerFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform/scheduler.json");
}

async function readWorkloads(): Promise<WorkloadAssignment[]> {
  try {
    const raw = await fs.readFile(getSchedulerFile(), "utf-8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function writeWorkloads(workloads: WorkloadAssignment[]): Promise<void> {
  const file = getSchedulerFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(workloads, null, 2));
}

async function readNodes(): Promise<any[]> {
  try {
    const cwd = process.cwd();
    const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
    const raw = await fs.readFile(path.resolve(root, "ide-workspace/.platform/nodes.json"), "utf-8");
    return JSON.parse(raw);
  } catch { return [{ id: "local-0", name: "local-primary", region: "local", status: "online", cpuPercent: 0, memoryMb: 0, memoryLimitMb: 2048, deployments: [] }]; }
}

function getRegionHealth(regionId: string, nodes: any[]): Omit<RegionHealth, "label" | "lat" | "lon"> {
  const regionNodes = nodes.filter(n => n.region === regionId);
  if (!regionNodes.length) return { regionId, status: "outage", latencyMs: 9999, nodeCount: 0, deploymentCount: 0, cpuAvg: 0, memoryAvg: 0 };
  const online = regionNodes.filter(n => n.status === "online");
  const avgCpu = online.length ? Math.round(online.reduce((s: number, n: any) => s + n.cpuPercent, 0) / online.length) : 0;
  const avgMem = online.length ? Math.round(online.reduce((s: number, n: any) => s + (n.memoryMb / n.memoryLimitMb) * 100, 0) / online.length) : 0;
  const totalDeploys = regionNodes.reduce((s: number, n: any) => s + (n.deployments?.length ?? 0), 0);
  const status: RegionHealth["status"] = online.length === 0 ? "outage" : avgCpu > 80 ? "degraded" : "healthy";
  const latencyMs = regionId === "local" ? 1 : regionId.startsWith("us") ? 20 + Math.random() * 10 : regionId.startsWith("eu") ? 80 + Math.random() * 20 : 140 + Math.random() * 30;
  return { regionId, status, latencyMs: Math.round(latencyMs), nodeCount: regionNodes.length, deploymentCount: totalDeploys, cpuAvg: avgCpu, memoryAvg: avgMem };
}

// GET /scheduler/regions
router.get("/scheduler/regions", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const nodes = await readNodes();
  const health: RegionHealth[] = REGIONS.map(r => {
    const rh = getRegionHealth(r.id, nodes);
    return { ...rh, label: r.label, lat: r.lat, lon: r.lon };
  });
  res.json(health);
});

// GET /scheduler/workloads
router.get("/scheduler/workloads", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const workloads = await readWorkloads();
  res.json(workloads);
});

// POST /scheduler/assign — assign workload to optimal region/node
router.post("/scheduler/assign", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { projectId, preferredRegion } = req.body as { projectId: string; preferredRegion?: string };
  if (!projectId) return void res.status(400).json({ error: "projectId required" });

  const nodes = await readNodes();
  const targetRegion = preferredRegion ?? "local";

  // Find least-loaded online node in region
  const candidates = nodes.filter((n: any) => n.region === targetRegion && n.status === "online");
  const fallback = nodes.filter((n: any) => n.status === "online" && n.region !== targetRegion);
  const pool = candidates.length ? candidates : fallback;
  if (!pool.length) return void res.status(503).json({ error: "No available nodes" });

  const node = pool.reduce((a: any, b: any) => a.cpuPercent <= b.cpuPercent ? a : b);
  const failoverRegion = REGIONS.find(r => r.id !== (node.region ?? targetRegion) && r.id !== "local")?.id;

  const workloads = await readWorkloads();
  const existing = workloads.findIndex(w => w.projectId === projectId);

  const assignment: WorkloadAssignment = {
    id: existing >= 0 ? workloads[existing].id : randomUUID(),
    projectId,
    regionId: node.region ?? targetRegion,
    nodeId: node.id,
    assignedAt: new Date().toISOString(),
    status: "running",
    failoverRegion,
  };

  if (existing >= 0) workloads[existing] = assignment;
  else workloads.push(assignment);
  await writeWorkloads(workloads);
  res.json(assignment);
});

// POST /scheduler/failover/:workloadId — trigger failover to backup region
router.post("/scheduler/failover/:workloadId", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const workloads = await readWorkloads();
  const workload = workloads.find(w => w.id === req.params.workloadId);
  if (!workload) return void res.status(404).json({ error: "Workload not found" });
  if (!workload.failoverRegion) return void res.status(400).json({ error: "No failover region configured" });

  workload.status = "migrating";
  const nodes = await readNodes();
  const failoverNodes = nodes.filter((n: any) => n.region === workload.failoverRegion && n.status === "online");
  if (failoverNodes.length) {
    const node = failoverNodes.reduce((a: any, b: any) => a.cpuPercent <= b.cpuPercent ? a : b);
    workload.nodeId = node.id;
    workload.regionId = workload.failoverRegion;
    workload.failoverRegion = undefined;
    workload.status = "running";
  }
  await writeWorkloads(workloads);
  res.json(workload);
});

// GET /scheduler/predict — predict scaling needs per region
router.get("/scheduler/predict", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const nodes = await readNodes();
  const predictions: ScalingPrediction[] = REGIONS.map(r => {
    const rh = getRegionHealth(r.id, nodes);
    const currentLoad = rh.cpuAvg;
    // Simple linear prediction with noise: simulate future load based on time of day + random factor
    const hour = new Date().getHours();
    const peakFactor = hour >= 9 && hour <= 17 ? 1.3 : 0.7;
    const predictedLoad = Math.min(100, Math.round(currentLoad * peakFactor + (Math.random() - 0.5) * 10));
    const recommendation: ScalingPrediction["recommendation"] =
      predictedLoad > 75 ? "scale-up" : predictedLoad < 20 ? "scale-down" : "hold";
    const confidence = 0.6 + Math.random() * 0.3;
    return { regionId: r.id, currentLoad, predictedLoad, recommendation, confidence: Math.round(confidence * 100) / 100 };
  });
  res.json(predictions);
});

// DELETE /scheduler/workloads/:id
router.delete("/scheduler/workloads/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  let workloads = await readWorkloads();
  workloads = workloads.filter(w => w.id !== req.params.id);
  await writeWorkloads(workloads);
  res.json({ ok: true });
});

export default router;
