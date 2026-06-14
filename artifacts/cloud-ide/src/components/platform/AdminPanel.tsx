import React, { useState, useEffect, useCallback } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { ScrollArea } from "../ui/scroll-area";
import {
  Users, Server, Shield, FileText, CreditCard, BrainCircuit,
  Puzzle, Boxes, Globe, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Loader2, Search, Activity, Lock, Unlock, UserX,
  UserCheck, StopCircle, TrendingUp, BarChart3, Settings,
} from "lucide-react";
import { cn } from "../../lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminTab =
  | "overview" | "users" | "projects" | "nodes" | "billing"
  | "plugins" | "security" | "logs" | "ai";

interface AdminUser {
  id: string; username: string; email: string | null;
  createdAt: string; suspended: boolean; suspensionReason: string | null;
}
interface AdminProject {
  id: string; name: string; type: string; ownerId: string;
  createdAt: string; locked: boolean;
  deployment: { status: string; url?: string; pid?: number } | null;
}
interface AdminNode {
  id: string; name: string; region: string;
  status: "online" | "offline" | "draining" | "overloaded";
  cpuPercent: number; memoryUsedMb: number; memoryTotalMb: number;
  deploymentCount: number;
}
interface Region {
  id: string; name: string; enabled: boolean; nodeCount: number;
  disabledInfo: { reason: string } | null;
}
interface AdminPlugin {
  id: string; name: string; version: string; author: string;
  status: "pending" | "approved" | "rejected";
}
interface AdminAgent { id: string; name: string; type: string; status: "active" | "disabled"; }
interface LogEntry  { id: string; level: string; message: string; service: string; timestamp: string; }
interface AuditEntry { id: string; adminUserId: string; action: string; timestamp: string; }
interface SecurityConfig {
  rateLimits: Record<string, number>;
  resourceLimits: Record<string, number>;
  aiGuardrails: Record<string, boolean | number | string[]>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso?: string) {
  if (!iso) return "–";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.round(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.round(d / 3600000)}h ago`;
  return `${Math.round(d / 86400000)}d ago`;
}

const LEVEL_COLOR: Record<string, string> = {
  debug: "text-muted-foreground", info: "text-blue-400",
  warn: "text-amber-400", error: "text-red-400", fatal: "text-red-600",
};
const STATUS_DOT: Record<string, string> = {
  online: "bg-green-400", offline: "bg-red-400",
  draining: "bg-amber-400", overloaded: "bg-orange-400",
  running: "bg-green-400", building: "bg-amber-400",
  failed: "bg-red-400", idle: "bg-muted-foreground", stopped: "bg-muted-foreground",
};

function KpiCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className={cn("rounded-xl border p-3 space-y-1", color)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className="opacity-60">{icon}</div>
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
      {icon}{children}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AdminPanel() {
  const { token } = usePlatform();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [accessGranted, setAccessGranted] = useState<boolean | null>(null);

  const h = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const api = useCallback(async (url: string, opts?: RequestInit) => {
    const r = await fetch(url, { ...opts, headers: h() });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [h]);

  // ── Access check ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    api("/api/admin/roles")
      .then(() => setAccessGranted(true))
      .catch(() => setAccessGranted(false));
  }, [token]);

  // ── Overview ──────────────────────────────────────────────────────────────
  const [overviewStats, setOverviewStats] = useState<any>(null);
  const loadOverview = useCallback(async () => {
    try {
      const [users, deployStats, logStats] = await Promise.all([
        api("/api/admin/stats/users"),
        api("/api/admin/stats/deployments"),
        api("/api/admin/logs/stats"),
      ]);
      setOverviewStats({ users, deployStats, logStats });
    } catch {}
  }, [api]);

  // ── Users ────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [confirmSuspend, setConfirmSuspend] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const d = await api(`/api/admin/users/list?search=${encodeURIComponent(userSearch)}&limit=30`);
      setUsers(d.users ?? []);
    } catch {}
  }, [api, userSearch]);

  const suspendUser = async (userId: string) => {
    try {
      await api("/api/admin/users/suspend", { method: "POST", body: JSON.stringify({ userId, reason: "Admin action" }) });
      loadUsers();
    } catch {}
    setConfirmSuspend(null);
  };

  const unsuspendUser = async (userId: string) => {
    try {
      await api("/api/admin/users/unsuspend", { method: "POST", body: JSON.stringify({ userId }) });
      loadUsers();
    } catch {}
  };

  // ── Projects ─────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [projSearch, setProjSearch] = useState("");

  const loadProjects = useCallback(async () => {
    try {
      const d = await api(`/api/admin/projects/list?search=${encodeURIComponent(projSearch)}`);
      setProjects(d.projects ?? []);
    } catch {}
  }, [api, projSearch]);

  const stopDeployment = async (projectId: string) => {
    try {
      await api("/api/admin/deployments/stop", { method: "POST", body: JSON.stringify({ projectId }) });
      loadProjects();
    } catch {}
  };

  const lockProject = async (projectId: string, locked: boolean) => {
    const endpoint = locked ? "/api/admin/projects/unlock" : "/api/admin/projects/lock";
    try {
      await api(endpoint, { method: "POST", body: JSON.stringify({ projectId }) });
      loadProjects();
    } catch {}
  };

  // ── Nodes ────────────────────────────────────────────────────────────────
  const [nodes, setNodes] = useState<AdminNode[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);

  const loadNodes = useCallback(async () => {
    try {
      const [nd, rd] = await Promise.all([api("/api/admin/nodes/list"), api("/api/admin/regions/list")]);
      setNodes(nd.nodes ?? []);
      setRegions(rd.regions ?? []);
    } catch {}
  }, [api]);

  const drainNode = async (nodeId: string) => {
    try { await api("/api/admin/nodes/drain", { method: "POST", body: JSON.stringify({ nodeId }) }); loadNodes(); } catch {}
  };
  const toggleRegion = async (regionId: string, enabled: boolean) => {
    const ep = enabled ? "/api/admin/regions/disable" : "/api/admin/regions/enable";
    try { await api(ep, { method: "POST", body: JSON.stringify({ regionId }) }); loadNodes(); } catch {}
  };

  // ── Billing ──────────────────────────────────────────────────────────────
  const [billingUsers, setBillingUsers] = useState<any[]>([]);
  const [creditAdjust, setCreditAdjust] = useState<{ userId: string; amount: string } | null>(null);

  const loadBilling = useCallback(async () => {
    try { const d = await api("/api/admin/billing/users"); setBillingUsers(d.users ?? []); } catch {}
  }, [api]);

  const adjustCredits = async () => {
    if (!creditAdjust) return;
    try {
      await api("/api/admin/billing/adjust", {
        method: "POST",
        body: JSON.stringify({ userId: creditAdjust.userId, amount: Number(creditAdjust.amount), reason: "Admin adjustment" }),
      });
      setCreditAdjust(null);
      loadBilling();
    } catch {}
  };

  // ── Plugins + Agents ─────────────────────────────────────────────────────
  const [plugins, setPlugins] = useState<AdminPlugin[]>([]);
  const [agents, setAgents] = useState<AdminAgent[]>([]);

  const loadPlugins = useCallback(async () => {
    try {
      const [pd, ad] = await Promise.all([api("/api/admin/plugins/list"), api("/api/admin/agents/list")]);
      setPlugins(pd.plugins ?? []);
      setAgents(ad.agents ?? []);
    } catch {}
  }, [api]);

  const approvePlugin = async (pluginId: string, approve: boolean) => {
    const ep = approve ? "/api/admin/plugins/approve" : "/api/admin/plugins/reject";
    try { await api(ep, { method: "POST", body: JSON.stringify({ pluginId }) }); loadPlugins(); } catch {}
  };
  const toggleAgent = async (agentId: string, active: boolean) => {
    const ep = active ? "/api/admin/agents/disable" : "/api/admin/agents/enable";
    try { await api(ep, { method: "POST", body: JSON.stringify({ agentId }) }); loadPlugins(); } catch {}
  };

  // ── Security ─────────────────────────────────────────────────────────────
  const [secConfig, setSecConfig] = useState<SecurityConfig | null>(null);
  const [secEditing, setSecEditing] = useState(false);
  const [secDraft, setSecDraft] = useState<any>({});

  const loadSecurity = useCallback(async () => {
    try { const d = await api("/api/admin/security/config"); setSecConfig(d); setSecDraft(d); } catch {}
  }, [api]);

  const saveSecurity = async () => {
    try { await api("/api/admin/security/config", { method: "PUT", body: JSON.stringify(secDraft) }); setSecEditing(false); loadSecurity(); } catch {}
  };

  // ── Logs ─────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [logTab, setLogTab] = useState<"system" | "audit">("system");
  const [logLevel, setLogLevel] = useState("");
  const [logSearch, setLogSearch] = useState("");

  const loadLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (logLevel) params.set("level", logLevel);
      if (logSearch) params.set("search", logSearch);
      params.set("limit", "50");
      const [ld, ad] = await Promise.all([
        api(`/api/admin/logs?${params}`),
        api("/api/admin/audit?limit=30"),
      ]);
      setLogs(ld.logs ?? []);
      setAuditLogs(ad.entries ?? []);
    } catch {}
  }, [api, logLevel, logSearch]);

  // ── AI Assistant ─────────────────────────────────────────────────────────
  const [aiMode, setAiMode] = useState<"summary" | "suggestions" | "logs">("summary");
  const [aiInput, setAiInput] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const runAi = async () => {
    setAiLoading(true);
    setAiOutput("");
    const endpoints = {
      summary:     "/api/admin/ai/summary",
      suggestions: "/api/admin/ai/suggestions",
      logs:        "/api/admin/ai/explain-logs",
    };
    const bodies = {
      summary:     { extra: aiInput },
      suggestions: { context: aiInput },
      logs:        { logs: aiInput.split("\n").filter(Boolean), service: "system" },
    };
    try {
      const r = await fetch(endpoints[aiMode], { method: "POST", headers: h(), body: JSON.stringify(bodies[aiMode]) });
      if (!r.body) throw new Error("No stream");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.content) { full += d.content; setAiOutput(full); }
            if (d.error) setAiOutput(`Error: ${d.error}`);
          } catch {}
        }
      }
    } catch (e: any) { setAiOutput(`Error: ${e.message}`); }
    finally { setAiLoading(false); }
  };

  // ── Tab change data loading ───────────────────────────────────────────────
  useEffect(() => {
    if (!accessGranted) return;
    if (tab === "overview") loadOverview();
    if (tab === "users")    loadUsers();
    if (tab === "projects") loadProjects();
    if (tab === "nodes")    loadNodes();
    if (tab === "billing")  loadBilling();
    if (tab === "plugins")  loadPlugins();
    if (tab === "security") loadSecurity();
    if (tab === "logs")     loadLogs();
  }, [tab, accessGranted]);

  useEffect(() => { if (tab === "users")    loadUsers();    }, [userSearch]);
  useEffect(() => { if (tab === "projects") loadProjects(); }, [projSearch]);
  useEffect(() => { if (tab === "logs")     loadLogs();     }, [logLevel, logSearch]);

  // ── Access gates ──────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Shield className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Sign in required</p>
      </div>
    );
  }
  if (accessGranted === null) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (accessGranted === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Shield className="w-10 h-10 text-amber-400/50 mb-3" />
        <p className="text-sm font-semibold">Admin Access Required</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
          No admin role assigned. If you are the first user, sign in and try again — you will be auto-promoted to super_admin.
        </p>
        <Button size="sm" variant="outline" className="mt-3 text-xs h-7" onClick={() => {
          api("/api/admin/roles").then(() => setAccessGranted(true)).catch(() => setAccessGranted(false));
        }}>
          <RefreshCw size={11} className="mr-1" /> Retry
        </Button>
      </div>
    );
  }

  // ── Tab nav ───────────────────────────────────────────────────────────────
  const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",  label: "Overview",  icon: <BarChart3 size={11} /> },
    { id: "users",     label: "Users",     icon: <Users size={11} /> },
    { id: "projects",  label: "Projects",  icon: <Boxes size={11} /> },
    { id: "nodes",     label: "Nodes",     icon: <Server size={11} /> },
    { id: "billing",   label: "Billing",   icon: <CreditCard size={11} /> },
    { id: "plugins",   label: "Plugins",   icon: <Puzzle size={11} /> },
    { id: "security",  label: "Security",  icon: <Shield size={11} /> },
    { id: "logs",      label: "Logs",      icon: <FileText size={11} /> },
    { id: "ai",        label: "AI",        icon: <BrainCircuit size={11} /> },
  ];

  const refresh = () => {
    const loaders: Record<AdminTab, () => void> = {
      overview: loadOverview, users: loadUsers, projects: loadProjects,
      nodes: loadNodes, billing: loadBilling, plugins: loadPlugins,
      security: loadSecurity, logs: loadLogs, ai: () => {},
    };
    loaders[tab]?.();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center justify-between bg-red-950/10">
        <div className="flex items-center gap-2">
          <Shield size={12} className="text-red-400" />
          <span className="text-xs font-bold text-red-400">Admin Control Plane</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refresh}>
          <RefreshCw size={11} />
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-border shrink-0 scrollbar-hide bg-background/30">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-2 text-[10px] font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors touch-manipulation",
              tab === t.id ? "border-red-500 text-red-400" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Overview ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="p-3 space-y-3">
            {overviewStats ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <KpiCard label="Total Users" value={overviewStats.users.totalUsers ?? 0}
                    sub={`+${overviewStats.users.newToday ?? 0} today`}
                    icon={<Users size={14} />} color="border-blue-700/30 bg-blue-900/10" />
                  <KpiCard label="Running" value={overviewStats.deployStats.running ?? 0}
                    sub={`${overviewStats.deployStats.total ?? 0} total`}
                    icon={<Activity size={14} />} color="border-green-700/30 bg-green-900/10" />
                  <KpiCard label="Failed" value={overviewStats.deployStats.failed ?? 0}
                    sub={`${overviewStats.deployStats.building ?? 0} building`}
                    icon={<XCircle size={14} />} color="border-red-700/30 bg-red-900/10" />
                  <KpiCard label="Errors /h" value={overviewStats.logStats.errorsLast1h ?? 0}
                    sub={`${overviewStats.logStats.warningsLast1h ?? 0} warnings`}
                    icon={<AlertTriangle size={14} />} color="border-amber-700/30 bg-amber-900/10" />
                </div>
                <div className="rounded-xl border border-border p-3 space-y-1.5">
                  <SectionTitle icon={<TrendingUp size={10} />}>Platform Metrics</SectionTitle>
                  {[
                    ["Teams",        overviewStats.users.totalTeams ?? 0],
                    ["Suspended",    overviewStats.users.suspended ?? 0],
                    ["New this week",overviewStats.users.newThisWeek ?? 0],
                    ["Stopped",      overviewStats.deployStats.stopped ?? 0],
                    ["Log services", overviewStats.logStats.services?.length ?? 0],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold tabular-nums">{val}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}

        {/* ── Users ────────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div className="p-3 space-y-2">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-2 text-muted-foreground" />
              <input className="w-full pl-7 pr-2.5 py-1.5 bg-input border border-border rounded-lg text-xs outline-none focus:ring-1 ring-primary"
                placeholder="Search users…" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              {users.length === 0
                ? <p className="text-xs text-muted-foreground italic text-center py-8">No users found</p>
                : users.map(u => (
                  <div key={u.id} className="rounded-xl border border-border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold">{u.username}</span>
                          {u.suspended && <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Suspended</Badge>}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {u.email ?? "no email"} · {timeAgo(u.createdAt)}
                        </div>
                        {u.suspended && u.suspensionReason && (
                          <div className="text-[9px] text-red-400 mt-0.5">{u.suspensionReason}</div>
                        )}
                      </div>
                      <div className="shrink-0">
                        {u.suspended
                          ? <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] text-green-400 border-green-700/40 touch-manipulation" onClick={() => unsuspendUser(u.id)}>
                              <UserCheck size={9} className="mr-1" />Restore
                            </Button>
                          : <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] text-red-400 border-red-700/40 touch-manipulation" onClick={() => setConfirmSuspend(u.id)}>
                              <UserX size={9} className="mr-1" />Suspend
                            </Button>
                        }
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
            {/* Confirm dialog */}
            {confirmSuspend && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-card border border-border rounded-2xl p-4 mx-4 w-full max-w-xs space-y-3 shadow-2xl">
                  <p className="text-sm font-semibold">Suspend User?</p>
                  <p className="text-xs text-muted-foreground">This blocks the user from logging in. Reversible at any time.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => setConfirmSuspend(null)}>Cancel</Button>
                    <Button variant="destructive" className="flex-1 h-8 text-xs" onClick={() => suspendUser(confirmSuspend)}>Suspend</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Projects ─────────────────────────────────────────────────── */}
        {tab === "projects" && (
          <div className="p-3 space-y-2">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-2 text-muted-foreground" />
              <input className="w-full pl-7 pr-2.5 py-1.5 bg-input border border-border rounded-lg text-xs outline-none focus:ring-1 ring-primary"
                placeholder="Search projects…" value={projSearch} onChange={e => setProjSearch(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              {projects.length === 0
                ? <p className="text-xs text-muted-foreground italic text-center py-8">No projects found</p>
                : projects.map(p => (
                  <div key={p.id} className="rounded-xl border border-border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold">{p.name}</span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">{p.type}</Badge>
                          {p.locked && <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-red-400 border-red-700/40">Locked</Badge>}
                        </div>
                        {p.deployment && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[p.deployment.status] ?? "bg-muted-foreground")} />
                            <span className="text-[10px] capitalize">{p.deployment.status}</span>
                            {p.deployment.pid && <span className="text-[10px] text-muted-foreground">PID {p.deployment.pid}</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0 items-end">
                        {p.deployment?.status === "running" && (
                          <Button size="sm" variant="outline" className="h-6 px-1.5 text-[9px] text-red-400 border-red-700/40 touch-manipulation" onClick={() => stopDeployment(p.id)}>
                            <StopCircle size={9} className="mr-0.5" />Stop
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-6 px-1.5 text-[9px] touch-manipulation" onClick={() => lockProject(p.id, p.locked)}>
                          {p.locked ? <><Unlock size={9} className="mr-0.5" />Unlock</> : <><Lock size={9} className="mr-0.5" />Lock</>}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── Nodes ────────────────────────────────────────────────────── */}
        {tab === "nodes" && (
          <div className="p-3 space-y-3">
            <SectionTitle icon={<Server size={10} />}>Compute Nodes</SectionTitle>
            <div className="space-y-1.5">
              {nodes.map(n => (
                <div key={n.id} className="rounded-xl border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[n.status] ?? "bg-muted-foreground")} />
                        <span className="text-xs font-semibold">{n.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">{n.region}</Badge>
                      </div>
                      <div className="mt-1.5 space-y-1">
                        <div>
                          <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5"><span>CPU</span><span>{n.cpuPercent}%</span></div>
                          <Progress value={n.cpuPercent} className="h-1" />
                        </div>
                        <div>
                          <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
                            <span>Memory</span>
                            <span>{(n.memoryUsedMb / 1024).toFixed(1)}/{(n.memoryTotalMb / 1024).toFixed(1)}GB</span>
                          </div>
                          <Progress value={n.memoryTotalMb > 0 ? (n.memoryUsedMb / n.memoryTotalMb) * 100 : 0} className="h-1" />
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-1">{n.deploymentCount} deployments</p>
                    </div>
                    <div className="shrink-0">
                      {n.status !== "draining"
                        ? <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] text-amber-400 border-amber-700/40 touch-manipulation" onClick={() => drainNode(n.id)}>Drain</Button>
                        : <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-700/40">Draining</Badge>
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <SectionTitle icon={<Globe size={10} />}>Regions</SectionTitle>
            <div className="space-y-1.5">
              {regions.map(r => (
                <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl border border-border">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full", r.enabled ? "bg-green-400" : "bg-red-400")} />
                      <span className="text-xs font-medium">{r.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{r.nodeCount} nodes · {r.id}</div>
                    {!r.enabled && r.disabledInfo && <p className="text-[9px] text-red-400">{r.disabledInfo.reason}</p>}
                  </div>
                  <Button size="sm" variant="outline"
                    className={cn("h-6 px-2 text-[10px] touch-manipulation", r.enabled ? "text-red-400 border-red-700/40" : "text-green-400 border-green-700/40")}
                    onClick={() => toggleRegion(r.id, r.enabled)}>
                    {r.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Billing ──────────────────────────────────────────────────── */}
        {tab === "billing" && (
          <div className="p-3 space-y-2">
            <SectionTitle icon={<CreditCard size={10} />}>User Credits</SectionTitle>
            {billingUsers.length === 0
              ? <p className="text-xs text-muted-foreground italic text-center py-8">No billing data</p>
              : billingUsers.map((b: any) => (
                <div key={b.userId} className="rounded-xl border border-border p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-mono">{b.userId.slice(0, 14)}…</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span><span className="text-green-400 font-bold">{b.credits}</span> credits</span>
                        <span>·</span><span>{b.plan}</span>
                        <span>·</span><span>${(b.totalSpent ?? 0).toFixed(2)} spent</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] touch-manipulation" onClick={() => setCreditAdjust({ userId: b.userId, amount: "" })}>Adjust</Button>
                  </div>
                </div>
              ))
            }
            {creditAdjust && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-card border border-border rounded-2xl p-4 mx-4 w-full max-w-xs space-y-3 shadow-2xl">
                  <p className="text-sm font-semibold">Adjust Credits</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{creditAdjust.userId}</p>
                  <input type="number" className="w-full bg-input border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                    placeholder="Amount (+add / -deduct)" value={creditAdjust.amount}
                    onChange={e => setCreditAdjust({ ...creditAdjust, amount: e.target.value })} />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => setCreditAdjust(null)}>Cancel</Button>
                    <Button className="flex-1 h-8 text-xs" disabled={!creditAdjust.amount} onClick={adjustCredits}>Apply</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Plugins ──────────────────────────────────────────────────── */}
        {tab === "plugins" && (
          <div className="p-3 space-y-3">
            <SectionTitle icon={<Puzzle size={10} />}>Plugins</SectionTitle>
            <div className="space-y-1.5">
              {plugins.map(p => (
                <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground">v{p.version}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{p.author}</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 shrink-0",
                    p.status === "approved" ? "text-green-400 border-green-700/40" :
                    p.status === "rejected"  ? "text-red-400 border-red-700/40" :
                    "text-amber-400 border-amber-700/40")}>{p.status}</Badge>
                  {p.status === "pending" && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-6 px-1.5 text-[9px] text-green-400 border-green-700/40 touch-manipulation" onClick={() => approvePlugin(p.id, true)}>✓</Button>
                      <Button size="sm" variant="outline" className="h-6 px-1.5 text-[9px] text-red-400 border-red-700/40 touch-manipulation" onClick={() => approvePlugin(p.id, false)}>✗</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <SectionTitle icon={<BrainCircuit size={10} />}>Agents</SectionTitle>
            <div className="space-y-1.5">
              {agents.map(a => (
                <div key={a.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-border">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold">{a.name}</span>
                    <p className="text-[10px] text-muted-foreground">{a.type}</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0",
                    a.status === "active" ? "text-green-400 border-green-700/40" : "text-red-400 border-red-700/40")}>{a.status}</Badge>
                  <Button size="sm" variant="outline" className="h-6 px-1.5 text-[9px] touch-manipulation" onClick={() => toggleAgent(a.id, a.status === "active")}>
                    {a.status === "active" ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Security ─────────────────────────────────────────────────── */}
        {tab === "security" && (
          <div className="p-3 space-y-3">
            {secConfig ? (
              <>
                <div className="flex items-center justify-between">
                  <SectionTitle icon={<Settings size={10} />}>Security Config</SectionTitle>
                  {secEditing
                    ? <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => { setSecEditing(false); setSecDraft(secConfig); }}>Cancel</Button>
                        <Button size="sm" className="h-6 px-2 text-[10px]" onClick={saveSecurity}>Save</Button>
                      </div>
                    : <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] touch-manipulation" onClick={() => setSecEditing(true)}>Edit</Button>
                  }
                </div>
                {[
                  { key: "rateLimits",     title: "Rate Limits" },
                  { key: "resourceLimits", title: "Resource Limits" },
                ].map(({ key, title }) => (
                  <div key={key} className="rounded-xl border border-border p-2.5 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground">{title}</p>
                    {Object.entries((secConfig as any)[key] ?? {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                        {secEditing
                          ? <input type="number" className="w-20 bg-input border border-border rounded px-1.5 py-0.5 text-xs text-right outline-none"
                              value={(secDraft as any)[key]?.[k] ?? v as number}
                              onChange={e => setSecDraft((d: any) => ({ ...d, [key]: { ...d[key], [k]: Number(e.target.value) } }))} />
                          : <span className="text-xs font-semibold tabular-nums">{String(v)}</span>
                        }
                      </div>
                    ))}
                  </div>
                ))}
                <div className="rounded-xl border border-border p-2.5 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground">AI Guardrails</p>
                  {Object.entries(secConfig.aiGuardrails).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className={cn("text-xs font-semibold", typeof v === "boolean" ? (v ? "text-green-400" : "text-red-400") : "")}>
                        {Array.isArray(v) ? `${v.length} items` : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          </div>
        )}

        {/* ── Logs ─────────────────────────────────────────────────────── */}
        {tab === "logs" && (
          <div className="p-3 space-y-2">
            <div className="flex gap-1 p-1 bg-muted/30 rounded-xl">
              {(["system", "audit"] as const).map(t => (
                <button key={t} onClick={() => setLogTab(t)}
                  className={cn("flex-1 rounded-lg py-1 text-[10px] font-semibold transition-colors",
                    logTab === t ? "bg-background shadow text-foreground" : "text-muted-foreground")}>
                  {t === "system" ? "System Logs" : "Audit Trail"}
                </button>
              ))}
            </div>
            {logTab === "system" && (
              <>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Search size={10} className="absolute left-2 top-2 text-muted-foreground" />
                    <input className="w-full pl-6 pr-2 py-1.5 bg-input border border-border rounded-lg text-xs outline-none"
                      placeholder="Search…" value={logSearch} onChange={e => setLogSearch(e.target.value)} />
                  </div>
                  <select className="bg-input border border-border rounded-lg px-2 py-1.5 text-xs outline-none"
                    value={logLevel} onChange={e => setLogLevel(e.target.value)}>
                    <option value="">All</option>
                    {["debug","info","warn","error","fatal"].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-0.5">
                  {logs.map(l => (
                    <div key={l.id} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-muted/10">
                      <span className={cn("text-[9px] font-mono font-bold uppercase w-8 shrink-0 mt-0.5", LEVEL_COLOR[l.level])}>{l.level}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] leading-tight truncate">{l.message}</p>
                        <p className="text-[9px] text-muted-foreground">{l.service} · {timeAgo(l.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {logTab === "audit" && (
              <div className="space-y-1">
                {auditLogs.length === 0
                  ? <p className="text-xs text-muted-foreground italic text-center py-8">No audit events yet</p>
                  : auditLogs.map(e => (
                    <div key={e.id} className="p-2 rounded-lg border border-border/50 hover:bg-muted/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-amber-400">{e.action.replace(/_/g, " ")}</span>
                        <span className="text-[9px] text-muted-foreground">{timeAgo(e.timestamp)}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground font-mono">{e.adminUserId}</p>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {/* ── AI Assistant ─────────────────────────────────────────────── */}
        {tab === "ai" && (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-3 gap-1 p-1 bg-muted/30 rounded-xl">
              {([["summary","🏥 Health"],["suggestions","💡 Suggest"],["logs","📋 Logs"]] as const).map(([mode, label]) => (
                <button key={mode} onClick={() => setAiMode(mode)}
                  className={cn("rounded-lg py-1.5 text-[10px] font-semibold transition-colors",
                    aiMode === mode ? "bg-background shadow text-foreground" : "text-muted-foreground")}>
                  {label}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                {aiMode === "summary" && "Optional context for the health summary:"}
                {aiMode === "suggestions" && "Describe the current situation:"}
                {aiMode === "logs" && "Paste log lines to explain (one per line):"}
              </p>
              <textarea className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 ring-red-500 resize-none"
                rows={aiMode === "logs" ? 5 : 3}
                placeholder={
                  aiMode === "summary"     ? "e.g. High error rate after v2.1 deploy" :
                  aiMode === "suggestions" ? "e.g. CPU at 85%, 3 deploys failed" :
                  "[ERROR] Cannot connect\n[WARN] Timeout after 30s"
                }
                value={aiInput} onChange={e => setAiInput(e.target.value)} />
            </div>
            <Button className="w-full h-8 text-xs bg-red-700 hover:bg-red-600 touch-manipulation"
              disabled={aiLoading} onClick={runAi}>
              {aiLoading ? <><Loader2 size={11} className="animate-spin mr-1.5" />Analyzing…</> : <><BrainCircuit size={11} className="mr-1.5" />Analyze with AI</>}
            </Button>
            {aiOutput && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-3 py-1.5 border-b border-border bg-muted/10 text-[10px] font-semibold text-muted-foreground">AI Analysis</div>
                <ScrollArea className="max-h-64">
                  <div className="p-3 text-xs text-foreground whitespace-pre-wrap leading-relaxed font-mono">{aiOutput}</div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
