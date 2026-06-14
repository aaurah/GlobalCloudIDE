import React, { useState, useEffect, useRef } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Loader2, Plus, Play, Trash2, ArrowLeft, Upload, Clock, Globe, Zap } from "lucide-react";

interface CloudFunction {
  id: string;
  name: string;
  description: string;
  runtime: "node" | "python" | "bash";
  trigger: "http" | "schedule" | "event" | "manual";
  schedule?: string;
  code: string;
  deployed: boolean;
  invocations: number;
  lastRun?: string;
}

interface FunctionLog { id: string; timestamp: string; duration: number; status: "ok" | "error"; output: string; }

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  http: <Globe size={11} />,
  schedule: <Clock size={11} />,
  event: <Zap size={11} />,
  manual: <Play size={11} />,
};

const RUNTIME_COLORS: Record<string, string> = {
  node: "bg-green-600/20 text-green-400",
  python: "bg-blue-600/20 text-blue-400",
  bash: "bg-amber-600/20 text-amber-400",
};

export function CloudFunctionsEditor() {
  const { token } = usePlatform();
  const [functions, setFunctions] = useState<CloudFunction[]>([]);
  const [selected, setSelected] = useState<CloudFunction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [runOutput, setRunOutput] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [newRuntime, setNewRuntime] = useState<"node" | "python" | "bash">("node");
  const [newTrigger, setNewTrigger] = useState<CloudFunction["trigger"]>("manual");
  const [editedCode, setEditedCode] = useState("");
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const outputRef = useRef<HTMLDivElement>(null);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetch("/api/functions", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setFunctions(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [token]);
  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [runOutput]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const fn = await fetch("/api/functions", { method: "POST", headers: auth, body: JSON.stringify({ name: newName, runtime: newRuntime, trigger: newTrigger }) }).then(r => r.json());
      setFunctions(prev => [fn, ...prev]);
      setSelected(fn); setEditedCode(fn.code); setView("edit");
      setNewName(""); setNewRuntime("node"); setNewTrigger("manual");
    } finally { setIsCreating(false); }
  };

  const handleSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      const updated = await fetch(`/api/functions/${selected.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ code: editedCode }) }).then(r => r.json());
      setSelected(updated);
      setFunctions(prev => prev.map(f => f.id === updated.id ? updated : f));
    } finally { setIsSaving(false); }
  };

  const handleDeploy = async () => {
    if (!selected) return;
    setIsDeploying(true);
    try {
      await fetch(`/api/functions/${selected.id}/deploy`, { method: "POST", headers: auth });
      setSelected(prev => prev ? { ...prev, deployed: true } : prev);
      setFunctions(prev => prev.map(f => f.id === selected.id ? { ...f, deployed: true } : f));
    } finally { setIsDeploying(false); }
  };

  const handleRun = async () => {
    if (!selected || isRunning) return;
    setIsRunning(true); setRunOutput([]);
    try {
      const res = await fetch(`/api/functions/${selected.id}/run`, { method: "POST", headers: auth, body: JSON.stringify({ event: { source: "manual" } }) });
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
            if (data.type === "stdout") setRunOutput(p => [...p, data.content]);
            if (data.type === "stderr") setRunOutput(p => [...p, `[err] ${data.content}`]);
            if (data.type === "done") setRunOutput(p => [...p, `\n[exit ${data.exitCode}] ${data.duration}ms`]);
          } catch {}
        }
      }
    } finally { setIsRunning(false); }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/functions/${id}`, { method: "DELETE", headers: auth });
    setFunctions(prev => prev.filter(f => f.id !== id));
    if (selected?.id === id) { setSelected(null); setView("list"); }
  };

  if (view === "create") return (
    <div className="flex-1 p-4">
      <button onClick={() => setView("list")} className="flex items-center text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={12} className="mr-1" /> Back
      </button>
      <div className="text-sm font-semibold mb-4">Create Cloud Function</div>
      <form onSubmit={handleCreate} className="space-y-3">
        <Input placeholder="Function name" value={newName} onChange={e => setNewName(e.target.value)} className="h-8 text-sm bg-background border-border" required />
        <div className="grid grid-cols-2 gap-2">
          <select value={newRuntime} onChange={e => setNewRuntime(e.target.value as any)} className="h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground">
            <option value="node">Node.js</option>
            <option value="python">Python</option>
            <option value="bash">Bash</option>
          </select>
          <select value={newTrigger} onChange={e => setNewTrigger(e.target.value as any)} className="h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground">
            <option value="manual">Manual</option>
            <option value="http">HTTP</option>
            <option value="schedule">Schedule</option>
            <option value="event">Event</option>
          </select>
        </div>
        <Button type="submit" size="sm" disabled={isCreating} className="w-full h-8 text-xs">
          {isCreating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Create Function
        </Button>
      </form>
    </div>
  );

  if (view === "edit" && selected) return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-2 border-b border-border shrink-0">
        <button onClick={() => { setView("list"); load(); }} className="flex items-center text-xs text-muted-foreground hover:text-foreground mb-1.5">
          <ArrowLeft size={11} className="mr-1" /> Functions
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold">{selected.name}</span>
            <Badge className={`text-[9px] px-1.5 py-0 border-0 ${RUNTIME_COLORS[selected.runtime]}`}>{selected.runtime}</Badge>
            {selected.deployed && <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-green-400">deployed</Badge>}
          </div>
          <div className="flex space-x-1">
            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" disabled={isSaving} onClick={handleSave}>
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" disabled={isDeploying} onClick={handleDeploy}>
              {isDeploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Upload size={10} className="mr-1" />Deploy</>}
            </Button>
            <Button size="sm" className="h-6 text-[11px] px-2 bg-green-700 hover:bg-green-600 text-white border-0" disabled={isRunning} onClick={handleRun}>
              {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play size={10} />}
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <textarea
          value={editedCode}
          onChange={e => setEditedCode(e.target.value)}
          className="flex-1 font-mono text-[11px] p-3 bg-[#1e1e1e] text-foreground resize-none border-0 outline-none"
          spellCheck={false}
        />
        {runOutput.length > 0 && (
          <div ref={outputRef} className="h-24 overflow-y-auto p-2 bg-black/30 border-t border-border font-mono text-[10px] text-muted-foreground whitespace-pre-wrap shrink-0">
            {runOutput.join("")}
            {isRunning && <span className="animate-pulse">▍</span>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cloud Functions</div>
        <Button size="sm" className="h-7 text-xs" onClick={() => setView("create")}><Plus size={12} className="mr-1" />New</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? <div className="flex items-center justify-center h-20"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div> :
          functions.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No functions yet</p>
              <Button size="sm" className="mt-3 h-7 text-xs" onClick={() => setView("create")}>Create your first function</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {functions.map(fn => (
                <div key={fn.id} className="p-2.5 rounded-lg border border-border bg-background hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <button onClick={() => { setSelected(fn); setEditedCode(fn.code); setView("edit"); }} className="min-w-0 text-left flex-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-semibold">{fn.name}</span>
                        <Badge className={`text-[9px] px-1 py-0 border-0 ${RUNTIME_COLORS[fn.runtime]}`}>{fn.runtime}</Badge>
                        {fn.deployed && <Badge variant="outline" className="text-[9px] px-1 py-0 text-green-400">live</Badge>}
                      </div>
                      <div className="flex items-center space-x-2 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center space-x-0.5">{TRIGGER_ICONS[fn.trigger]}<span className="ml-0.5">{fn.trigger}</span></span>
                        <span>{fn.invocations} runs</span>
                        {fn.lastRun && <span>{new Date(fn.lastRun).toLocaleDateString()}</span>}
                      </div>
                    </button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-400 shrink-0" onClick={() => handleDelete(fn.id)}>
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}
