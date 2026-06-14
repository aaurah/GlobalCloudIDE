import React, { useState, useEffect } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Loader2, RefreshCw, Activity, AlertTriangle, FileText, GitBranch, Plus, Trash2 } from "lucide-react";

interface MetricStat {
  name: string;
  unit: string;
  current: number;
  avg: number;
  min: number;
  max: number;
  series: { timestamp: string; value: number }[];
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  source: string;
  message: string;
}

interface Trace {
  traceId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
}

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  severity: string;
  enabled: boolean;
}

interface RegionHealth {
  id: string;
  label: string;
  status: string;
  latencyMs: number;
  uptime: number;
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-400", warn: "text-amber-400", error: "text-red-400", debug: "text-muted-foreground",
};

const LOG_LEVEL_BG: Record<string, string> = {
  info: "bg-blue-600/10", warn: "bg-amber-600/10", error: "bg-red-600/10", debug: "",
};

const STATUS_COLORS: Record<string, string> = {
  healthy: "text-green-400", degraded: "text-amber-400", outage: "text-red-400",
};

function SparkLine({ series, color = "stroke-primary" }: { series: { value: number }[]; color?: string }) {
  if (!series.length) return null;
  const vals = series.map(p => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals) || 1;
  const w = 80, h = 24;
  const pts = vals.map((v, i) => `${Math.round(i / (vals.length - 1) * w)},${Math.round(h - ((v - min) / (max - min)) * h)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline fill="none" className={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

type SubTab = "metrics" | "logs" | "traces" | "alerts" | "regions";

export function ObservabilityPanel() {
  const { token } = usePlatform();
  const [subTab, setSubTab] = useState<SubTab>("metrics");
  const [metrics, setMetrics] = useState<MetricStat[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [regions, setRegions] = useState<RegionHealth[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [logLevel, setLogLevel] = useState("all");
  const [newAlertName, setNewAlertName] = useState("");
  const [newAlertMetric, setNewAlertMetric] = useState("cpu_percent");
  const [newAlertThreshold, setNewAlertThreshold] = useState(80);
  const [isAddingAlert, setIsAddingAlert] = useState(false);

  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      if (subTab === "metrics") {
        const d = await fetch("/api/observability/metrics", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        setMetrics(d.metrics ?? []);
      } else if (subTab === "logs") {
        const url = `/api/observability/logs?limit=40${logLevel !== "all" ? `&level=${logLevel}` : ""}`;
        const d = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        setLogs(d.logs ?? []);
      } else if (subTab === "traces") {
        const d = await fetch("/api/observability/traces", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        setTraces(d.traces ?? []);
      } else if (subTab === "alerts") {
        const d = await fetch("/api/observability/alerts", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        setAlerts(d.rules ?? []);
      } else if (subTab === "regions") {
        const d = await fetch("/api/observability/region-health", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        setRegions(Array.isArray(d) ? d : []);
      }
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [token, subTab, logLevel]);

  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlertName) return;
    setIsAddingAlert(true);
    try {
      const rule = await fetch("/api/observability/alerts", { method: "POST", headers: auth, body: JSON.stringify({ name: newAlertName, metric: newAlertMetric, condition: "gt", threshold: newAlertThreshold, severity: "medium" }) }).then(r => r.json());
      setAlerts(prev => [...prev, rule]);
      setNewAlertName("");
    } finally { setIsAddingAlert(false); }
  };

  const handleDeleteAlert = async (id: string) => {
    await fetch(`/api/observability/alerts/${id}`, { method: "DELETE", headers: auth });
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const TABS: { id: SubTab; label: string }[] = [
    { id: "metrics", label: "Metrics" },
    { id: "logs", label: "Logs" },
    { id: "traces", label: "Traces" },
    { id: "alerts", label: "Alerts" },
    { id: "regions", label: "Regions" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="border-b border-border shrink-0">
        <div className="flex overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`px-3 py-2 text-[11px] font-semibold shrink-0 border-b-2 transition-colors ${subTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto mr-2 self-center shrink-0" onClick={load}><RefreshCw size={11} /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? <div className="flex items-center justify-center h-20"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div> : (
          <>
            {subTab === "metrics" && (
              <div className="space-y-2">
                {metrics.map(m => (
                  <div key={m.name} className="p-2.5 rounded-lg border border-border bg-background">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold text-foreground">{m.name.replace(/_/g, " ")}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold tabular-nums">{m.current}<span className="text-[10px] text-muted-foreground ml-0.5">{m.unit}</span></span>
                        <SparkLine series={m.series} color={m.name.includes("error") ? "stroke-red-500" : m.name.includes("cpu") ? "stroke-amber-500" : "stroke-blue-500"} />
                      </div>
                    </div>
                    <div className="flex space-x-3 text-[10px] text-muted-foreground">
                      <span>avg {m.avg}{m.unit}</span>
                      <span>min {m.min}{m.unit}</span>
                      <span>max {m.max}{m.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {subTab === "logs" && (
              <div>
                <div className="flex space-x-1 mb-3 flex-wrap gap-y-1">
                  {["all", "info", "warn", "error", "debug"].map(l => (
                    <button key={l} onClick={() => setLogLevel(l)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${logLevel === l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="space-y-1">
                  {logs.map(log => (
                    <div key={log.id} className={`p-2 rounded text-[10px] font-mono ${LOG_LEVEL_BG[log.level]}`}>
                      <div className="flex items-center space-x-2 mb-0.5">
                        <span className={`font-bold uppercase ${LOG_LEVEL_COLORS[log.level]}`}>{log.level}</span>
                        <span className="text-muted-foreground/60">{log.source}</span>
                        <span className="text-muted-foreground/40">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-foreground">{log.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {subTab === "traces" && (
              <div className="space-y-1.5">
                {traces.map(t => (
                  <div key={t.traceId} className="flex items-center justify-between p-2 rounded border border-border bg-background text-[11px]">
                    <div>
                      <span className={`font-semibold ${t.statusCode >= 500 ? "text-red-400" : t.statusCode >= 400 ? "text-amber-400" : "text-green-400"}`}>{t.statusCode}</span>
                      <span className="text-muted-foreground ml-2">{t.method}</span>
                      <span className="text-foreground ml-1.5 font-mono">{t.endpoint}</span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-muted-foreground">{t.durationMs}ms</div>
                      <div className="text-muted-foreground/50 text-[9px]">{new Date(t.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {subTab === "alerts" && (
              <div className="space-y-3">
                <form onSubmit={handleAddAlert} className="p-3 rounded-lg border border-border bg-background space-y-2">
                  <div className="text-[11px] font-semibold">New Alert Rule</div>
                  <input value={newAlertName} onChange={e => setNewAlertName(e.target.value)} placeholder="Alert name" className="w-full h-7 px-2 text-xs bg-muted/30 border border-border rounded-md text-foreground" required />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={newAlertMetric} onChange={e => setNewAlertMetric(e.target.value)} className="h-7 text-xs bg-muted/30 border border-border rounded-md px-2 text-foreground">
                      {["cpu_percent", "memory_mb", "error_rate", "response_time_p99", "request_rate"].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input type="number" value={newAlertThreshold} onChange={e => setNewAlertThreshold(parseInt(e.target.value))} className="h-7 px-2 text-xs bg-muted/30 border border-border rounded-md text-foreground" />
                  </div>
                  <Button type="submit" size="sm" disabled={isAddingAlert} className="w-full h-7 text-xs">
                    {isAddingAlert ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus size={11} className="mr-1" />}Add Alert
                  </Button>
                </form>
                {alerts.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border">
                    <div>
                      <div className="text-xs font-semibold">{a.name}</div>
                      <div className="text-[10px] text-muted-foreground">{a.metric} &gt; {a.threshold} → {a.severity}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-400" onClick={() => handleDeleteAlert(a.id)}><Trash2 size={11} /></Button>
                  </div>
                ))}
                {alerts.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">No alert rules configured</p>}
              </div>
            )}

            {subTab === "regions" && (
              <div className="space-y-2">
                {regions.map(r => (
                  <div key={r.id} className="p-3 rounded-lg border border-border bg-background">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${r.status === "healthy" ? "bg-green-400" : r.status === "degraded" ? "bg-amber-400" : "bg-red-400"}`} />
                        <span className="text-xs font-semibold">{r.label}</span>
                      </div>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${STATUS_COLORS[r.status]}`}>{r.status}</Badge>
                    </div>
                    <div className="flex space-x-4 text-[10px] text-muted-foreground">
                      <span>Latency: <span className="text-foreground">{r.latencyMs}ms</span></span>
                      <span>Uptime: <span className="text-foreground">{r.uptime}%</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
