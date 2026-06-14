import React, { useState, useEffect } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Loader2, Search, Download, CheckCircle, Star, X } from "lucide-react";

interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  capabilities: string[];
  icon: string;
  downloads: number;
  rating: number;
  installed: boolean;
}

const CATEGORIES = ["all", "editor", "vcs", "linting", "formatting", "productivity", "deployment", "testing", "database"];

export function PluginMarketplace() {
  const { token } = usePlatform();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [installing, setInstalling] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "installed">("all");

  const auth = { Authorization: `Bearer ${token}` };

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const url = tab === "installed" ? "/api/plugins/installed" : "/api/plugins";
      const data = await fetch(url, { headers: auth }).then(r => r.json());
      setPlugins(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [token, tab]);

  const handleInstall = async (pluginId: string, installed: boolean) => {
    setInstalling(pluginId);
    try {
      if (installed) {
        await fetch(`/api/plugins/${pluginId}/uninstall`, { method: "DELETE", headers: auth });
      } else {
        await fetch("/api/plugins/install", {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ pluginId }),
        });
      }
      await load();
    } finally { setInstalling(null); }
  };

  const filtered = plugins.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || p.category === category;
    return matchSearch && matchCat;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="flex space-x-1 bg-background rounded-md p-0.5 border border-border">
          {["all", "installed"].map(t => (
            <button key={t} onClick={() => setTab(t as any)}
              className={`flex-1 text-[11px] font-semibold py-1 rounded-sm transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "all" ? "Marketplace" : "Installed"}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plugins..."
            className="w-full h-7 pl-6 pr-6 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={11} /></button>}
        </div>
        {tab === "all" && (
          <div className="flex space-x-1 overflow-x-auto pb-1">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">No plugins found</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <div key={p.id} className="p-3 rounded-lg border border-border bg-background hover:border-muted-foreground/20 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2.5 min-w-0">
                    <span className="text-xl shrink-0 mt-0.5">{p.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-sm font-semibold truncate">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground">v{p.version}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{p.description}</p>
                      <div className="flex items-center space-x-2 mt-1.5">
                        <div className="flex items-center space-x-0.5 text-[10px] text-amber-400">
                          <Star size={9} fill="currentColor" />
                          <span>{p.rating}</span>
                        </div>
                        <div className="flex items-center space-x-0.5 text-[10px] text-muted-foreground">
                          <Download size={9} />
                          <span>{(p.downloads / 1000).toFixed(1)}k</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">{p.category}</Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={p.installed ? "outline" : "default"}
                    className={`ml-2 shrink-0 h-7 text-[11px] px-2 ${p.installed ? "text-muted-foreground" : ""}`}
                    disabled={installing === p.id}
                    onClick={() => handleInstall(p.id, p.installed)}
                  >
                    {installing === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> :
                      p.installed ? <><CheckCircle size={11} className="mr-1 text-green-400" />Installed</> :
                        "Install"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
