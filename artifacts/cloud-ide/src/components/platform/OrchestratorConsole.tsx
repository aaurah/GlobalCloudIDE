import React, { useState, useEffect, useRef } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Loader2, BrainCircuit, Play, CheckCircle, AlertTriangle, Zap, RefreshCw, ChevronRight } from "lucide-react";

interface OrchestratorAction {
  id: string;
  type: string;
  target: string;
  reason: string;
  executed: boolean;
  result?: string;
}

interface OrchestrationEvent {
  id: string;
  timestamp: string;
  type: string;
  summary: string;
  actions: OrchestratorAction[];
  status: string;
}

interface SystemStatus {
  healthy: boolean;
  nodeCount: number;
  onlineNodes: number;
  unhealthyNodes: number;
  totalDeployments: number;
  avgCpu: number;
}

const ACTION_COLORS: Record<string, string> = {
  "scale-up": "text-green-400",
  "scale-down": "text-blue-400",
  "migrate-workload": "text-amber-400",
  "restart-node": "text-orange-400",
  "alert": "text-red-400",
  "noop": "text-muted-foreground",
};

export function OrchestratorConsole() {
  const { token } = usePlatform();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [history, setHistory] = useState<OrchestrationEvent[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [currentEvent, setCurrentEvent] = useState<OrchestrationEvent | null>(null);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadStatus = async () => {
    if (!token) return;
    try {
      const [s, h] = await Promise.all([
        fetch("/api/orchestrator/status", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/orchestrator/history", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      setStatus(s);
      setHistory(Array.isArray(h) ? h : []);
    } catch {}
  };

  useEffect(() => { loadStatus(); }, [token]);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamLines]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setStreamLines([]);
    setCurrentEvent(null);
    try {
      const res = await fetch("/api/orchestrator/analyze", { method: "POST", headers: auth });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "status") setStreamLines(p => [...p, `[status] ${data.content}`]);
            if (data.type === "thinking") setStreamLines(p => [...p, `[ai] ${data.content}`]);
            if (data.type === "stream") setStreamLines(p => {
              const last = p[p.length - 1] ?? "";
              if (last.startsWith("[reasoning]")) return [...p.slice(0, -1), last + data.content];
              return [...p, "[reasoning] " + data.content];
            });
            if (data.type === "done" && data.event) setCurrentEvent(data.event);
            if (data.type === "error") setStreamLines(p => [...p, `[error] ${data.content}`]);
          } catch {}
        }
      }
      await loadStatus();
    } finally { setIsAnalyzing(false); }
  };

  const handleExecute = async (eventId: string, actionId: string) => {
    setExecutingAction(actionId);
    try {
      await fetch("/api/orchestrator/execute", { method: "POST", headers: auth, body: JSON.stringify({ eventId, actionId }) });
      if (currentEvent?.id === eventId) {
        setCurrentEvent(prev => prev ? { ...prev, actions: prev.actions.map(a => a.id === actionId ? { ...a, executed: true } : a) } : prev);
      }
    } finally { setExecutingAction(null); }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Status bar */}
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${status?.healthy ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="text-xs font-semibold">{status?.healthy ? "System Healthy" : "Issues Detected"}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadStatus}><RefreshCw size={11} /></Button>
        </div>
        {status && (
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "Nodes", value: `${status.onlineNodes}/${status.nodeCount}` },
              { label: "Deploys", value: status.totalDeployments },
              { label: "Avg CPU", value: `${status.avgCpu}%` },
            ].map(s => (
              <div key={s.label} className="text-center p-1.5 rounded bg-muted/30 border border-border">
                <div className="text-sm font-bold tabular-nums">{s.value}</div>
                <div className="text-[9px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        )}
        <Button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full h-7 text-xs mt-2 bg-purple-700 hover:bg-purple-600 text-white border-0">
          {isAnalyzing ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Analyzing...</> : <><BrainCircuit size={12} className="mr-1.5" />Run AI Analysis</>}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Stream output */}
        {(streamLines.length > 0 || isAnalyzing) && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Analysis Stream</div>
            <div ref={streamRef} className="h-28 overflow-y-auto p-2 bg-black/20 rounded border border-border font-mono text-[10px] text-muted-foreground space-y-0.5">
              {streamLines.map((l, i) => (
                <div key={i} className={l.startsWith("[error]") ? "text-red-400" : l.startsWith("[ai]") ? "text-purple-400" : l.startsWith("[reasoning]") ? "text-muted-foreground/70 italic" : "text-foreground"}>
                  {l}
                </div>
              ))}
              {isAnalyzing && <div className="text-purple-400 animate-pulse">▍</div>}
            </div>
          </div>
        )}

        {/* Current event actions */}
        {currentEvent && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Recommended Actions</div>
            <div className="p-2.5 rounded-md border border-purple-900/30 bg-purple-900/10 mb-2">
              <p className="text-xs text-foreground">{currentEvent.summary}</p>
            </div>
            <div className="space-y-1.5">
              {currentEvent.actions.map(action => (
                <div key={action.id} className="flex items-start justify-between p-2 rounded border border-border bg-background">
                  <div className="flex items-start space-x-2 min-w-0">
                    <Zap size={11} className={`mt-0.5 shrink-0 ${ACTION_COLORS[action.type] ?? "text-muted-foreground"}`} />
                    <div>
                      <div className="text-[11px] font-semibold">{action.type}</div>
                      <div className="text-[10px] text-muted-foreground">→ {action.target}</div>
                      <div className="text-[10px] text-muted-foreground/70">{action.reason}</div>
                      {action.result && <div className="text-[10px] text-green-400 mt-0.5">{action.result}</div>}
                    </div>
                  </div>
                  {!action.executed ? (
                    <Button size="sm" className="h-6 text-[10px] px-2 ml-2 shrink-0" disabled={executingAction === action.id} onClick={() => handleExecute(currentEvent.id, action.id)}>
                      {executingAction === action.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play size={10} />}
                    </Button>
                  ) : (
                    <CheckCircle size={12} className="text-green-400 shrink-0 ml-2 mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">History</div>
            <div className="space-y-1">
              {history.slice(0, 8).map(ev => (
                <div key={ev.id} className="flex items-center justify-between text-[11px] py-1 border-b border-border/40">
                  <div className="min-w-0">
                    <span className="text-foreground truncate block max-w-[180px]">{ev.summary}</span>
                    <span className="text-muted-foreground/60">{ev.actions.length} actions</span>
                  </div>
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${ev.status === "done" ? "text-green-400" : "text-muted-foreground"}`}>{ev.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length === 0 && !isAnalyzing && streamLines.length === 0 && (
          <div className="text-center py-8">
            <BrainCircuit className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Click "Run AI Analysis" to observe and plan infrastructure actions</p>
          </div>
        )}
      </div>
    </div>
  );
}
