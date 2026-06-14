import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuthUser } from "../platform/auth";
import usersAdminRouter from "./users";
import projectsAdminRouter from "./projects";
import infraAdminRouter from "./infra";
import securityAdminRouter from "./security";
import logsAdminRouter from "./logs";
import aiAdminRouter from "./ai";

const router = Router();

// ── Role Store ────────────────────────────────────────────────────────────────

export type AdminRole = "super_admin" | "admin" | "support" | "auditor";

// In-memory role assignments: userId → role
const roleAssignments = new Map<string, AdminRole>();

// Seed: the very first registered user (id starts with common patterns) gets super_admin
// Users can be promoted via POST /api/admin/roles/assign
export function assignRole(userId: string, role: AdminRole) {
  roleAssignments.set(userId, role);
}

export function getRole(userId: string): AdminRole | null {
  return roleAssignments.get(userId) ?? null;
}

export function getAllRoles(): Array<{ userId: string; role: AdminRole }> {
  return Array.from(roleAssignments.entries()).map(([userId, role]) => ({ userId, role }));
}

// Bootstrap: if no admins exist yet, auto-promote the first user who hits any admin endpoint
let bootstrapped = false;
function maybeBootstrap(userId: string) {
  if (!bootstrapped && roleAssignments.size === 0) {
    roleAssignments.set(userId, "super_admin");
    bootstrapped = true;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

const ROLE_LEVELS: Record<AdminRole, number> = {
  auditor: 1,
  support: 2,
  admin: 3,
  super_admin: 4,
};

export function requireAdmin(minRole: AdminRole = "support") {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = getAuthUser(req.headers.authorization);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    maybeBootstrap(userId);

    const role = roleAssignments.get(userId);
    if (!role) { res.status(403).json({ error: "Admin access required", hint: "No admin role assigned" }); return; }

    const roleLevel = ROLE_LEVELS[role];
    const minLevel = ROLE_LEVELS[minRole];
    if (roleLevel < minLevel) {
      res.status(403).json({ error: `Requires role: ${minRole} or higher`, yourRole: role }); return;
    }

    // Attach to request for downstream handlers
    (req as any).adminUserId = userId;
    (req as any).adminRole = role;
    next();
  };
}

// ── Role endpoints ─────────────────────────────────────────────────────────

// GET /api/admin/roles
router.get("/admin/roles", requireAdmin("auditor"), (req, res) => {
  res.json({ roles: getAllRoles(), definitions: Object.keys(ROLE_LEVELS) });
});

// POST /api/admin/roles/assign
router.post("/admin/roles/assign", requireAdmin("super_admin"), (req, res) => {
  const { userId, role } = req.body as { userId: string; role: AdminRole };
  const validRoles: AdminRole[] = ["super_admin", "admin", "support", "auditor"];
  if (!userId || !validRoles.includes(role)) {
    res.status(400).json({ error: "userId and valid role required" }); return;
  }
  roleAssignments.set(userId, role);
  logAudit((req as any).adminUserId, "assign_role", { targetUserId: userId, role });
  res.json({ success: true, userId, role });
});

// DELETE /api/admin/roles/revoke
router.delete("/admin/roles/revoke", requireAdmin("super_admin"), (req, res) => {
  const { userId } = req.body as { userId: string };
  roleAssignments.delete(userId);
  logAudit((req as any).adminUserId, "revoke_role", { targetUserId: userId });
  res.json({ success: true });
});

// ── Audit Log (shared across all admin modules) ───────────────────────────

export interface AuditEntry {
  id: string;
  adminUserId: string;
  action: string;
  payload: object;
  timestamp: string;
  ip?: string;
}

const auditLog: AuditEntry[] = [];

export function logAudit(adminUserId: string, action: string, payload: object = {}) {
  const entry: AuditEntry = {
    id: Math.random().toString(36).slice(2, 10),
    adminUserId,
    action,
    payload,
    timestamp: new Date().toISOString(),
  };
  auditLog.unshift(entry);
  if (auditLog.length > 5000) auditLog.pop();
}

export function getAuditLog(filters?: { userId?: string; action?: string; limit?: number }): AuditEntry[] {
  let list = auditLog;
  if (filters?.userId) list = list.filter(e => e.adminUserId === filters.userId);
  if (filters?.action) list = list.filter(e => e.action.includes(filters.action!));
  return list.slice(0, filters?.limit ?? 100);
}

// Mount sub-routers (all protected by their own requireAdmin calls)
router.use(usersAdminRouter);
router.use(projectsAdminRouter);
router.use(infraAdminRouter);
router.use(securityAdminRouter);
router.use(logsAdminRouter);
router.use(aiAdminRouter);

export default router;
