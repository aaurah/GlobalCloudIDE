import React, { useState, useEffect } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Loader2, RefreshCw, Globe, TrendingUp, TrendingDown, Minus, ArrowRight, Trash2 } from "lucide-react";

interface RegionHealth {
  regionId: string;
  label: string;
  status: "healthy" | "degraded" | "outage";
  latencyMs: number;
  nodeCount: number;
  deploymentCount: number;
  cpuAvg: number;
  memoryAvg: number;
}

interface WorkloadAssignment {
  id: string;
  projectId: string;
  regionId: string;
  nodeId: string;
  assignedAt: string;
  status: "running" | "failed" | "migrating";
  failoverRegion?: string;
}

interface ScalingPrediction {
  regionId: string;
  currentLoad: number;
  predictedLoad: number;
  recommendation: "scale-up" | "scale-down" | "hold";
  confidence: number;
}

const STATUS_COLORS = { healthy: "text-green-400", degraded: "text-amber-400", outage: "text-red-400" };
const STATUS_DOT = { healthy: "bg-green-400", degraded: "bg-amber-400", outage: "bg-red-400" };
const REC_ICONS = { "scale-up": <TrendingUp size={11} className="text-green-400" />, "scale-down": <TrendingDown size={11} className="text-blue-400" />, "hold": <Minus size={11} className="text-muted-foreground" /> };

export function GlobalSchedulerPanel() {
  const { token, currentProject } = usePlatform();
  const [regions, setRegions] = useState<RegionHealth[]>([]);
  const [workloads, setWorkloads] = useState<WorkloadAssignment[]>([]);
  const [predictions, setPredictions] = useState<ScalingPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("local");
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [r, w, p] = await Promise.all([
        fetch("/api/scheduler/regions", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/scheduler/workloads", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/scheduler/predict", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      setRegions(Array.isArray(r) ? r : []);
      setWorkloads(Array.isArray(w) ? w : []);
      setPredictions(Array.isArray(p) ? p : []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const handleAssign = async () => {
    if (!currentProject) return;
    setIsAssigning(true);
    try {
      await fetch("/api/scheduler/assign", { method: "POST", headers: auth, body: JSON.stringify({ projectId: currentProject.id, preferredRegion: selectedRegion }) });
      await load();
    } finally { setIsAssigning(false); }
  };

  const handleFailover = async (workloadId: string) => {
    await fetch(`/api/scheduler/failover/${workloadId}`, { method: "POST", headers: auth });
    await load();
  };

  const handleRemoveWorkload = async (workloadId: string) => {
    await fetch(`/api/scheduler/workloads/${workloadId}`, { method: "DELETE", headers: auth });
    await load();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border shrink-0 flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Global Scheduler</div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={load}><RefreshCw size={11} /></Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Region map */}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Regions</div>
            <div className="space-y-1.5">
              {regions.map(r => (
                <div key={r.regionId} className="p-2.5 rounded-lg border border-border bg-background">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${STATUS_DOT[r.status]}`} />
                      <span className="text-xs font-semibold">{r.label}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] text-muted-foreground">
                      <span>{r.latencyMs}ms</span>
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_COLORS[r.status]}`}>{r.status}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                    <span>{r.nodeCount} nodes</span>
                    <span>{r.deploymentCount} deploys</span>
                    <span>CPU {r.cpuAvg}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Assign workload */}
          {currentProject && (
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assign Workload</div>
              <div className="p-3 rounded-lg border border-border bg-background space-y-2">
                <div className="text-[11px] text-muted-foreground">Project: <span className="text-foreground font-medium">{currentProject.name}</span></div>
                <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)} className="w-full h-7 text-xs bg-muted/30 border border-border rounded-md px-2 text-foreground">
                  {regions.map(r => <option key={r.regionId} value={r.regionId}>{r.label}</option>)}
                </select>
                <Button size="sm" className="w-full h-7 text-xs" disabled={isAssigning} onClick={handleAssign}>
                  {isAssigning ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Globe size={11} className="mr-1" />}Assign to Region
                </Button>
              </div>
            </div>
          )}

          {/* Active workloads */}
          {workloads.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Active Workloads</div>
              <div className="space-y-1.5">
                {workloads.map(w => (
                  <div key={w.id} className="flex items-center justify-between p-2 rounded border border-border bg-background text-[11px]">
                    <div>
                      <div className="font-mono text-[10px] text-muted-foreground">{w.projectId.slice(0, 8)}...</div>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="text-foreground">{w.regionId}</span>
                        <ArrowRight size={10} className="text-muted-foreground" />
                        <span className="text-muted-foreground">{w.nodeId.slice(0, 8)}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${w.status === "running" ? "text-green-400" : w.status === "migrating" ? "text-amber-400" : "text-red-400"}`}>{w.status}</Badge>
                      {w.failoverRegion && (
                        <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 text-amber-400" onClick={() => handleFailover(w.id)}>Failover</Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-400" onClick={() => handleRemoveWorkload(w.id)}><Trash2 size={10} /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scaling predictions */}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Scaling Predictions</div>
            <div className="space-y-1.5">
              {predictions.map(p => (
                <div key={p.regionId} className="flex items-center justify-between p-2 rounded border border-border bg-background text-[11px]">
                  <div>
                    <div className="text-foreground font-medium">{p.regionId}</div>
                    <div className="text-muted-foreground">{p.currentLoad}% → {p.predictedLoad}%</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {REC_ICONS[p.recommendation]}
                    <div className="text-right">
                      <div className={p.recommendation === "scale-up" ? "text-green-400" : p.recommendation === "scale-down" ? "text-blue-400" : "text-muted-foreground"}>{p.recommendation}</div>
                      <div className="text-[9px] text-muted-foreground">{Math.round(p.confidence * 100)}% conf</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
