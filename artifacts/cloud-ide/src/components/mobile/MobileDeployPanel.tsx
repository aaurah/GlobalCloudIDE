import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Rocket, RefreshCw, CheckCircle, AlertTriangle, Clock, Loader2,
  Globe, ChevronDown, ChevronUp, GitBranch, Timer, TrendingUp, Activity
} from "lucide-react";

interface BuildCard {
  id: string;
  project: string;
  status: "success" | "failed" | "building" | "queued";
  branch: string;
  commit: string;
  duration?: number;
  startedAt: string;
  region: string;
  steps?: string[];
}

interface RegionStatus { id: string; label: string; status: string; latencyMs: number; }
interface MetricItem { label: string; value: string; trend: "up" | "down" | "flat"; icon: React.ReactNode; }

const MOCK_BUILDS: BuildCard[] = [
  {
    id: "1", project: "my-app", status: "success", branch: "main",
    commit: "feat: add auth flow", duration: 94,
    startedAt: new Date(Date.now() - 600000).toISOString(), region: "us-east",
    steps: ["Installing deps ✓", "Building ✓", "Container started ✓", "Health check passed ✓"],
  },
  {
    id: "2", project: "api-server", status: "building", branch: "feature/mobile",
    commit: "wip: mobile layout",
    startedAt: new Date(Date.now() - 45000).toISOString(), region: "eu-central",
    steps: ["Installing deps ✓", "Building..."],
  },
  {
    id: "3", project: "worker", status: "failed", branch: "main",
    commit: "fix: queue timeout", duration: 23,
    startedAt: new Date(Date.now() - 3600000).toISOString(), region: "us-west",
    steps: ["Installing deps ✓", "Building ✗ — timeout after 30s"],
  },
  {
    id: "4", project: "scheduler", status: "queued", branch: "main",
    commit: "chore: update deps",
    startedAt: new Date(Date.now() - 10000).toISOString(), region: "ap-southeast",
    steps: [],
  },
];

const STATUS_ICON: Record<BuildCard["status"], React.ReactNode> = {
  success:  <CheckCircle size={15} className="text-green-400 shrink-0" />,
  failed:   <AlertTriangle size={15} className="text-red-400 shrink-0" />,
  building: <Loader2 size={15} className="text-blue-400 animate-spin shrink-0" />,
  queued:   <Clock size={15} className="text-amber-400 shrink-0" />,
};

const STATUS_COLORS: Record<BuildCard["status"], string> = {
  success:  "text-green-400 bg-green-700/10 border-green-700/30",
  failed:   "text-red-400 bg-red-700/10 border-red-700/30",
  building: "text-blue-400 bg-blue-700/10 border-blue-700/30 animate-pulse",
  queued:   "text-amber-400 bg-amber-700/10 border-amber-700/30",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return `${Math.round(diff / 3600000)}h ago`;
}

function AnimatedSparkline({ values, color = "text-primary" }: { values: number[]; color?: string }) {
  const [rendered, setRendered] = useState(false);
  useEffect(() => { const t = setTimeout(() => setRendered(true), 100); return () => clearTimeout(t); }, []);

  const max = Math.max(...values, 1);
  const w = 100, h = 28;
  const pts = values
    .map((v, i) => `${Math.round((i / (values.length - 1)) * w)},${Math.round(h - (v / max) * h)}`)
    .join(" ");

  return (
    <svg
      width="100%" height={h} viewBox={`0 0 ${w} ${h}`}
      className={`${color} transition-opacity duration-500 ${rendered ? "opacity-100" : "opacity-0"}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        fill="url(#sparkGrad)"
        points={`0,${h} ${pts} ${w},${h}`}
        className="transition-all duration-1000"
      />
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" points={pts} />
    </svg>
  );
}

function DeploymentTimeline({ build }: { build: BuildCard }) {
  const steps = build.steps ?? [];
  if (steps.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">Waiting for runner...</p>;
  }
  return (
    <div className="space-y-1.5">
      {steps.map((step, i) => {
        const isDone = step.includes("✓");
        const isFail = step.includes("✗");
        const isActive = build.status === "building" && i === steps.length - 1 && !isDone && !isFail;
        return (
          <div key={i} className="flex items-start gap-2">
            <div className={`mt-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
              isDone ? "bg-green-700/30 text-green-400" :
              isFail ? "bg-red-700/30 text-red-400" :
              isActive ? "bg-blue-700/30 text-blue-400" :
              "bg-muted/40 text-muted-foreground"
            }`}>
              {isDone ? <CheckCircle size={9} /> : isFail ? <AlertTriangle size={9} /> : isActive ? <Loader2 size={9} className="animate-spin" /> : <Clock size={9} />}
            </div>
            <span className={`text-[10px] leading-tight font-mono ${
              isDone ? "text-green-400" : isFail ? "text-red-400" : isActive ? "text-blue-300" : "text-muted-foreground"
            }`}>{step.replace(" ✓", "").replace(" ✗", "")}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MobileDeployPanel() {
  const { token } = usePlatform();
  const [regions, setRegions] = useState<RegionStatus[]>([]);
  const [builds, setBuilds] = useState<BuildCard[]>(MOCK_BUILDS);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [cpuHistory, setCpuHistory] = useState([22, 35, 28, 51, 44, 67, 55, 48, 72, 61]);
  const [memHistory, setMemHistory] = useState([45, 48, 52, 49, 55, 58, 54, 60, 57, 63]);
  const listRef = useRef<HTMLDivElement>(null);
  const pullStartY = useRef(0);

  // Simulate live chart updates
  useEffect(() => {
    const id = setInterval(() => {
      setCpuHistory(prev => [...prev.slice(1), Math.min(95, Math.max(10, prev[prev.length - 1] + (Math.random() - 0.5) * 15))]);
      setMemHistory(prev => [...prev.slice(1), Math.min(90, Math.max(30, prev[prev.length - 1] + (Math.random() - 0.5) * 8))]);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const metrics: MetricItem[] = [
    { label: "Deployments",  value: "12",  trend: "up",   icon: <Rocket size={12} /> },
    { label: "Success rate", value: "91%", trend: "up",   icon: <CheckCircle size={12} /> },
    { label: "Avg build",    value: "78s", trend: "down",  icon: <Timer size={12} /> },
    { label: "Active now",   value: "3",   trend: "flat",  icon: <Activity size={12} /> },
  ];

  const loadRegions = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetch("/api/observability/region-health", {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      setRegions(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  }, [token]);

  useEffect(() => { loadRegions(); }, [loadRegions]);

  const onTouchStart = (e: React.TouchEvent) => { pullStartY.current = e.touches[0].clientY; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - pullStartY.current;
    if (dy > 60 && listRef.current?.scrollTop === 0) {
      setIsPulling(true);
      setTimeout(() => { setIsPulling(false); loadRegions(); }, 1200);
    }
  };

  const trendIcon = (t: MetricItem["trend"]) =>
    t === "up" ? "↑" : t === "down" ? "↓" : "→";
  const trendColor = (t: MetricItem["trend"]) =>
    t === "up" ? "text-green-400" : t === "down" ? "text-amber-400" : "text-muted-foreground";

  return (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto overscroll-contain"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {isPulling && (
        <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin mr-2" /> Refreshing...
        </div>
      )}

      <div className="p-3 space-y-4 pb-6">
        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-2">
          {metrics.map(m => (
            <div key={m.label} className="p-3 rounded-xl border border-border bg-background">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">{m.icon}</span>
                <span className={`text-[10px] font-bold ${trendColor(m.trend)}`}>{trendIcon(m.trend)}</span>
              </div>
              <div className="text-xl font-bold tabular-nums leading-none">{m.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Live charts */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl border border-border bg-background">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1"><TrendingUp size={10} /> CPU</span>
              <span className="text-xs font-bold text-primary tabular-nums">{Math.round(cpuHistory[cpuHistory.length - 1])}%</span>
            </div>
            <AnimatedSparkline values={cpuHistory} color="text-primary" />
          </div>
          <div className="p-3 rounded-xl border border-border bg-background">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1"><Activity size={10} /> MEM</span>
              <span className="text-xs font-bold text-purple-400 tabular-nums">{Math.round(memHistory[memHistory.length - 1])}%</span>
            </div>
            <AnimatedSparkline values={memHistory} color="text-purple-400" />
          </div>
        </div>

        {/* Region health */}
        {regions.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Globe size={10} /> Regions
            </div>
            <div className="space-y-1.5">
              {regions.map(r => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      r.status === "healthy" ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" :
                      r.status === "degraded" ? "bg-amber-400" : "bg-red-400"
                    }`} />
                    <span className="text-xs">{r.label ?? r.id}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{r.latencyMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Build cards */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Builds</div>
            <Button variant="ghost" size="icon" className="h-6 w-6 touch-manipulation" onClick={loadRegions}>
              <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
            </Button>
          </div>
          <div className="space-y-2">
            {builds.map(build => (
              <div key={build.id} className="rounded-xl border border-border bg-background overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-3 py-3 text-left touch-manipulation active:bg-muted/30 transition-colors"
                  onClick={() => setExpandedBuild(expandedBuild === build.id ? null : build.id)}
                >
                  {STATUS_ICON[build.status]}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold truncate">{build.project}</span>
                      <Badge className={`text-[9px] px-1.5 py-0 border ${STATUS_COLORS[build.status]}`}>{build.status}</Badge>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                      <GitBranch size={9} /><span className="truncate">{build.commit}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground">{timeAgo(build.startedAt)}</div>
                    {build.duration && <div className="text-[9px] text-muted-foreground/60">{build.duration}s</div>}
                  </div>
                  {expandedBuild === build.id
                    ? <ChevronUp size={12} className="text-muted-foreground shrink-0" />
                    : <ChevronDown size={12} className="text-muted-foreground shrink-0" />}
                </button>

                {expandedBuild === build.id && (
                  <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2.5 animate-in slide-in-from-top-1 duration-150">
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-center gap-1"><GitBranch size={9} /><span className="text-muted-foreground">Branch: </span><span className="font-mono ml-1 truncate">{build.branch}</span></div>
                      <div className="flex items-center gap-1"><Globe size={9} /><span className="text-muted-foreground">Region: </span><span className="ml-1">{build.region}</span></div>
                    </div>

                    {/* Deployment timeline */}
                    <div className="bg-black/20 rounded-lg p-2.5">
                      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Build Timeline</div>
                      <DeploymentTimeline build={build} />
                    </div>

                    {build.status === "failed" && (
                      <Button size="sm" className="w-full h-7 text-xs touch-manipulation active:scale-95" variant="outline">
                        <RefreshCw size={11} className="mr-1.5" /> Retry Build
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
