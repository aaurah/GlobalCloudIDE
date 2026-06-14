import React, { useState, useEffect } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Loader2, Plus, Server, Cpu, HardDrive, Circle, RefreshCw, Trash2, ArrowRightLeft } from "lucide-react";

interface PlatformNode {
  id: string;
  name: string;
  url: string | null;
  status: "online" | "offline" | "overloaded";
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
  deployments: string[];
  registeredAt: string;
  lastHeartbeat: string;
  region: string;
  tags: string[];
}

const STATUS_COLORS = {
  online: "text-green-400",
  offline: "text-red-400",
  overloaded: "text-amber-400",
};

const STATUS_BG = {
  online: "bg-green-400",
  offline: "bg-red-400",
  overloaded: "bg-amber-400",
};

function UsageBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div className="flex items-center space-x-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

export function NodeDashboard() {
  const { token, currentProject } = usePlatform();
  const [nodes, setNodes] = useState<PlatformNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [nodeName, setNodeName] = useState("");
  const [nodeUrl, setNodeUrl] = useState("");
  const [nodeRegion, setNodeRegion] = useState("us-east");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAssigning, setIsAssigning] = useState<string | null>(null);

  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetch("/api/nodes", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setNodes(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [token]);
  useEffect(() => {
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeName.trim()) return;
    setIsRegistering(true);
    try {
      await fetch("/api/nodes/register", {
        method: "POST", headers: auth,
        body: JSON.stringify({ name: nodeName, url: nodeUrl || undefined, region: nodeRegion }),
      });
      setNodeName(""); setNodeUrl(""); setShowRegister(false);
      await load();
    } finally { setIsRegistering(false); }
  };

  const handleDelete = async (nodeId: string) => {
    await fetch(`/api/nodes/${nodeId}`, { method: "DELETE", headers: auth });
    await load();
  };

  const handleAssign = async (nodeId: string) => {
    if (!currentProject) return;
    setIsAssigning(nodeId);
    try {
      await fetch("/api/nodes/assign", {
        method: "POST", headers: auth,
        body: JSON.stringify({ projectId: currentProject.id, nodeId }),
      });
      await load();
    } finally { setIsAssigning(null); }
  };

  const totalDeployments = nodes.reduce((s, n) => s + n.deployments.length, 0);
  const onlineCount = nodes.filter(n => n.status === "online").length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compute Nodes</div>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={load}>
              <RefreshCw size={11} />
            </Button>
            <Button size="sm" className="h-6 text-[11px] px-2" onClick={() => setShowRegister(!showRegister)}>
              <Plus size={11} className="mr-1" />Add
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Nodes", value: nodes.length, sub: `${onlineCount} online` },
            { label: "Deployments", value: totalDeployments, sub: "running" },
            { label: "Avg CPU", value: nodes.length ? `${Math.round(nodes.reduce((s, n) => s + n.cpuPercent, 0) / nodes.length)}%` : "0%", sub: "across cluster" },
          ].map(stat => (
            <div key={stat.label} className="p-2 rounded-md bg-muted/30 border border-border text-center">
              <div className="text-base font-bold tabular-nums">{stat.value}</div>
              <div className="text-[9px] text-muted-foreground">{stat.label}</div>
              <div className="text-[9px] text-muted-foreground/60">{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {showRegister && (
        <form onSubmit={handleRegister} className="p-3 border-b border-border bg-muted/10 space-y-2 shrink-0">
          <div className="text-xs font-semibold mb-1">Register Node</div>
          <Input placeholder="Node name" value={nodeName} onChange={e => setNodeName(e.target.value)} className="h-7 text-xs bg-background border-border" required />
          <Input placeholder="URL (optional, empty = local)" value={nodeUrl} onChange={e => setNodeUrl(e.target.value)} className="h-7 text-xs bg-background border-border" />
          <select value={nodeRegion} onChange={e => setNodeRegion(e.target.value)} className="w-full h-7 text-xs bg-background border border-border rounded-md px-2 text-foreground">
            {["us-east", "us-west", "eu-west", "ap-southeast", "local"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex space-x-2">
            <Button type="submit" size="sm" disabled={isRegistering} className="flex-1 h-7 text-xs">
              {isRegistering ? <Loader2 className="w-3 h-3 animate-spin" /> : "Register"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowRegister(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-20"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : nodes.map(node => (
          <div key={node.id} className="p-3 rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${STATUS_BG[node.status]} ${node.status === "online" ? "animate-pulse" : ""}`} />
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-semibold">{node.name}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{node.region}</Badge>
                    {node.tags.map(t => <Badge key={t} variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">{t}</Badge>)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{node.url ?? "local"} · {node.deployments.length} deployments</div>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                {currentProject && node.status === "online" && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Assign project" onClick={() => handleAssign(node.id)}>
                    {isAssigning === node.id ? <Loader2 size={11} className="animate-spin" /> : <ArrowRightLeft size={11} />}
                  </Button>
                )}
                {node.id !== "local-0" && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-400" onClick={() => handleDelete(node.id)}>
                    <Trash2 size={11} />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2 text-[10px] text-muted-foreground">
                <Cpu size={10} className="shrink-0" />
                <span className="w-8 shrink-0">CPU</span>
                <UsageBar value={node.cpuPercent} max={100} color={node.cpuPercent > 80 ? "bg-red-500" : node.cpuPercent > 60 ? "bg-amber-500" : "bg-green-500"} />
              </div>
              <div className="flex items-center space-x-2 text-[10px] text-muted-foreground">
                <HardDrive size={10} className="shrink-0" />
                <span className="w-8 shrink-0">MEM</span>
                <UsageBar value={node.memoryMb} max={node.memoryLimitMb} color={node.memoryMb / node.memoryLimitMb > 0.8 ? "bg-red-500" : "bg-blue-500"} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
