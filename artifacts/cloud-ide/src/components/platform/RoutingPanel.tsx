import React, { useState, useEffect } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Loader2, Plus, Trash2, RefreshCw, Globe, ArrowRight, Activity, AlertTriangle } from "lucide-react";

interface Route {
  id: string;
  host: string;
  path: string;
  targetRegion: string;
  targetPort: number;
  protocol: string;
  loadBalancing: string;
  healthCheck: string;
  status: "active" | "inactive" | "degraded";
  requestCount: number;
  errorRate: number;
  avgLatencyMs: number;
}

interface HealthResult { routeId: string; status: string; latencyMs: number; checkedAt: string; error?: string; }

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400", inactive: "text-muted-foreground", degraded: "text-amber-400",
};

export function RoutingPanel() {
  const { token } = usePlatform();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [health, setHealth] = useState<HealthResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [newHost, setNewHost] = useState("");
  const [newPort, setNewPort] = useState(3000);
  const [newRegion, setNewRegion] = useState("local");
  const [newProtocol, setNewProtocol] = useState("http");
  const [newLb, setNewLb] = useState("round-robin");
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetch("/api/routing/routes", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setRoutes(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHost.trim()) return;
    setIsCreating(true);
    try {
      const route = await fetch("/api/routing/routes", { method: "POST", headers: auth, body: JSON.stringify({ host: newHost, targetPort: newPort, targetRegion: newRegion, protocol: newProtocol, loadBalancing: newLb }) }).then(r => r.json());
      setRoutes(prev => [...prev, route]);
      setNewHost(""); setShowCreate(false);
    } finally { setIsCreating(false); }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/routing/routes/${id}`, { method: "DELETE", headers: auth });
    setRoutes(prev => prev.filter(r => r.id !== id));
  };

  const handleHealthCheck = async () => {
    setIsCheckingHealth(true);
    try {
      const results = await fetch("/api/routing/health", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setHealth(Array.isArray(results) ? results : []);
    } finally { setIsCheckingHealth(false); }
  };

  const handleFailover = async (routeId: string) => {
    await fetch(`/api/routing/failover/${routeId}`, { method: "POST", headers: auth });
    await load();
  };

  const getHealth = (routeId: string) => health.find(h => h.routeId === routeId);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Global Routing</div>
          <div className="flex space-x-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isCheckingHealth} onClick={handleHealthCheck}><Activity size={11} /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={load}><RefreshCw size={11} /></Button>
            <Button size="sm" className="h-6 text-[11px] px-2" onClick={() => setShowCreate(!showCreate)}><Plus size={11} className="mr-1" />Add</Button>
          </div>
        </div>
        <div className="flex space-x-2 text-[10px] text-muted-foreground">
          <span>{routes.filter(r => r.status === "active").length} active</span>
          <span>{routes.filter(r => r.status === "degraded").length} degraded</span>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="p-3 border-b border-border bg-muted/10 space-y-2 shrink-0">
          <div className="text-[11px] font-semibold">New Route</div>
          <Input placeholder="example.com" value={newHost} onChange={e => setNewHost(e.target.value)} className="h-7 text-xs bg-background border-border" required />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Port" value={newPort} onChange={e => setNewPort(parseInt(e.target.value))} className="h-7 text-xs bg-background border-border" />
            <select value={newRegion} onChange={e => setNewRegion(e.target.value)} className="h-7 text-xs bg-background border border-border rounded-md px-2 text-foreground">
              {["local", "us-east", "us-west", "eu-central", "ap-southeast"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={newProtocol} onChange={e => setNewProtocol(e.target.value)} className="h-7 text-xs bg-background border border-border rounded-md px-2 text-foreground">
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="ws">WebSocket</option>
            </select>
            <select value={newLb} onChange={e => setNewLb(e.target.value)} className="h-7 text-xs bg-background border border-border rounded-md px-2 text-foreground">
              <option value="round-robin">Round-Robin</option>
              <option value="least-conn">Least Conn</option>
              <option value="ip-hash">IP Hash</option>
            </select>
          </div>
          <div className="flex space-x-2">
            <Button type="submit" size="sm" disabled={isCreating} className="flex-1 h-7 text-xs">{isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create"}</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-20"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : routes.length === 0 ? (
          <div className="text-center py-8">
            <Globe className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No routes configured</p>
            <Button size="sm" className="mt-3 h-7 text-xs" onClick={() => setShowCreate(true)}>Add your first route</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {routes.map(route => {
              const hc = getHealth(route.id);
              return (
                <div key={route.id} className="p-3 rounded-lg border border-border bg-background">
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${route.status === "active" ? "bg-green-400" : route.status === "degraded" ? "bg-amber-400" : "bg-muted-foreground"}`} />
                        <span className="text-xs font-semibold font-mono">{route.host}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{route.protocol}</Badge>
                      </div>
                      <div className="flex items-center space-x-1 text-[10px] text-muted-foreground mt-0.5">
                        <span>{route.targetRegion}</span>
                        <ArrowRight size={9} />
                        <span>:{route.targetPort}</span>
                        <span>· {route.loadBalancing}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      {route.status === "degraded" && (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5 text-amber-400" onClick={() => handleFailover(route.id)}>
                          <AlertTriangle size={10} className="mr-0.5" />Failover
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-400" onClick={() => handleDelete(route.id)}><Trash2 size={11} /></Button>
                    </div>
                  </div>
                  {hc && (
                    <div className="flex items-center space-x-3 text-[10px] mt-1 pt-1 border-t border-border/50">
                      <span className={hc.status === "healthy" ? "text-green-400" : hc.status === "degraded" ? "text-amber-400" : "text-red-400"}>{hc.status}</span>
                      <span className="text-muted-foreground">{hc.latencyMs}ms</span>
                      {hc.error && <span className="text-red-400 truncate">{hc.error}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
