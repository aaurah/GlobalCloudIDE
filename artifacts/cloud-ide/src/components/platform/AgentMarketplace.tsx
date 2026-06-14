import React, { useState, useEffect, useRef } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Loader2, Search, Download, CheckCircle, Star, Play, ArrowLeft, BrainCircuit, FileCode, List, AlertTriangle, Check, X } from "lucide-react";

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  category: string;
  capabilities: string[];
  icon: string;
  downloads: number;
  rating: number;
  installed: boolean;
  author: string;
  version: string;
}

interface AgentStep {
  type: string;
  content?: string;
  action?: string;
  path?: string;
  language?: string;
  filesChanged?: string[];
}

const CATEGORIES = ["all", "builder", "debugger", "reviewer", "devops", "documentation", "testing", "data"];

const CATEGORY_COLORS: Record<string, string> = {
  builder: "bg-green-600/20 text-green-400",
  debugger: "bg-red-600/20 text-red-400",
  reviewer: "bg-blue-600/20 text-blue-400",
  devops: "bg-orange-600/20 text-orange-400",
  documentation: "bg-purple-600/20 text-purple-400",
  testing: "bg-cyan-600/20 text-cyan-400",
  data: "bg-amber-600/20 text-amber-400",
};

export function AgentMarketplace() {
  const { token, currentProject } = usePlatform();
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [installing, setInstalling] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "installed">("all");
  const [runningAgent, setRunningAgent] = useState<MarketplaceAgent | null>(null);
  const [task, setTask] = useState("");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const auth = { Authorization: `Bearer ${token}` };

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const url = tab === "installed" ? "/api/marketplace/agents?installed=1" : "/api/marketplace/agents";
      const data = await fetch(url, { headers: auth }).then(r => r.json());
      const list = Array.isArray(data) ? data : [];
      if (tab === "installed") setAgents(list.filter((a: MarketplaceAgent) => a.installed));
      else setAgents(list);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [token, tab]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [steps]);

  const handleInstall = async (agentId: string, installed: boolean) => {
    setInstalling(agentId);
    try {
      if (installed) {
        await fetch(`/api/marketplace/agents/${agentId}/uninstall`, { method: "DELETE", headers: auth });
      } else {
        await fetch(`/api/marketplace/agents/${agentId}/install`, { method: "POST", headers: auth });
      }
      await load();
    } finally { setInstalling(null); }
  };

  const handleRun = async () => {
    if (!runningAgent || !task.trim() || isRunning) return;
    setIsRunning(true);
    setSteps([]);
    try {
      const res = await fetch(`/api/marketplace/agents/${runningAgent.id}/run`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ task, projectId: currentProject?.id }),
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
              setSteps(prev => [...prev, data]);
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setSteps(prev => [...prev, { type: "error", content: err.message }]);
    } finally { setIsRunning(false); }
  };

  const filtered = agents.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || a.category === category;
    return matchSearch && matchCat;
  });

  if (runningAgent) return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border shrink-0">
        <button onClick={() => { setRunningAgent(null); setSteps([]); setTask(""); }} className="flex items-center text-xs text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft size={12} className="mr-1" /> Back
        </button>
        <div className="flex items-center space-x-2">
          <span className="text-lg">{runningAgent.icon}</span>
          <div>
            <div className="text-sm font-semibold">{runningAgent.name}</div>
            <div className="text-[10px] text-muted-foreground">{runningAgent.category}</div>
          </div>
        </div>
      </div>
      <div className="p-3 border-b border-border shrink-0 space-y-2">
        <Textarea
          placeholder="What should this agent do?"
          value={task}
          onChange={e => setTask(e.target.value)}
          disabled={isRunning}
          className="min-h-[60px] text-[12px] resize-none bg-background border-border"
        />
        {currentProject && <div className="text-[10px] text-muted-foreground">Project: <span className="text-foreground">{currentProject.name}</span></div>}
        <Button size="sm" onClick={handleRun} disabled={isRunning || !task.trim()} className="w-full h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white border-0">
          {isRunning ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Running...</> : <><Play size={12} className="mr-1.5" />Run Agent</>}
        </Button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {steps.length === 0 && !isRunning && <p className="text-xs text-muted-foreground italic text-center mt-8">Enter a task and run the agent</p>}
        {steps.map((step, i) => {
          if (step.type === "thinking") return <div key={i} className="flex items-start space-x-2 text-xs text-muted-foreground"><BrainCircuit size={13} className="shrink-0 mt-0.5" /><div className="italic">{step.content}</div></div>;
          if (step.type === "action") return <div key={i} className="flex items-center space-x-2 text-xs font-mono text-blue-400"><FileCode size={12} /><span>{step.action}: {step.path || step.language}</span></div>;
          if (step.type === "output") return <div key={i} className="ml-4 p-2 bg-black/30 rounded text-[10px] font-mono text-muted-foreground whitespace-pre-wrap max-h-24 overflow-y-auto">{step.content}</div>;
          if (step.type === "error") return <div key={i} className="flex items-start space-x-2 text-xs text-red-400"><AlertTriangle size={12} className="shrink-0 mt-0.5" /><div>{step.content}</div></div>;
          if (step.type === "done") return (
            <div key={i} className="p-3 bg-green-900/10 border border-green-900/20 rounded-md">
              <div className="flex items-center space-x-2 text-green-400 text-xs font-bold mb-1"><Check size={12} /><span>Done</span></div>
              {step.filesChanged && step.filesChanged.length > 0 && <div className="text-[11px] text-muted-foreground">Files: {step.filesChanged.join(", ")}</div>}
            </div>
          );
          return null;
        })}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="flex space-x-1 bg-background rounded-md p-0.5 border border-border">
          {["all", "installed"].map(t => (
            <button key={t} onClick={() => setTab(t as any)}
              className={`flex-1 text-[11px] font-semibold py-1 rounded-sm transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "all" ? "All Agents" : "Installed"}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agents..."
            className="w-full h-7 pl-6 pr-6 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={11} /></button>}
        </div>
        <div className="flex space-x-1 overflow-x-auto pb-1">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> :
          filtered.length === 0 ? <div className="text-center py-8 text-xs text-muted-foreground">No agents found</div> :
          <div className="space-y-2">
            {filtered.map(a => (
              <div key={a.id} className="p-3 rounded-lg border border-border bg-background hover:border-muted-foreground/20 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                    <span className="text-xl shrink-0">{a.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                        <span className="text-sm font-semibold">{a.name}</span>
                        <Badge className={`text-[9px] px-1.5 py-0 border-0 ${CATEGORY_COLORS[a.category] ?? ""}`}>{a.category}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{a.description}</p>
                      <div className="flex items-center space-x-2 mt-1.5">
                        <div className="flex items-center space-x-0.5 text-[10px] text-amber-400"><Star size={9} fill="currentColor" /><span>{a.rating}</span></div>
                        <div className="flex items-center space-x-0.5 text-[10px] text-muted-foreground"><Download size={9} /><span>{(a.downloads / 1000).toFixed(1)}k</span></div>
                        <span className="text-[10px] text-muted-foreground">by {a.author}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-1.5 mt-2">
                  <Button size="sm" variant={a.installed ? "outline" : "default"} className={`flex-1 h-6 text-[11px] ${a.installed ? "text-muted-foreground" : ""}`}
                    disabled={installing === a.id} onClick={() => handleInstall(a.id, a.installed)}>
                    {installing === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : a.installed ? <><CheckCircle size={10} className="mr-1 text-green-400" />Installed</> : "Install"}
                  </Button>
                  {a.installed && (
                    <Button size="sm" className="flex-1 h-6 text-[11px] bg-amber-600 hover:bg-amber-700 text-white border-0" onClick={() => setRunningAgent(a)}>
                      <Play size={10} className="mr-1" />Run
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}
