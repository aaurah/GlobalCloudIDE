import React, { useState, useEffect, useRef } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loader2, Plus, Trash2, Play, Square, Save, Container, RefreshCw } from "lucide-react";

interface ContainerSpec {
  base: string;
  build: string[];
  run: string;
  env: Record<string, string>;
  ports: number[];
  resources: { cpuLimit: number; memoryMb: number; timeoutSecs: number };
}

interface ContainerStatus {
  spec: ContainerSpec;
  status: "running" | "stopped";
  pid: number | null;
  startedAt: string | null;
  port: number | null;
}

const BASE_IMAGES = ["node:20", "python:3.11", "ubuntu:22.04", "nginx:alpine", "golang:1.21"];

export function ContainerBuilder() {
  const { token, currentProject } = usePlatform();
  const [containerStatus, setContainerStatus] = useState<ContainerStatus | null>(null);
  const [spec, setSpec] = useState<ContainerSpec>({
    base: "node:20",
    build: ["npm install"],
    run: "node index.js",
    env: {},
    ports: [3000],
    resources: { cpuLimit: 1, memoryMb: 512, timeoutSecs: 300 },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");
  const [newBuildCmd, setNewBuildCmd] = useState("");
  const logsRef = useRef<HTMLDivElement>(null);

  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const projectId = currentProject?.id;

  const loadStatus = async () => {
    if (!projectId || !token) return;
    setIsLoading(true);
    try {
      const data = await fetch(`/api/containers/${projectId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setContainerStatus(data);
      setSpec(data.spec);
    } catch {} finally { setIsLoading(false); }
  };

  useEffect(() => { loadStatus(); }, [projectId, token]);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const handleSave = async () => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      await fetch(`/api/containers/${projectId}`, { method: "PUT", headers: auth, body: JSON.stringify(spec) });
      await loadStatus();
    } finally { setIsSaving(false); }
  };

  const handleBuild = async () => {
    if (!projectId) return;
    setIsBuilding(true); setLogs([]);
    try {
      const res = await fetch(`/api/containers/${projectId}/build`, { method: "POST", headers: auth, body: JSON.stringify({}) });
      if (!res.body) return;
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
              if (data.status) await loadStatus();
            } catch {}
          }
        }
      }
    } finally {
      setIsBuilding(false);
      await loadStatus();
    }
  };

  const handleStop = async () => {
    if (!projectId) return;
    await fetch(`/api/containers/${projectId}/stop`, { method: "POST", headers: auth });
    await loadStatus();
  };

  const addEnvVar = () => {
    if (!newEnvKey.trim()) return;
    setSpec(s => ({ ...s, env: { ...s.env, [newEnvKey]: newEnvVal } }));
    setNewEnvKey(""); setNewEnvVal("");
  };

  const removeEnvVar = (key: string) => {
    setSpec(s => { const env = { ...s.env }; delete env[key]; return { ...s, env }; });
  };

  const addBuildCmd = () => {
    if (!newBuildCmd.trim()) return;
    setSpec(s => ({ ...s, build: [...s.build, newBuildCmd] }));
    setNewBuildCmd("");
  };

  const removeBuildCmd = (i: number) => {
    setSpec(s => ({ ...s, build: s.build.filter((_, idx) => idx !== i) }));
  };

  if (!currentProject) return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <Container className="w-10 h-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">No project selected</p>
      <p className="text-xs text-muted-foreground/60 mt-1">Open a project to configure its container</p>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${containerStatus?.status === "running" ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
            <span className="text-xs font-semibold">{containerStatus?.status === "running" ? "Running" : "Stopped"}</span>
            {containerStatus?.port && <span className="text-[10px] text-muted-foreground">:{ containerStatus.port}</span>}
          </div>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadStatus}><RefreshCw size={11} /></Button>
            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" disabled={isSaving} onClick={handleSave}>
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save size={11} className="mr-1" />Save</>}
            </Button>
            {containerStatus?.status === "running" ? (
              <Button size="sm" variant="destructive" className="h-6 text-[11px] px-2" onClick={handleStop}><Square size={11} className="mr-1" />Stop</Button>
            ) : (
              <Button size="sm" className="h-6 text-[11px] px-2 bg-green-700 hover:bg-green-600 text-white border-0" disabled={isBuilding} onClick={handleBuild}>
                {isBuilding ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play size={11} className="mr-1" />}Build & Run
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Base image */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Base Image</label>
          <select value={spec.base} onChange={e => setSpec(s => ({ ...s, base: e.target.value }))}
            className="w-full h-7 text-xs bg-background border border-border rounded-md px-2 text-foreground">
            {BASE_IMAGES.map(img => <option key={img} value={img}>{img}</option>)}
          </select>
        </div>

        {/* Build commands */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Build Commands</label>
          <div className="space-y-1.5">
            {spec.build.map((cmd, i) => (
              <div key={i} className="flex items-center space-x-1">
                <code className="flex-1 text-[11px] px-2 py-1 bg-background border border-border rounded font-mono text-foreground">{cmd}</code>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-400" onClick={() => removeBuildCmd(i)}><Trash2 size={11} /></Button>
              </div>
            ))}
            <div className="flex space-x-1">
              <Input placeholder="npm install" value={newBuildCmd} onChange={e => setNewBuildCmd(e.target.value)} onKeyDown={e => e.key === "Enter" && addBuildCmd()}
                className="flex-1 h-7 text-xs bg-background border-border font-mono" />
              <Button size="sm" className="h-7 px-2" onClick={addBuildCmd}><Plus size={11} /></Button>
            </div>
          </div>
        </div>

        {/* Run command */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Run Command</label>
          <Input value={spec.run} onChange={e => setSpec(s => ({ ...s, run: e.target.value }))}
            className="h-7 text-xs bg-background border-border font-mono" placeholder="node index.js" />
        </div>

        {/* Environment variables */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Environment Variables</label>
          <div className="space-y-1.5">
            {Object.entries(spec.env).map(([k, v]) => (
              <div key={k} className="flex items-center space-x-1 text-[11px]">
                <code className="flex-1 px-2 py-1 bg-background border border-border rounded font-mono text-muted-foreground">{k}={v}</code>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-400" onClick={() => removeEnvVar(k)}><Trash2 size={11} /></Button>
              </div>
            ))}
            <div className="flex space-x-1">
              <Input placeholder="KEY" value={newEnvKey} onChange={e => setNewEnvKey(e.target.value)} className="w-24 h-7 text-xs bg-background border-border font-mono" />
              <Input placeholder="VALUE" value={newEnvVal} onChange={e => setNewEnvVal(e.target.value)} className="flex-1 h-7 text-xs bg-background border-border font-mono" />
              <Button size="sm" className="h-7 px-2" onClick={addEnvVar}><Plus size={11} /></Button>
            </div>
          </div>
        </div>

        {/* Resources */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Resources</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">CPU Cores</div>
              <Input type="number" min={0.1} max={8} step={0.1} value={spec.resources.cpuLimit}
                onChange={e => setSpec(s => ({ ...s, resources: { ...s.resources, cpuLimit: parseFloat(e.target.value) || 1 } }))}
                className="h-7 text-xs bg-background border-border" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">Memory (MB)</div>
              <Input type="number" min={64} max={8192} step={64} value={spec.resources.memoryMb}
                onChange={e => setSpec(s => ({ ...s, resources: { ...s.resources, memoryMb: parseInt(e.target.value) || 512 } }))}
                className="h-7 text-xs bg-background border-border" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">Timeout (s)</div>
              <Input type="number" min={30} max={3600} step={30} value={spec.resources.timeoutSecs}
                onChange={e => setSpec(s => ({ ...s, resources: { ...s.resources, timeoutSecs: parseInt(e.target.value) || 300 } }))}
                className="h-7 text-xs bg-background border-border" />
            </div>
          </div>
        </div>

        {/* Build logs */}
        {logs.length > 0 && (
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Build Output</label>
            <div ref={logsRef} className="h-32 overflow-y-auto p-2 bg-black/20 rounded border border-border font-mono text-[10px] text-muted-foreground">
              {logs.map((l, i) => (
                <div key={i} className={l.includes("[error]") ? "text-red-400" : l.includes("running") ? "text-green-400" : ""}>{l}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
