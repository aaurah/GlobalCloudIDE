import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";
import {
  Rocket, Square, RefreshCw, Loader2, CheckCircle2, XCircle, Clock,
  ChevronRight, ChevronDown, GitBranch, Globe, ShieldCheck, Zap,
  RotateCcw, Lock, Eye, EyeOff, Trash2, Plus, Play, AlertTriangle,
  BrainCircuit, Activity, ArrowRight, Terminal, Check, Copy, Info,
  TrendingUp, TrendingDown, Minus
} from "lucide-react";
import { cn } from "../../lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type EnvName = "development" | "staging" | "production";
type StageStatus = "pending" | "running" | "passed" | "failed" | "skipped";

interface EnvConfig {
  name: EnvName;
  displayName: string;
  color: string;
  status: "idle" | "building" | "running" | "failed" | "stopped";
  version?: string;
  commitHash?: string;
  deployedAt?: string;
  url?: string;
}

interface DeploymentRecord {
  id: string;
  environment: EnvName;
  version: string;
  commitHash: string;
  timestamp: string;
  status: "success" | "failed" | "rolled-back" | "in-progress";
  strategy: "standard" | "blue-green" | "canary";
  durationMs?: number;
  rolledBackAt?: string;
}

interface SlotState {
  version: string;
  deployedAt: string;
  status: "deploying" | "healthy" | "unhealthy" | "idle";
}

interface BlueGreenState {
  active: "blue" | "green" | null;
  blue: SlotState | null;
  green: SlotState | null;
}

interface CanaryState {
  status: "idle" | "running" | "aborted" | "complete";
  trafficPercent: number;
  stableVersion: string;
  canaryVersion: string;
  errorRate: number;
  latencyMs: number;
  abortReason?: string;
  startedAt?: string;
}

interface SecretMeta {
  id: string;
  key: string;
  environment: string;
  createdAt: string;
}

interface PipelineStage {
  name: string;
  command: string;
  status: StageStatus;
  durationMs?: number;
  logs: string[];
}

interface Pipeline {
  id: string;
  name: string;
  status: "pending" | "running" | "passed" | "failed" | "cancelled";
  stages: PipelineStage[];
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENV_COLORS: Record<EnvName, string> = {
  development: "text-blue-400 bg-blue-900/20 border-blue-700/40",
  staging:     "text-amber-400 bg-amber-900/20 border-amber-700/40",
  production:  "text-green-400 bg-green-900/20 border-green-700/40",
};

const ENV_DOT: Record<EnvName, string> = {
  development: "bg-blue-400",
  staging:     "bg-amber-400",
  production:  "bg-green-400",
};

function timeAgo(iso?: string) {
  if (!iso) return "–";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function fmtMs(ms?: number) {
  if (!ms) return "–";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const STATUS_ICON = {
  idle:     <Clock size={12} className="text-muted-foreground" />,
  building: <Loader2 size={12} className="animate-spin text-amber-400" />,
  running:  <CheckCircle2 size={12} className="text-green-400" />,
  failed:   <XCircle size={12} className="text-red-400" />,
  stopped:  <Square size={12} className="text-muted-foreground" />,
  pending:  <Clock size={12} className="text-muted-foreground" />,
  passed:   <CheckCircle2 size={12} className="text-green-400" />,
  skipped:  <Minus size={12} className="text-muted-foreground" />,
  success:  <CheckCircle2 size={12} className="text-green-400" />,
  "in-progress": <Loader2 size={12} className="animate-spin text-blue-400" />,
  "rolled-back": <RotateCcw size={12} className="text-amber-400" />,
  cancelled: <XCircle size={12} className="text-muted-foreground" />,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/10 shrink-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {icon}{title}
      </div>
      {action}
    </div>
  );
}

function LogBox({ lines, className }: { lines: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div ref={ref} className={cn("overflow-y-auto bg-black/30 rounded-lg font-mono text-[10px] text-muted-foreground p-2 space-y-0.5", className)}>
      {lines.length === 0
        ? <span className="italic">No output yet.</span>
        : lines.map((l, i) => (
          <div key={i} className={l.includes("error") || l.includes("Error") || l.includes("failed") ? "text-red-400" :
            l.includes("✅") || l.includes("passed") || l.includes("success") ? "text-green-400" :
            l.includes("⚠") || l.includes("warn") ? "text-amber-400" : ""}>
            {l}
          </div>
        ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DeployConsole() {
  const { token, currentProject } = usePlatform();
  const projectId = currentProject?.id ?? "";

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  // ── Environments tab ──────────────────────────────────────────────────────

  const [environments, setEnvironments] = useState<EnvConfig[]>([]);
  const [deployingEnv, setDeployingEnv] = useState<EnvName | null>(null);
  const [envLogs, setEnvLogs] = useState<string[]>([]);

  const loadEnvironments = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const r = await fetch(`/api/envs/${projectId}/list`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setEnvironments(d.environments ?? []); }
    } catch {}
  }, [projectId, token, authHeaders]);

  useEffect(() => { loadEnvironments(); }, [loadEnvironments]);

  const deployToEnv = async (env: EnvName) => {
    if (!projectId) return;
    setDeployingEnv(env);
    setEnvLogs([]);
    try {
      const r = await fetch(`/api/deploy/${projectId}/start`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ type: currentProject?.type ?? "node", environment: env }),
      });
      if (!r.body) throw new Error("No stream");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.message) setEnvLogs(p => [...p, d.message]);
            if (d.status === "running" || d.status === "failed") {
              loadEnvironments();
              // Record in history
              await fetch(`/api/releases/${projectId}/record`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                  environment: env,
                  version: `v${Date.now().toString(36)}`,
                  commitHash: "HEAD",
                  status: d.status === "running" ? "success" : "failed",
                  strategy: "standard",
                }),
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setEnvLogs(p => [...p, `[error] ${e.message}`]);
    } finally {
      setDeployingEnv(null);
      loadEnvironments();
    }
  };

  const promoteEnv = async (from: EnvName, to: EnvName) => {
    if (!projectId) return;
    try {
      await fetch(`/api/envs/${projectId}/${from}/promote`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ toEnv: to }),
      });
      loadEnvironments();
    } catch {}
  };

  // ── Blue-Green tab ────────────────────────────────────────────────────────

  const [bgState, setBgState] = useState<BlueGreenState>({ active: null, blue: null, green: null });
  const [bgLogs, setBgLogs] = useState<string[]>([]);
  const [bgDeploying, setBgDeploying] = useState(false);

  const loadBgState = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const r = await fetch(`/api/releases/${projectId}/blue-green/status`, { headers: authHeaders() });
      if (r.ok) setBgState(await r.json());
    } catch {}
  }, [projectId, token, authHeaders]);

  useEffect(() => { loadBgState(); }, [loadBgState]);

  const deployGreen = async () => {
    if (!projectId) return;
    setBgDeploying(true);
    setBgLogs([]);
    try {
      const r = await fetch(`/api/releases/${projectId}/blue-green/start`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ version: `v${Date.now().toString(36)}` }),
      });
      if (!r.body) throw new Error("No stream");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.message) setBgLogs(p => [...p, d.message]);
            if (d.state) setBgState(d.state);
          } catch {}
        }
      }
    } finally {
      setBgDeploying(false);
      loadBgState();
    }
  };

  const bgSwitch = async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/releases/${projectId}/blue-green/switch`, { method: "POST", headers: authHeaders() });
      const d = await r.json();
      if (d.state) setBgState(d.state);
    } catch {}
  };

  const bgRollback = async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/releases/${projectId}/blue-green/rollback`, { method: "POST", headers: authHeaders() });
      const d = await r.json();
      if (d.state) setBgState(d.state);
    } catch {}
  };

  // ── Canary tab ────────────────────────────────────────────────────────────

  const [canary, setCanary] = useState<CanaryState>({
    status: "idle", trafficPercent: 0, stableVersion: "v1.0.0",
    canaryVersion: "", errorRate: 0, latencyMs: 0,
  });
  const [canaryVersion, setCanaryVersion] = useState("");

  const loadCanary = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const r = await fetch(`/api/releases/${projectId}/canary/status`, { headers: authHeaders() });
      if (r.ok) setCanary(await r.json());
    } catch {}
  }, [projectId, token, authHeaders]);

  useEffect(() => { loadCanary(); }, [loadCanary]);

  const startCanary = async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/releases/${projectId}/canary/start`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ canaryVersion: canaryVersion || `v${Date.now().toString(36)}`, stableVersion: "v1.0.0" }),
      });
      const d = await r.json();
      if (d.state) setCanary(d.state);
    } catch {}
  };

  const advanceCanary = async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/releases/${projectId}/canary/progress`, { method: "POST", headers: authHeaders() });
      const d = await r.json();
      if (d.state) setCanary(d.state);
    } catch {}
  };

  const abortCanary = async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/releases/${projectId}/canary/abort`, { method: "POST", headers: authHeaders() });
      const d = await r.json();
      if (d.state) setCanary(d.state);
    } catch {}
  };

  // ── History tab ───────────────────────────────────────────────────────────

  const [historyList, setHistoryList] = useState<DeploymentRecord[]>([]);
  const [rollbackId, setRollbackId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const r = await fetch(`/api/releases/${projectId}/history?limit=20`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setHistoryList(d.history ?? []); }
    } catch {}
  }, [projectId, token, authHeaders]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const doRollback = async (deploymentId: string) => {
    if (!projectId) return;
    setRollbackId(deploymentId);
    try {
      await fetch(`/api/releases/${projectId}/rollback`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ deploymentId, reason: "Manual rollback from console" }),
      });
      loadHistory();
      loadEnvironments();
    } finally {
      setRollbackId(null);
    }
  };

  // ── Secrets tab ───────────────────────────────────────────────────────────

  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [secretEnv, setSecretEnv] = useState<string>("all");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showValues, setShowValues] = useState<Record<string, string>>({});
  const [savingSecret, setSavingSecret] = useState(false);

  const loadSecrets = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const r = await fetch(`/api/secrets/${projectId}/list`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setSecrets(d.secrets ?? []); }
    } catch {}
  }, [projectId, token, authHeaders]);

  useEffect(() => { loadSecrets(); }, [loadSecrets]);

  const addSecret = async () => {
    if (!newKey.trim() || !newValue.trim() || !projectId) return;
    setSavingSecret(true);
    try {
      await fetch(`/api/secrets/${projectId}/set`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ key: newKey.toUpperCase(), value: newValue, environment: secretEnv }),
      });
      setNewKey(""); setNewValue(""); loadSecrets();
    } finally { setSavingSecret(false); }
  };

  const deleteSecret = async (key: string, environment: string) => {
    if (!projectId) return;
    try {
      await fetch(`/api/secrets/${projectId}/delete`, {
        method: "DELETE", headers: authHeaders(),
        body: JSON.stringify({ key, environment }),
      });
      loadSecrets();
    } catch {}
  };

  const revealSecret = async (key: string, env: string) => {
    if (!projectId) return;
    const k = `${key}:${env}`;
    if (showValues[k]) { setShowValues(p => { const n = { ...p }; delete n[k]; return n; }); return; }
    try {
      const r = await fetch(`/api/secrets/${projectId}/get?key=${key}&env=${env}`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setShowValues(p => ({ ...p, [k]: d.value })); }
    } catch {}
  };

  // ── Pipeline tab ─────────────────────────────────────────────────────────

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const loadPipelines = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const r = await fetch(`/api/pipelines/${projectId}/list`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setPipelines(d.pipelines ?? []); }
    } catch {}
  }, [projectId, token, authHeaders]);

  useEffect(() => { loadPipelines(); }, [loadPipelines]);

  const runPipeline = async () => {
    if (!projectId) return;
    setRunningPipeline(true);
    setPipelineLogs([]);
    setActivePipeline(null);
    try {
      const r = await fetch(`/api/pipelines/${projectId}/run`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (!r.body) throw new Error("No stream");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.message) setPipelineLogs(p => [...p, `[${d.stage ?? "pipeline"}] ${d.message}`]);
            if (d.type === "stage_start") setPipelineLogs(p => [...p, `▶ Stage: ${d.stage}`]);
            if (d.type === "stage_passed") setPipelineLogs(p => [...p, `✅ ${d.stage} (${fmtMs(d.durationMs)})`]);
            if (d.type === "stage_failed") setPipelineLogs(p => [...p, `❌ ${d.stage} FAILED`]);
            if (d.type === "stage_log") setPipelineLogs(p => [...p, `  ${d.message}`]);
            if (d.pipeline) setActivePipeline(d.pipeline);
          } catch {}
        }
      }
    } finally {
      setRunningPipeline(false);
      loadPipelines();
    }
  };

  // ── AI Assistant tab ─────────────────────────────────────────────────────

  const [aiMode, setAiMode] = useState<"plan" | "summary" | "incident">("plan");
  const [aiInput, setAiInput] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const runAi = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiOutput("");
    const endpoints = {
      plan:     "/api/deploy/ai/plan",
      summary:  "/api/deploy/ai/summary",
      incident: "/api/deploy/ai/incident-help",
    };
    const bodies = {
      plan:     { projectId, diffSummary: aiInput, environments: ["production"] },
      summary:  { projectId, commits: aiInput.split("\n").filter(Boolean), version: "latest" },
      incident: { projectId, errorMessage: aiInput, environment: "production", service: currentProject?.name },
    };
    try {
      const r = await fetch(endpoints[aiMode], {
        method: "POST", headers: authHeaders(), body: JSON.stringify(bodies[aiMode]),
      });
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

  // ── No project guard ──────────────────────────────────────────────────────

  if (!currentProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Rocket className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground font-medium">No project selected</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Open a project from the toolbar to use the deployment console</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 text-foreground">
      {/* Project header */}
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket size={13} className="text-primary" />
          <span className="text-xs font-semibold truncate max-w-[140px]">{currentProject.name}</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">{currentProject.type ?? "node"}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { loadEnvironments(); loadHistory(); loadPipelines(); loadBgState(); loadCanary(); loadSecrets(); }}>
          <RefreshCw size={11} />
        </Button>
      </div>

      <Tabs defaultValue="environments" className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0 h-8 mx-3 mt-2 bg-muted/30 grid grid-cols-7 gap-0 text-[9px]">
          {[
            ["environments", "Envs"],
            ["blue-green", "B/G"],
            ["canary", "Canary"],
            ["history", "History"],
            ["secrets", "Secrets"],
            ["pipeline", "Pipeline"],
            ["ai", "AI"],
          ].map(([val, label]) => (
            <TabsTrigger key={val} value={val} className="h-6 text-[9px] px-0 data-[state=active]:bg-background">{label}</TabsTrigger>
          ))}
        </TabsList>

        {/* ── Environments ─────────────────────────────────────────────── */}
        <TabsContent value="environments" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="p-3 space-y-2">
            {(["development", "staging", "production"] as EnvName[]).map((env) => {
              const cfg = environments.find(e => e.name === env);
              const isDeploying = deployingEnv === env;
              return (
                <div key={env} className={cn("rounded-xl border p-3 space-y-2", ENV_COLORS[env])}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", ENV_DOT[env],
                        cfg?.status === "running" ? "shadow-[0_0_6px_currentColor]" : "opacity-60")} />
                      <span className="text-xs font-bold capitalize">{env}</span>
                      {cfg?.version && <Badge variant="outline" className="text-[9px] px-1.5 py-0">{cfg.version}</Badge>}
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      {STATUS_ICON[cfg?.status ?? "idle"]}
                      <span className="capitalize text-muted-foreground">{cfg?.status ?? "idle"}</span>
                    </div>
                  </div>

                  {cfg?.deployedAt && (
                    <p className="text-[10px] text-muted-foreground">Deployed {timeAgo(cfg.deployedAt)}</p>
                  )}

                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-[10px] touch-manipulation active:scale-95"
                      disabled={isDeploying || cfg?.status === "building"}
                      onClick={() => deployToEnv(env)}
                    >
                      {isDeploying ? <><Loader2 size={10} className="animate-spin mr-1" />Deploying…</> : <><Rocket size={10} className="mr-1" />Deploy</>}
                    </Button>
                    {env === "development" && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 touch-manipulation" onClick={() => promoteEnv("development", "staging")}>
                        <ArrowRight size={10} className="mr-1" />Staging
                      </Button>
                    )}
                    {env === "staging" && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 touch-manipulation" onClick={() => promoteEnv("staging", "production")}>
                        <ArrowRight size={10} className="mr-1" />Prod
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {envLogs.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1.5">Deploy output:</p>
                <LogBox lines={envLogs} className="max-h-36" />
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Blue-Green ───────────────────────────────────────────────── */}
        <TabsContent value="blue-green" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="p-3 space-y-3">
            {/* Slots */}
            <div className="grid grid-cols-2 gap-2">
              {(["blue", "green"] as const).map(slot => {
                const s = bgState[slot];
                const isActive = bgState.active === slot;
                return (
                  <div key={slot} className={cn(
                    "rounded-xl border p-2.5 space-y-1.5",
                    slot === "blue" ? "border-blue-700/40 bg-blue-900/10" : "border-green-700/40 bg-green-900/10",
                    isActive && "ring-1 ring-primary"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs font-bold capitalize", slot === "blue" ? "text-blue-400" : "text-green-400")}>
                        {slot} {isActive && "🔴 live"}
                      </span>
                      {s && <Badge variant="outline" className="text-[9px] px-1.5 py-0">{s.status}</Badge>}
                    </div>
                    {s ? (
                      <>
                        <p className="text-[10px] font-mono text-muted-foreground">{s.version}</p>
                        <p className="text-[9px] text-muted-foreground">{timeAgo(s.deployedAt)}</p>
                      </>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">Empty</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Button className="w-full h-8 text-xs touch-manipulation active:scale-95" onClick={deployGreen} disabled={bgDeploying}>
                {bgDeploying ? <><Loader2 size={11} className="animate-spin mr-1.5" />Deploying Green…</> : <><Zap size={11} className="mr-1.5" />Deploy to Green</>}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-8 text-xs touch-manipulation active:scale-95"
                  disabled={bgState.green?.status !== "healthy"} onClick={bgSwitch}>
                  <ArrowRight size={11} className="mr-1" />Switch Live
                </Button>
                <Button variant="outline" className="h-8 text-xs text-amber-400 border-amber-700/40 hover:bg-amber-900/20 touch-manipulation active:scale-95"
                  disabled={!bgState.blue} onClick={bgRollback}>
                  <RotateCcw size={11} className="mr-1" />Rollback
                </Button>
              </div>
            </div>

            {bgLogs.length > 0 && <LogBox lines={bgLogs} className="max-h-36" />}
          </div>
        </TabsContent>

        {/* ── Canary ──────────────────────────────────────────────────── */}
        <TabsContent value="canary" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="p-3 space-y-3">
            {/* Status card */}
            <div className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Canary Status</span>
                <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0",
                  canary.status === "running" ? "text-amber-400 border-amber-700/40" :
                  canary.status === "complete" ? "text-green-400 border-green-700/40" :
                  canary.status === "aborted" ? "text-red-400 border-red-700/40" : ""
                )}>{canary.status}</Badge>
              </div>

              {canary.status !== "idle" && (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Traffic to canary</span>
                      <span className="font-bold text-foreground">{canary.trafficPercent}%</span>
                    </div>
                    <Progress value={canary.trafficPercent} className="h-2" />
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>Stable: {canary.stableVersion}</span>
                      <span>Canary: {canary.canaryVersion}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/20 p-2">
                      <div className="text-[9px] text-muted-foreground">Error Rate</div>
                      <div className={cn("text-sm font-bold tabular-nums", canary.errorRate > 5 ? "text-red-400" : "text-green-400")}>
                        {canary.errorRate.toFixed(1)}%
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/20 p-2">
                      <div className="text-[9px] text-muted-foreground">Avg Latency</div>
                      <div className="text-sm font-bold tabular-nums">{Math.round(canary.latencyMs)}ms</div>
                    </div>
                  </div>

                  {canary.abortReason && (
                    <div className="flex items-start gap-1.5 p-2 bg-red-900/20 rounded-lg text-[10px] text-red-400">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />{canary.abortReason}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Controls */}
            {canary.status === "idle" && (
              <div className="space-y-2">
                <input
                  className="w-full bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 ring-primary"
                  placeholder="Canary version (e.g. v2.1.0)"
                  value={canaryVersion}
                  onChange={e => setCanaryVersion(e.target.value)}
                />
                <Button className="w-full h-8 text-xs touch-manipulation active:scale-95" onClick={startCanary}>
                  <Play size={11} className="mr-1.5" />Start Canary Rollout
                </Button>
              </div>
            )}
            {canary.status === "running" && (
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-8 text-xs touch-manipulation active:scale-95" onClick={advanceCanary}>
                  <ChevronRight size={11} className="mr-1" />Advance
                </Button>
                <Button variant="destructive" className="h-8 text-xs touch-manipulation active:scale-95" onClick={abortCanary}>
                  Abort
                </Button>
              </div>
            )}
            {(canary.status === "complete" || canary.status === "aborted") && (
              <Button variant="outline" className="w-full h-8 text-xs" onClick={() => setCanary(c => ({ ...c, status: "idle", trafficPercent: 0 }))}>
                Reset
              </Button>
            )}
          </div>
        </TabsContent>

        {/* ── History ──────────────────────────────────────────────────── */}
        <TabsContent value="history" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="p-3 space-y-1.5">
            {historyList.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-8">No deployments yet.</p>
            ) : historyList.map(rec => (
              <div key={rec.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-border hover:bg-muted/10 transition-colors">
                <div className="shrink-0">{STATUS_ICON[rec.status]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium">{rec.version}</span>
                    <Badge variant="outline" className={cn("text-[9px] px-1 py-0", ENV_COLORS[rec.environment])}>{rec.environment}</Badge>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{rec.strategy}</Badge>
                  </div>
                  <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <span className="font-mono">{rec.commitHash?.slice(0, 7)}</span>
                    <span>·</span>
                    <span>{timeAgo(rec.timestamp)}</span>
                    {rec.durationMs && <><span>·</span><span>{fmtMs(rec.durationMs)}</span></>}
                  </div>
                </div>
                {rec.status === "success" && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 px-2 text-[10px] text-amber-400 hover:bg-amber-900/20 shrink-0 touch-manipulation"
                    disabled={rollbackId === rec.id}
                    onClick={() => doRollback(rec.id)}
                  >
                    {rollbackId === rec.id ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} className="mr-1" />}
                    Rollback
                  </Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Secrets ──────────────────────────────────────────────────── */}
        <TabsContent value="secrets" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="p-3 space-y-3">
            {/* Add secret */}
            <div className="rounded-xl border border-border p-2.5 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground">Add Secret</p>
              <input
                className="w-full bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:ring-1 ring-primary uppercase"
                placeholder="KEY_NAME"
                value={newKey}
                onChange={e => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              />
              <input
                className="w-full bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:ring-1 ring-primary"
                placeholder="secret value"
                type="password"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 bg-input border border-border rounded-lg px-2 py-1.5 text-xs outline-none"
                  value={secretEnv}
                  onChange={e => setSecretEnv(e.target.value)}
                >
                  <option value="all">All Environments</option>
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
                <Button size="sm" className="h-8 px-3 text-xs touch-manipulation" disabled={!newKey || !newValue || savingSecret} onClick={addSecret}>
                  {savingSecret ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} className="mr-1" />}
                  Add
                </Button>
              </div>
            </div>

            {/* Secret list */}
            <div className="space-y-1.5">
              {secrets.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-4">No secrets stored.</p>
              ) : secrets.map(s => {
                const revealKey = `${s.key}:${s.environment}`;
                const revealed = showValues[revealKey];
                return (
                  <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                    <Lock size={10} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono font-semibold">{s.key}</span>
                      <span className="ml-2 text-[9px] text-muted-foreground">{s.environment}</span>
                      {revealed && <p className="text-[10px] font-mono text-green-400 mt-0.5 break-all">{revealed}</p>}
                    </div>
                    <button onClick={() => revealSecret(s.key, s.environment)} className="text-muted-foreground hover:text-foreground p-1 touch-manipulation">
                      {revealed ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                    <button onClick={() => deleteSecret(s.key, s.environment)} className="text-muted-foreground hover:text-red-400 p-1 touch-manipulation">
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── Pipeline ──────────────────────────────────────────────────── */}
        <TabsContent value="pipeline" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="p-3 space-y-3">
            <Button className="w-full h-8 text-xs touch-manipulation active:scale-95" onClick={runPipeline} disabled={runningPipeline}>
              {runningPipeline ? <><Loader2 size={11} className="animate-spin mr-1.5" />Running Pipeline…</> : <><Play size={11} className="mr-1.5" />Run CI/CD Pipeline</>}
            </Button>

            {/* Active pipeline stages */}
            {(activePipeline ?? pipelines[0]) && (() => {
              const pl = activePipeline ?? pipelines[0];
              return (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="px-3 py-2 flex items-center justify-between border-b border-border bg-muted/10">
                    <span className="text-xs font-semibold">{pl.name}</span>
                    <div className="flex items-center gap-1.5">
                      {STATUS_ICON[pl.status]}
                      <span className="text-[10px] capitalize">{pl.status}</span>
                      {pl.durationMs && <span className="text-[9px] text-muted-foreground">· {fmtMs(pl.durationMs)}</span>}
                    </div>
                  </div>
                  {pl.stages.map(stage => (
                    <div key={stage.name}>
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/10 transition-colors border-b border-border/50 touch-manipulation"
                        onClick={() => setExpandedStage(expandedStage === stage.name ? null : stage.name)}
                      >
                        {STATUS_ICON[stage.status]}
                        <span className="text-xs flex-1">{stage.name}</span>
                        {stage.durationMs && <span className="text-[9px] text-muted-foreground">{fmtMs(stage.durationMs)}</span>}
                        {stage.logs.length > 0 && (expandedStage === stage.name ? <ChevronDown size={10} /> : <ChevronRight size={10} />)}
                      </button>
                      {expandedStage === stage.name && stage.logs.length > 0 && (
                        <div className="border-b border-border/50">
                          <LogBox lines={stage.logs} className="max-h-28 rounded-none" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Live log stream */}
            {pipelineLogs.length > 0 && <LogBox lines={pipelineLogs} className="max-h-40" />}

            {/* Past pipelines */}
            {pipelines.length > 1 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Past runs</p>
                <div className="space-y-1">
                  {pipelines.slice(1, 5).map(pl => (
                    <div key={pl.id} className="flex items-center gap-2 p-2 rounded-lg border border-border text-xs">
                      {STATUS_ICON[pl.status]}
                      <span className="flex-1 text-muted-foreground">{timeAgo(pl.startedAt)}</span>
                      <span className="text-[10px] capitalize">{pl.status}</span>
                      {pl.durationMs && <span className="text-[9px] text-muted-foreground">{fmtMs(pl.durationMs)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── AI Assistant ─────────────────────────────────────────────── */}
        <TabsContent value="ai" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="p-3 space-y-3">
            {/* Mode selector */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-muted/30 rounded-xl">
              {([
                ["plan", "🎯 Plan"],
                ["summary", "📋 Summary"],
                ["incident", "🚨 Incident"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setAiMode(mode)}
                  className={cn(
                    "rounded-lg py-1.5 text-[10px] font-semibold transition-colors touch-manipulation",
                    aiMode === mode ? "bg-background shadow text-foreground" : "text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Input */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                {aiMode === "plan" && "Describe the changes in this release:"}
                {aiMode === "summary" && "Paste commit messages (one per line):"}
                {aiMode === "incident" && "Describe the error or paste relevant logs:"}
              </p>
              <textarea
                className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 ring-primary resize-none"
                rows={4}
                placeholder={
                  aiMode === "plan" ? "e.g. Added OAuth login, refactored payment flow, updated 12 files" :
                  aiMode === "summary" ? "feat: add OAuth\nfix: payment race condition\nchore: bump deps" :
                  "e.g. Error: ECONNREFUSED 127.0.0.1:5432 — database connection failed"
                }
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
              />
            </div>

            <Button className="w-full h-8 text-xs touch-manipulation active:scale-95" disabled={aiLoading || !aiInput.trim()} onClick={runAi}>
              {aiLoading ? <><Loader2 size={11} className="animate-spin mr-1.5" />Thinking…</> : <><BrainCircuit size={11} className="mr-1.5" />Ask AI</>}
            </Button>

            {/* Output */}
            {aiOutput && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/10">
                  <span className="text-[10px] font-semibold text-muted-foreground">AI Response</span>
                  <button
                    className="text-muted-foreground hover:text-foreground p-1 touch-manipulation"
                    onClick={() => navigator.clipboard.writeText(aiOutput)}
                  >
                    <Copy size={10} />
                  </button>
                </div>
                <ScrollArea className="max-h-64">
                  <div className="p-3 text-xs text-foreground whitespace-pre-wrap leading-relaxed font-mono">
                    {aiOutput}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
