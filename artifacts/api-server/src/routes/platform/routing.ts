import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

export interface Route {
  id: string;
  userId: string;
  host: string;
  path: string;
  targetRegion: string;
  targetNodeId: string;
  targetPort: number;
  protocol: "http" | "https" | "ws";
  loadBalancing: "round-robin" | "least-conn" | "ip-hash";
  healthCheck: string;
  failoverRouteId?: string;
  status: "active" | "inactive" | "degraded";
  requestCount: number;
  errorRate: number;
  avgLatencyMs: number;
  createdAt: string;
}

interface HealthCheckResult {
  routeId: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  checkedAt: string;
  error?: string;
}

function getRoutingFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform/routing.json");
}

async function readRoutes(): Promise<Route[]> {
  try { return JSON.parse(await fs.readFile(getRoutingFile(), "utf-8")); }
  catch { return []; }
}

async function writeRoutes(routes: Route[]): Promise<void> {
  const file = getRoutingFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(routes, null, 2));
}

async function simulateHealthCheck(route: Route): Promise<HealthCheckResult> {
  const latencyMs = route.status === "active"
    ? Math.round(10 + Math.random() * 50)
    : Math.round(500 + Math.random() * 2000);
  const ok = route.status === "active" && Math.random() > 0.05;
  return {
    routeId: route.id,
    status: ok ? "healthy" : route.status === "degraded" ? "degraded" : "down",
    latencyMs,
    checkedAt: new Date().toISOString(),
    error: ok ? undefined : "Connection timeout",
  };
}

// GET /routing/routes
router.get("/routing/routes", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const routes = await readRoutes();
  res.json(routes.filter(r => r.userId === userId));
});

// POST /routing/routes
router.post("/routing/routes", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { host, path: routePath = "/", targetRegion = "local", targetNodeId = "local-0",
    targetPort = 3000, protocol = "http", loadBalancing = "round-robin",
    healthCheck = "/health", failoverRouteId } = req.body as Partial<Route>;

  if (!host) return void res.status(400).json({ error: "host required" });

  const route: Route = {
    id: randomUUID(),
    userId,
    host,
    path: routePath,
    targetRegion,
    targetNodeId,
    targetPort,
    protocol,
    loadBalancing,
    healthCheck,
    failoverRouteId,
    status: "active",
    requestCount: 0,
    errorRate: 0,
    avgLatencyMs: 0,
    createdAt: new Date().toISOString(),
  };

  const routes = await readRoutes();
  routes.push(route);
  await writeRoutes(routes);
  res.status(201).json(route);
});

// PATCH /routing/routes/:id
router.patch("/routing/routes/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const routes = await readRoutes();
  const route = routes.find(r => r.id === req.params.id && r.userId === userId);
  if (!route) return void res.status(404).json({ error: "Route not found" });

  Object.assign(route, req.body);
  await writeRoutes(routes);
  res.json(route);
});

// DELETE /routing/routes/:id
router.delete("/routing/routes/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  let routes = await readRoutes();
  routes = routes.filter(r => !(r.id === req.params.id && r.userId === userId));
  await writeRoutes(routes);
  res.json({ ok: true });
});

// GET /routing/health — health check all routes
router.get("/routing/health", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const routes = await readRoutes();
  const userRoutes = routes.filter(r => r.userId === userId);
  const results = await Promise.all(userRoutes.map(r => simulateHealthCheck(r)));
  res.json(results);
});

// POST /routing/failover/:routeId
router.post("/routing/failover/:routeId", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const routes = await readRoutes();
  const route = routes.find(r => r.id === req.params.routeId && r.userId === userId);
  if (!route) return void res.status(404).json({ error: "Route not found" });
  if (!route.failoverRouteId) return void res.status(400).json({ error: "No failover route configured" });

  const failover = routes.find(r => r.id === route.failoverRouteId);
  if (!failover) return void res.status(404).json({ error: "Failover route not found" });

  // Swap: mark original degraded, activate failover
  route.status = "degraded";
  failover.status = "active";
  await writeRoutes(routes);
  res.json({ ok: true, primary: route, failover });
});

// GET /routing/global — global routing table (all users, anonymized)
router.get("/routing/global", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const routes = await readRoutes();
  res.json(routes.map(r => ({
    id: r.id,
    host: r.host,
    targetRegion: r.targetRegion,
    status: r.status,
    protocol: r.protocol,
  })));
});

export default router;
