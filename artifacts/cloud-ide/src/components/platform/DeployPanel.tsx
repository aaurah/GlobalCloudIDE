import React, { useState, useEffect, useRef } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Textarea } from "../ui/textarea";
import {
  Rocket, Square, RefreshCw, ExternalLink, Loader2,
  CheckCircle2, XCircle, Clock, Activity, BrainCircuit, AlertTriangle
} from "lucide-react";

interface DeploymentStatus {
  projectId: string;
  status: "idle" | "building" | "running" | "stopped" | "error";
  url?: string;
  port?: number;
  pid?: number;
  startedAt?: string;
  error?: string;
}

export function DeployPanel() {
  const { token, currentProject } = usePlatform();
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [devopsTask, setDevopsTask] = useState("");
  const [devopsAnalysis, setDevopsAnalysis] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);

  const projectId = currentProject?.id;

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const fetchStatus = async () => {
    if (!projectId || !token) return;
    try {
      const res = await fetch(`/api/deploy/${projectId}/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setStatus(await res.json());
    } catch {}
  };

  const fetchLogs = async () => {
    if (!projectId || !token) return;
    try {
      const res = await fetch(`/api/deploy/${projectId}/logs?lines=100`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } catch {}
  };

  useEffect(() => {
    if (!projectId) return;
    fetchStatus();
    fetchLogs();
    const interval = setInterval(() => {
      fetchStatus();
      if (status?.status === "building" || status?.status === "running") fetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [projectId, token, status?.status]);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const handleDeploy = async () => {
    if (!projectId) return;
    setIsDeploying(true);
    setLogs([]);
    try {
      const res = await fetch(`/api/deploy/${projectId}/start`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ projectId, type: currentProject?.type ?? "node" }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.log) setLogs(prev => [...prev, data.log]);
              if (data.status === "running" || data.status === "error") fetchStatus();
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `[error] ${err.message}`]);
    } finally {
      setIsDeploying(false);
      fetchStatus();
    }
  };

  const handleStop = async () => {
    if (!projectId) return;
    setIsStopping(true);
    try {
      await fetch(`/api/deploy/${projectId}/stop`, { method: "POST", headers: authHeaders });
      await fetchStatus();
    } finally {
      setIsStopping(false);
    }
  };

  const handleDevopsAnalyze = async () => {
    if (!devopsTask.trim() || !projectId) return;
    setIsAnalyzing(true);
    setDevopsAnalysis("");
    try {
      const res = await fetch("/api/devops/analyze", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ task: devopsTask, projectId }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) { full += data.content; setDevopsAnalysis(full); }
            } catch {}
          }
        }
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Rocket className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No project selected</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Open a project from the toolbar to deploy it</p>
      </div>
    );
  }

  const statusColor = {
    idle: "text-muted-foreground",
    building: "text-amber-400",
    running: "text-green-400",
    stopped: "text-muted-foreground",
    error: "text-red-400",
  }[status?.status ?? "idle"];

  const statusIcon = {
    idle: <Clock size={14} />,
    building: <Loader2 size={14} className="animate-spin" />,
    running: <CheckCircle2 size={14} />,
    stopped: <Square size={14} />,
    error: <XCircle size={14} />,
  }[status?.status ?? "idle"];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-1.5 text-xs font-medium ${statusColor}`}>
              {statusIcon}
              <span className="capitalize">{status?.status ?? "idle"}</span>
            </div>
            {status?.url && status.status === "running" && (
              <a
                href={status.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-[10px] text-primary hover:underline"
              >
                <ExternalLink size={10} className="mr-0.5" />
                Open App
              </a>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => { fetchStatus(); fetchLogs(); }}
          >
            <RefreshCw size={12} />
          </Button>
        </div>

        <div className="text-[11px] text-muted-foreground mb-3 truncate">
          Project: <span className="text-foreground font-medium">{currentProject.name}</span>
          {currentProject.type && <span className="ml-1 text-muted-foreground/60">({currentProject.type})</span>}
        </div>

        <div className="flex space-x-2">
          {status?.status === "running" ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={isStopping}
              onClick={handleStop}
              className="flex-1 h-8 text-xs"
            >
              {isStopping ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Square className="w-3.5 h-3.5 mr-1.5" />}
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={isDeploying || status?.status === "building"}
              onClick={handleDeploy}
              className="flex-1 h-8 text-xs bg-green-700 hover:bg-green-600 text-white border-0"
            >
              {isDeploying || status?.status === "building" ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Building...</>
              ) : (
                <><Rocket className="w-3.5 h-3.5 mr-1.5" /> Deploy</>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center px-3 py-2 border-b border-border bg-muted/20 shrink-0">
          <Activity size={12} className="mr-1.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Build Logs</span>
        </div>
        <div ref={logsRef} className="flex-1 overflow-y-auto p-3 font-mono text-[11px] text-muted-foreground bg-black/20">
          {logs.length === 0 ? (
            <span className="italic">No logs yet. Deploy to see output here.</span>
          ) : (
            logs.map((line, i) => (
              <div key={i} className={`leading-relaxed ${
                line.includes("[error]") || line.includes("Error") ? "text-red-400" :
                line.includes("[success]") || line.includes("running on port") ? "text-green-400" :
                line.includes("[info]") ? "text-blue-400" : ""
              }`}>
                {line}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-center mb-2">
          <BrainCircuit size={12} className="mr-1.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">DevOps AI</span>
        </div>
        <Textarea
          placeholder="Ask DevOps AI... e.g. 'Why is my app crashing?' or 'Add a Dockerfile'"
          value={devopsTask}
          onChange={e => setDevopsTask(e.target.value)}
          className="min-h-[56px] text-[12px] resize-none bg-background border-border mb-2"
        />
        {devopsAnalysis && (
          <div className="mb-2 max-h-[100px] overflow-y-auto p-2 bg-black/20 rounded text-[11px] text-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {devopsAnalysis}
          </div>
        )}
        <Button
          size="sm"
          disabled={isAnalyzing || !devopsTask.trim()}
          onClick={handleDevopsAnalyze}
          className="w-full h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white border-0"
        >
          {isAnalyzing ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5" /> Analyzing...</> : "Analyze with AI"}
        </Button>
      </div>
    </div>
  );
}
