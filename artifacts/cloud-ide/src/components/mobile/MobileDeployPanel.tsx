import React, { useState, useEffect, useRef } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Rocket, RefreshCw, CheckCircle, AlertTriangle, Clock, Loader2,
  Globe, Server, ShieldCheck, Activity, ChevronDown, ChevronUp
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
}

interface RegionStatus { id: string; label: string; status: string; latencyMs: number; }
interface MetricItem { label: string; value: string; trend: "up" | "down" | "flat"; }

const MOCK_BUILDS: BuildCard[] = [
  { id: "1", project: "my-app", status: "success", branch: "main", commit: "feat: add auth", duration: 94, startedAt: new Date(Date.now() - 600000).toISOString(), region: "us-east" },
  { id: "2", project: "api-server", status: "building", branch: "feature/mobile", commit: "wip: mobile layout", startedAt: new Date(Date.now() - 45000).toISOString(), region: "eu-central" },
  { id: "3", project: "worker", status: "failed", branch: "main", commit: "fix: queue timeout", duration: 23, startedAt: new Date(Date.now() - 3600000).toISOString(), region: "us-west" },
  { id: "4", project: "scheduler", status: "queued", branch: "main", commit: "chore: update deps", startedAt: new Date(Date.now() - 10000).toISOString(), region: "ap-southeast" },
];

const STATUS_ICON: Record<BuildCard["status"], React.ReactNode> = {
  success:  <CheckCircle size={14} className="text-green-400" />,
  failed:   <AlertTriangle size={14} className="text-red-400" />,
  building: <Loader2 size={14} className="text-blue-400 animate-spin" />,
  queued:   <Clock size={14} className="text-amber-400" />,
};

const STATUS_BADGE: Record<BuildCard["status"], string> = {
  success:  "text-green-400 bg-green-700/10 border-green-700/30",
  failed:   "text-red-400 bg-red-700/10 border-red-700/30",
  building: "text-blue-400 bg-blue-700/10 border-blue-700/30",
  queued:   "text-amber-400 bg-amber-700/10 border-amber-700/30",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return `${Math.round(diff / 3600000)}h ago`;
}

function MiniSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values) || 1;
  const w = 60, h = 20;
  const pts = values.map((v, i) => `${Math.round(i / (values.length - 1) * w)},${Math.round(h - (v / max) * h)}`).join(" ");
  return (
    <svg width={w} height={h}>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" points={pts} />
    </svg>
  );
}

export function MobileDeployPanel() {
  const { token, currentProject } = usePlatform();
  const [regions, setRegions] = useState<RegionStatus[]>([]);
  const [builds, setBuilds] = useState<BuildCard[]>(MOCK_BUILDS);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const pullStartY = useRef(0);
  const metrics: MetricItem[] = [
    { label: "Deployments", value: "12", trend: "up" },
    { label: "Success rate", value: "91%", trend: "up" },
    { label: "Avg build", value: "78s", trend: "down" },
    { label: "Active now", value: "3", trend: "flat" },
  ];
  const cpuHistory = [22, 35, 28, 51, 44, 67, 55, 48, 72, 61];

  const loadRegions = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetch("/api/observability/region-health", {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json());
      setRegions(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { loadRegions(); }, [token]);

  // Pull-to-refresh
  const onTouchStart = (e: React.TouchEvent) => { pullStartY.current = e.touches[0].clientY; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - pullStartY.current;
    if (dy > 60 && listRef.current?.scrollTop === 0) {
      setIsPulling(true);
      setTimeout(() => { setIsPulling(false); loadRegions(); }, 1200);
    }
  };

  return (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {/* Pull-to-refresh indicator */}
      {isPulling && (
        <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin mr-2" /> Refreshing...
        </div>
      )}

      <div className="p-3 space-y-4">
        {/* Metrics grid */}
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Overview</div>
          <div className="grid grid-cols-2 gap-2">
            {metrics.map(m => (
              <div key={m.label} className="p-3 rounded-xl border border-border bg-background">
                <div className="text-xl font-bold tabular-nums">{m.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CPU chart */}
        <div className="p-3 rounded-xl border border-border bg-background">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">CPU Usage (30m)</span>
            <span className="text-sm font-bold text-primary">{cpuHistory[cpuHistory.length - 1]}%</span>
          </div>
          <MiniSparkline values={cpuHistory} />
        </div>

        {/* Region health */}
        {regions.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Regions</div>
            <div className="space-y-1.5">
              {regions.map(r => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${r.status === "healthy" ? "bg-green-400" : r.status === "degraded" ? "bg-amber-400" : "bg-red-400"}`} />
                    <span className="text-xs">{r.label ?? r.id}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{r.latencyMs}ms</span>
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
                  className="w-full flex items-center gap-3 px-3 py-3 text-left touch-manipulation active:bg-muted/30"
                  onClick={() => setExpandedBuild(expandedBuild === build.id ? null : build.id)}
                >
                  {STATUS_ICON[build.status]}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold truncate">{build.project}</span>
                      <Badge className={`text-[9px] px-1 py-0 border ${STATUS_BADGE[build.status]}`}>{build.status}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{build.commit}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground">{timeAgo(build.startedAt)}</div>
                    {build.duration && <div className="text-[9px] text-muted-foreground/60">{build.duration}s</div>}
                  </div>
                  {expandedBuild === build.id ? <ChevronUp size={12} className="text-muted-foreground shrink-0" /> : <ChevronDown size={12} className="text-muted-foreground shrink-0" />}
                </button>

                {expandedBuild === build.id && (
                  <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-1.5">
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div><span className="text-muted-foreground">Branch: </span><span className="font-mono">{build.branch}</span></div>
                      <div><span className="text-muted-foreground">Region: </span><span>{build.region}</span></div>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground bg-black/20 rounded-lg p-2">
                      {build.status === "building" && <><span className="text-blue-400">▶ Building...</span><br /></>}
                      {build.status === "success" && <><span className="text-green-400">✓ Build complete</span><br /><span className="text-muted-foreground">✓ Container started</span><br /><span className="text-muted-foreground">✓ Health check passed</span></>}
                      {build.status === "failed" && <><span className="text-red-400">✗ Build failed at step 3</span><br /><span className="text-muted-foreground">Error: timeout after 30s</span></>}
                      {build.status === "queued" && <span className="text-amber-400">⏳ Waiting for runner...</span>}
                    </div>
                    {build.status === "failed" && (
                      <Button size="sm" className="w-full h-7 text-xs" variant="outline">Retry Build</Button>
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
