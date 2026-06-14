import React, { useState, useEffect, useRef } from "react";
import { FileExplorer } from "../sidebar/FileExplorer";
import { Button } from "../ui/button";
import { X, Files, Zap, Bot, Puzzle } from "lucide-react";

type SidebarTab = "files" | "functions" | "agents" | "plugins";

interface SidebarTabDef { id: SidebarTab; label: string; icon: React.ReactNode }

const TABS: SidebarTabDef[] = [
  { id: "files",     label: "Files",     icon: <Files size={14} /> },
  { id: "functions", label: "Functions", icon: <Zap size={14} /> },
  { id: "agents",    label: "Agents",    icon: <Bot size={14} /> },
  { id: "plugins",   label: "Plugins",   icon: <Puzzle size={14} /> },
];

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

function FunctionsList({ token }: { token?: string }) {
  const [functions, setFunctions] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    fetch("/api/functions", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setFunctions(Array.isArray(d) ? d.slice(0, 20) : []))
      .catch(() => {});
  }, [token]);

  if (!token) return <p className="text-xs text-muted-foreground p-4">Sign in to view cloud functions</p>;
  return (
    <div className="flex-1 overflow-y-auto">
      {functions.length === 0
        ? <p className="text-xs text-muted-foreground italic p-4">No functions yet</p>
        : functions.map(fn => (
          <div key={fn.id} className="flex items-center justify-between px-3 py-2.5 border-b border-border/40 hover:bg-muted/30">
            <div>
              <div className="text-xs font-medium">{fn.name}</div>
              <div className="text-[10px] text-muted-foreground">{fn.runtime} · {fn.trigger}</div>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${fn.deployed ? "text-green-400 border-green-700/30 bg-green-700/10" : "text-muted-foreground border-border"}`}>
              {fn.deployed ? "live" : "draft"}
            </span>
          </div>
        ))
      }
    </div>
  );
}

function AgentsList({ token }: { token?: string }) {
  const [agents, setAgents] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    fetch("/api/marketplace/agents", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { available: [], installed: [] })
      .then(d => setAgents(d.installed ?? []))
      .catch(() => {});
  }, [token]);

  if (!token) return <p className="text-xs text-muted-foreground p-4">Sign in to view agents</p>;
  return (
    <div className="flex-1 overflow-y-auto">
      {agents.length === 0
        ? <p className="text-xs text-muted-foreground italic p-4">No agents installed — add from Platform Dashboard</p>
        : agents.map((a: any) => (
          <div key={a.id} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/40 hover:bg-muted/30">
            <div className="w-7 h-7 rounded-md bg-purple-700/20 flex items-center justify-center shrink-0">
              <Bot size={13} className="text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{a.name}</div>
              <div className="text-[10px] text-muted-foreground">{a.category}</div>
            </div>
          </div>
        ))
      }
    </div>
  );
}

function PluginsList({ token }: { token?: string }) {
  const [plugins, setPlugins] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    fetch("/api/plugins", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { available: [], installed: [] })
      .then(d => setPlugins(d.installed ?? []))
      .catch(() => {});
  }, [token]);

  if (!token) return <p className="text-xs text-muted-foreground p-4">Sign in to view plugins</p>;
  return (
    <div className="flex-1 overflow-y-auto">
      {plugins.length === 0
        ? <p className="text-xs text-muted-foreground italic p-4">No plugins installed — add from Platform Dashboard</p>
        : plugins.map((p: any) => (
          <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/40 hover:bg-muted/30">
            <div className="w-7 h-7 rounded-md bg-blue-700/20 flex items-center justify-center shrink-0">
              <Puzzle size={13} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{p.name}</div>
              <div className="text-[10px] text-muted-foreground">{p.category}</div>
            </div>
          </div>
        ))
      }
    </div>
  );
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("files");
  const drawerRef = useRef<HTMLDivElement>(null);

  // Get token from localStorage for API calls
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") ?? undefined : undefined;

  // Swipe right to close
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    let startX = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; };
    const onEnd = (e: TouchEvent) => { if (e.changedTouches[0].clientX - startX > 60) onClose(); };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchend", onEnd); };
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      />
      <div
        ref={drawerRef}
        className={`fixed left-0 top-0 bottom-0 z-50 w-[85vw] max-w-xs flex flex-col bg-card border-r border-border shadow-2xl transition-transform duration-250 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0">
          <span className="text-xs font-bold text-primary">CloudIDE</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 touch-manipulation" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-semibold transition-colors touch-manipulation border-b-2 ${
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeTab === "files"     && <FileExplorer onFileOpen={onClose} />}
          {activeTab === "functions" && <FunctionsList token={token} />}
          {activeTab === "agents"    && <AgentsList token={token} />}
          {activeTab === "plugins"   && <PluginsList token={token} />}
        </div>
      </div>
    </>
  );
}
