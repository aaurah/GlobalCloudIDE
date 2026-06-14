import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";

const router = Router();

interface MetricPoint {
  timestamp: string;
  value: number;
}

interface MetricSeries {
  name: string;
  unit: string;
  points: MetricPoint[];
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

interface AlertRule {
  id: string;
  userId: string;
  name: string;
  metric: string;
  condition: "gt" | "lt" | "eq";
  threshold: number;
  severity: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  createdAt: string;
  lastFired?: string;
}

interface ActiveAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  value: number;
  threshold: number;
  severity: string;
  firedAt: string;
  resolved: boolean;
}

function getObsDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readFile<T>(name: string, def: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(path.join(getObsDir(), name), "utf-8")); }
  catch { return def; }
}

async function writeFile(name: string, data: unknown): Promise<void> {
  const dir = getObsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), JSON.stringify(data, null, 2));
}

// Generate realistic time-series metrics for the last N minutes
function generateMetrics(): MetricSeries[] {
  const now = Date.now();
  const points = (metric: string, base: number, variance: number, count = 30): MetricPoint[] =>
    Array.from({ length: count }, (_, i) => ({
      timestamp: new Date(now - (count - i) * 60000).toISOString(),
      value: Math.max(0, Math.round((base + (Math.random() - 0.5) * variance * 2) * 10) / 10),
    }));

  return [
    { name: "cpu_percent", unit: "%", points: points("cpu", 35, 20) },
    { name: "memory_mb", unit: "MB", points: points("mem", 512, 200) },
    { name: "request_rate", unit: "req/s", points: points("req", 12, 8) },
    { name: "error_rate", unit: "%", points: points("err", 1.5, 1.5) },
    { name: "response_time_p99", unit: "ms", points: points("rt", 180, 80) },
    { name: "active_deployments", unit: "count", points: points("dep", 3, 1) },
  ];
}

function generateLogs(limit: number): LogEntry[] {
  const levels: LogEntry["level"][] = ["info", "info", "info", "warn", "error", "debug"];
  const sources = ["api-server", "scheduler", "container-runtime", "healing-engine", "router", "function-runner"];
  const messages = [
    ["info", "Request processed successfully", "api-server"],
    ["info", "Node heartbeat received", "scheduler"],
    ["warn", "High CPU detected on node local-0", "scheduler"],
    ["info", "Container started on port 3000", "container-runtime"],
    ["error", "Function timeout after 30s", "function-runner"],
    ["info", "Route health check passed", "router"],
    ["debug", "Billing deduction: 2 credits", "api-server"],
    ["warn", "Memory usage approaching limit", "healing-engine"],
    ["info", "Orchestrator analysis complete", "scheduler"],
    ["info", "Plugin installed successfully", "api-server"],
  ] as [LogEntry["level"], string, string][];
  return Array.from({ length: limit }, (_, i) => {
    const m = messages[i % messages.length];
    return {
      id: `log-${i}`,
      timestamp: new Date(Date.now() - i * 15000).toISOString(),
      level: m[0],
      source: m[2],
      message: m[1],
    };
  });
}

// GET /observability/metrics
router.get("/observability/metrics", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const metrics = generateMetrics();
  // Summary stats
  const summary = metrics.map(m => {
    const vals = m.points.map(p => p.value);
    return {
      name: m.name,
      unit: m.unit,
      current: vals[vals.length - 1],
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10,
      min: Math.min(...vals),
      max: Math.max(...vals),
      series: m.points,
    };
  });
  res.json({ metrics: summary, timestamp: new Date().toISOString() });
});

// GET /observability/logs
router.get("/observability/logs", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const level = req.query.level as string | undefined;
  const source = req.query.source as string | undefined;

  let logs = generateLogs(100);
  if (level) logs = logs.filter(l => l.level === level);
  if (source) logs = logs.filter(l => l.source === source);

  res.json({ logs: logs.slice(0, limit), total: logs.length });
});

// GET /observability/alerts
router.get("/observability/alerts", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const rules: AlertRule[] = await readFile(`alerts-${userId}.json`, []);
  const active: ActiveAlert[] = await readFile(`active-alerts-${userId}.json`, []);
  res.json({ rules, active });
});

// POST /observability/alerts — create alert rule
router.post("/observability/alerts", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { name, metric, condition, threshold, severity = "medium" } = req.body as {
    name: string; metric: string; condition: "gt" | "lt" | "eq"; threshold: number; severity?: string;
  };
  if (!name || !metric || !condition || threshold === undefined) return void res.status(400).json({ error: "name, metric, condition, threshold required" });

  const rules: AlertRule[] = await readFile(`alerts-${userId}.json`, []);
  const rule: AlertRule = {
    id: randomUUID(), userId, name, metric,
    condition, threshold, severity: severity as AlertRule["severity"],
    enabled: true, createdAt: new Date().toISOString(),
  };
  rules.push(rule);
  await writeFile(`alerts-${userId}.json`, rules);
  res.status(201).json(rule);
});

// DELETE /observability/alerts/:id
router.delete("/observability/alerts/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  let rules: AlertRule[] = await readFile(`alerts-${userId}.json`, []);
  rules = rules.filter(r => r.id !== req.params.id);
  await writeFile(`alerts-${userId}.json`, rules);
  res.json({ ok: true });
});

// GET /observability/region-health
router.get("/observability/region-health", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const regions = [
    { id: "us-east", label: "US East", status: "healthy", latencyMs: 22, uptime: 99.98 },
    { id: "us-west", label: "US West", status: "healthy", latencyMs: 31, uptime: 99.95 },
    { id: "eu-central", label: "EU Central", status: "healthy", latencyMs: 85, uptime: 99.97 },
    { id: "ap-southeast", label: "AP Southeast", status: "degraded", latencyMs: 142, uptime: 98.12 },
    { id: "local", label: "Local Dev", status: "healthy", latencyMs: 1, uptime: 100 },
  ];
  res.json(regions);
});

// GET /observability/traces — request traces (simulated)
router.get("/observability/traces", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 50);
  const endpoints = ["/api/run", "/api/ai", "/api/fs/list", "/api/billing/credits", "/api/nodes", "/api/orchestrator/status"];
  const traces = Array.from({ length: limit }, (_, i) => ({
    traceId: `trace-${i.toString(16).padStart(8, "0")}`,
    endpoint: endpoints[i % endpoints.length],
    method: i % 5 === 0 ? "GET" : "POST",
    statusCode: i % 20 === 0 ? 500 : i % 8 === 0 ? 404 : 200,
    durationMs: Math.round(50 + Math.random() * 500),
    timestamp: new Date(Date.now() - i * 8000).toISOString(),
    spans: Math.floor(1 + Math.random() * 4),
  }));
  res.json({ traces, total: traces.length });
});

export default router;
