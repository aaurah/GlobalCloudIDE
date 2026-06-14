import { Router } from "express";
import { requireAdmin, logAudit } from "./index";

const router = Router();

// ── Security Config Store ─────────────────────────────────────────────────────

interface SecurityConfig {
  rateLimits: {
    apiRequestsPerMinute: number;
    deploysPerHour: number;
    aiCallsPerHour: number;
    maxConcurrentBuilds: number;
  };
  resourceLimits: {
    maxProjectsPerUser: number;
    maxDeploymentsPerUser: number;
    maxStorageMb: number;
    maxContainersPerUser: number;
  };
  allowedRegions: string[];
  aiGuardrails: {
    enableContentFilter: boolean;
    blockMaliciousCode: boolean;
    logAllRequests: boolean;
    maxTokensPerRequest: number;
    allowedModels: string[];
  };
  security: {
    requireMfa: boolean;
    sessionTimeoutMinutes: number;
    allowedIpRanges: string[];
    blockVpnAccess: boolean;
    enforceHttps: boolean;
  };
  updatedAt: string;
  updatedBy: string;
}

let securityConfig: SecurityConfig = {
  rateLimits: {
    apiRequestsPerMinute: 120,
    deploysPerHour: 20,
    aiCallsPerHour: 100,
    maxConcurrentBuilds: 5,
  },
  resourceLimits: {
    maxProjectsPerUser: 10,
    maxDeploymentsPerUser: 5,
    maxStorageMb: 5120,
    maxContainersPerUser: 3,
  },
  allowedRegions: ["us-east-1", "eu-west-1", "ap-south-1", "us-west-2"],
  aiGuardrails: {
    enableContentFilter: true,
    blockMaliciousCode: true,
    logAllRequests: false,
    maxTokensPerRequest: 4096,
    allowedModels: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
  },
  security: {
    requireMfa: false,
    sessionTimeoutMinutes: 10080, // 7 days
    allowedIpRanges: [],
    blockVpnAccess: false,
    enforceHttps: true,
  },
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
};

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/admin/security/config
router.get("/admin/security/config", requireAdmin("auditor"), (req, res) => {
  res.json(securityConfig);
});

// PUT /api/admin/security/config
router.put("/admin/security/config", requireAdmin("super_admin"), (req, res) => {
  const patch = req.body as Partial<SecurityConfig>;
  securityConfig = {
    ...securityConfig,
    rateLimits: { ...securityConfig.rateLimits, ...(patch.rateLimits ?? {}) },
    resourceLimits: { ...securityConfig.resourceLimits, ...(patch.resourceLimits ?? {}) },
    allowedRegions: patch.allowedRegions ?? securityConfig.allowedRegions,
    aiGuardrails: { ...securityConfig.aiGuardrails, ...(patch.aiGuardrails ?? {}) },
    security: { ...securityConfig.security, ...(patch.security ?? {}) },
    updatedAt: new Date().toISOString(),
    updatedBy: (req as any).adminUserId,
  };
  logAudit((req as any).adminUserId, "update_security_config", { changes: Object.keys(patch) });
  res.json({ success: true, config: securityConfig });
});

// GET /api/admin/security/limits
router.get("/admin/security/limits", requireAdmin("auditor"), (req, res) => {
  res.json({
    rateLimits: securityConfig.rateLimits,
    resourceLimits: securityConfig.resourceLimits,
  });
});

// POST /api/admin/security/limits
router.post("/admin/security/limits", requireAdmin("admin"), (req, res) => {
  const { rateLimits, resourceLimits } = req.body as {
    rateLimits?: Partial<SecurityConfig["rateLimits"]>;
    resourceLimits?: Partial<SecurityConfig["resourceLimits"]>;
  };
  if (rateLimits) securityConfig.rateLimits = { ...securityConfig.rateLimits, ...rateLimits };
  if (resourceLimits) securityConfig.resourceLimits = { ...securityConfig.resourceLimits, ...resourceLimits };
  securityConfig.updatedAt = new Date().toISOString();
  securityConfig.updatedBy = (req as any).adminUserId;
  logAudit((req as any).adminUserId, "update_limits", { rateLimits, resourceLimits });
  res.json({ success: true });
});

export { securityConfig };
export default router;
