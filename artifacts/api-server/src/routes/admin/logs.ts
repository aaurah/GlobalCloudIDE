import { Router } from "express";
import { requireAdmin, getAuditLog } from "./index";

const router = Router();

// ── System Log Store ──────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface SystemLog {
  id: string;
  level: LogLevel;
  message: string;
  service: string;
  userId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const systemLogs: SystemLog[] = [];
let logIdCounter = 0;

export function addSystemLog(
  level: LogLevel,
  message: string,
  service: string,
  meta?: { userId?: string; projectId?: string; metadata?: Record<string, unknown> }
) {
  const entry: SystemLog = {
    id: `log-${++logIdCounter}`,
    level,
    message,
    service,
    userId: meta?.userId,
    projectId: meta?.projectId,
    metadata: meta?.metadata,
    timestamp: new Date().toISOString(),
  };
  systemLogs.unshift(entry);
  if (systemLogs.length > 10000) systemLogs.pop();
}

// Seed some initial system logs
const SEED_SERVICES = ["api", "deploy", "build", "auth", "scheduler", "healing"];
const SEED_LEVELS: LogLevel[] = ["info", "info", "info", "warn", "error", "debug"];
const SEED_MESSAGES = [
  "Request processed successfully",
  "Deployment started",
  "Build completed in 12.3s",
  "Rate limit approaching for user",
  "Build failed: npm install error",
  "Health check passed",
  "Auto-heal triggered for deployment",
  "User authenticated",
  "Scheduled job completed",
  "Container started successfully",
];

for (let i = 0; i < 50; i++) {
  addSystemLog(
    SEED_LEVELS[Math.floor(Math.random() * SEED_LEVELS.length)],
    SEED_MESSAGES[Math.floor(Math.random() * SEED_MESSAGES.length)],
    SEED_SERVICES[Math.floor(Math.random() * SEED_SERVICES.length)],
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/admin/logs
router.get("/admin/logs", requireAdmin("auditor"), (req, res) => {
  const {
    level, service, userId, projectId, search,
    limit = 100, offset = 0,
    since, until,
  } = req.query;

  let list = [...systemLogs];

  if (level)     list = list.filter(l => l.level === String(level));
  if (service)   list = list.filter(l => l.service === String(service));
  if (userId)    list = list.filter(l => l.userId === String(userId));
  if (projectId) list = list.filter(l => l.projectId === String(projectId));
  if (search)    list = list.filter(l => l.message.toLowerCase().includes(String(search).toLowerCase()));
  if (since)     list = list.filter(l => new Date(l.timestamp) >= new Date(String(since)));
  if (until)     list = list.filter(l => new Date(l.timestamp) <= new Date(String(until)));

  const total = list.length;
  const page = list.slice(Number(offset), Number(offset) + Number(limit));

  // Stats breakdown
  const levelCounts = systemLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.level] = (acc[l.level] ?? 0) + 1; return acc;
  }, {});

  res.json({ total, logs: page, levelCounts });
});

// GET /api/admin/audit
router.get("/admin/audit", requireAdmin("auditor"), (req, res) => {
  const { userId, action, limit = 50, offset = 0 } = req.query;
  const entries = getAuditLog({
    userId: userId ? String(userId) : undefined,
    action: action ? String(action) : undefined,
    limit: Number(limit) + Number(offset),
  });
  const page = entries.slice(Number(offset), Number(offset) + Number(limit));
  res.json({ total: entries.length, entries: page });
});

// GET /api/admin/logs/stats
router.get("/admin/logs/stats", requireAdmin("auditor"), (req, res) => {
  const now = Date.now();
  const hour = 3600000;
  const last1h = systemLogs.filter(l => now - new Date(l.timestamp).getTime() < hour);
  const last24h = systemLogs.filter(l => now - new Date(l.timestamp).getTime() < 24 * hour);

  res.json({
    totalLogs: systemLogs.length,
    errorsLast1h: last1h.filter(l => l.level === "error" || l.level === "fatal").length,
    warningsLast1h: last1h.filter(l => l.level === "warn").length,
    requestsLast24h: last24h.filter(l => l.service === "api").length,
    services: [...new Set(systemLogs.map(l => l.service))],
  });
});

export default router;
