import React, { useState, useEffect } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Loader2, RefreshCw, ShieldCheck, Scan, Wrench, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface HealingEvent {
  id: string;
  timestamp: string;
  projectId: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  resolution: string;
  status: "pending" | "in-progress" | "resolved" | "failed";
}

interface HealingStatus {
  open: number;
  resolved: number;
  failed: number;
  recentEvents: HealingEvent[];
  selfHealingEnabled: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-blue-400 bg-blue-600/10",
  medium: "text-amber-400 bg-amber-600/10",
  high: "text-orange-400 bg-orange-600/10",
  critical: "text-red-400 bg-red-600/10",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock size={11} className="text-amber-400" />,
  "in-progress": <Loader2 size={11} className="animate-spin text-blue-400" />,
  resolved: <CheckCircle size={11} className="text-green-400" />,
  failed: <AlertTriangle size={11} className="text-red-400" />,
};

export function HealingDashboard() {
  const { token, currentProject } = usePlatform();
  const [status, setStatus] = useState<HealingStatus | null>(null);
  const [history, setHistory] = useState<HealingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [scanResult, setScanResult] = useState<{ scanned: number; issues: number } | null>(null);

  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [s, h] = await Promise.all([
        fetch("/api/healing/status", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/healing/history?limit=30", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      setStatus(s);
      setHistory(Array.isArray(h) ? h : []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const handleScan = async () => {
    setIsScanning(true); setScanResult(null);
    try {
      const result = await fetch("/api/healing/scan", { method: "POST", headers: auth }).then(r => r.json());
      setScanResult({ scanned: result.scanned, issues: result.issues });
      await load();
    } finally { setIsScanning(false); }
  };

  const handleFix = async () => {
    if (!currentProject) return;
    setIsFixing(true);
    try {
      await fetch(`/api/healing/fix/${currentProject.id}`, { method: "POST", headers: auth });
      await load();
    } finally { setIsFixing(false); }
  };

  const handleResolve = async (id: string) => {
    await fetch(`/api/healing/events/${id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ status: "resolved" }) });
    setHistory(prev => prev.map(e => e.id === id ? { ...e, status: "resolved" } : e));
    if (status) setStatus({ ...status, open: Math.max(0, status.open - 1), resolved: status.resolved + 1 });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <ShieldCheck size={14} className="text-green-400" />
            <span className="text-xs font-semibold">Self-Healing Engine</span>
            {status?.selfHealingEnabled && <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-green-400">Active</Badge>}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={load}><RefreshCw size={11} /></Button>
        </div>

        {status && (
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {[
              { label: "Open", value: status.open, color: "text-amber-400" },
              { label: "Resolved", value: status.resolved, color: "text-green-400" },
              { label: "Failed", value: status.failed, color: "text-red-400" },
            ].map(s => (
              <div key={s.label} className="text-center p-2 rounded bg-muted/30 border border-border">
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[9px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex space-x-2">
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" disabled={isScanning} onClick={handleScan}>
            {isScanning ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Scan size={11} className="mr-1" />}Scan
          </Button>
          {currentProject && (
            <Button size="sm" className="flex-1 h-7 text-xs bg-orange-700 hover:bg-orange-600 text-white border-0" disabled={isFixing} onClick={handleFix}>
              {isFixing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wrench size={11} className="mr-1" />}Auto-Fix
            </Button>
          )}
        </div>

        {scanResult && (
          <div className={`mt-2 p-2 rounded text-[11px] ${scanResult.issues === 0 ? "bg-green-900/10 text-green-400" : "bg-amber-900/10 text-amber-400"}`}>
            Scanned {scanResult.scanned} deployments — {scanResult.issues === 0 ? "all healthy" : `${scanResult.issues} issue(s) detected`}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-20"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : history.length === 0 ? (
          <div className="text-center py-8">
            <ShieldCheck className="w-8 h-8 text-green-400/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No healing events — system looks healthy</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map(ev => (
              <div key={ev.id} className="p-2.5 rounded-lg border border-border bg-background">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    {STATUS_ICONS[ev.status]}
                    <Badge className={`text-[9px] px-1.5 py-0 border-0 ${SEVERITY_COLORS[ev.severity]}`}>{ev.severity}</Badge>
                    <span className="text-[10px] font-semibold">{ev.type.replace(/-/g, " ")}</span>
                  </div>
                  {(ev.status === "pending" || ev.status === "in-progress") && (
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 text-green-400" onClick={() => handleResolve(ev.id)}>Resolve</Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">{ev.description}</p>
                {ev.resolution && <p className="text-[10px] text-foreground/70 mt-0.5">→ {ev.resolution}</p>}
                <div className="text-[9px] text-muted-foreground/50 mt-1">{new Date(ev.timestamp).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
