import React, { useState, useRef } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Loader2, Sparkles, CheckCircle, AlertTriangle, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";

interface InfraPreset {
  id: string;
  name: string;
  description: string;
  template: Record<string, unknown>;
}

interface GeneratedConfig {
  container?: { base: string; build: string[]; run: string; ports: number[]; resources: { cpuLimit: number; memoryMb: number } };
  scaling?: { minInstances: number; maxInstances: number; targetCpuPercent: number };
  routing?: { protocol: string; healthCheck: string; loadBalancing: string; regions: string[] };
  monitoring?: { alertCpuThreshold: number; alertMemoryThreshold: number; logLevel: string };
  explanation?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function JsonSection({ title, data, defaultOpen = false }: { title: string; data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden mb-2">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 text-xs font-semibold text-left">
        <span>{title}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <pre className="p-3 text-[10px] font-mono text-muted-foreground overflow-x-auto bg-black/10 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function InfraGenerator() {
  const { token } = usePlatform();
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [generatedConfig, setGeneratedConfig] = useState<GeneratedConfig | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [presets, setPresets] = useState<InfraPreset[]>([]);
  const [copied, setCopied] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadPresets = async () => {
    if (!token) return;
    const data = await fetch("/api/infragen/presets", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setPresets(Array.isArray(data) ? data : []);
  };

  React.useEffect(() => { loadPresets(); }, [token]);
  React.useEffect(() => { if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; }, [streamLines]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    setIsGenerating(true);
    setStreamLines([]);
    setGeneratedConfig(null);
    setValidation(null);

    try {
      const res = await fetch("/api/infragen/generate", { method: "POST", headers: auth, body: JSON.stringify({ description, projectType }) });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "status") setStreamLines(p => [...p, `[status] ${data.content}`]);
            if (data.type === "stream") setStreamLines(p => {
              const last = p[p.length - 1] ?? "";
              if (last.startsWith("[generating]")) return [...p.slice(0, -1), last + data.content];
              return [...p, "[generating] " + data.content];
            });
            if (data.type === "parsing") setStreamLines(p => [...p, `\n[${data.content}]`]);
            if (data.type === "done" && data.config) setGeneratedConfig(data.config as GeneratedConfig);
            if (data.type === "error") setStreamLines(p => [...p, `[error] ${data.content}`]);
          } catch {}
        }
      }
    } finally { setIsGenerating(false); }
  };

  const handleValidate = async () => {
    if (!generatedConfig) return;
    setIsValidating(true);
    try {
      const result = await fetch("/api/infragen/validate", { method: "POST", headers: auth, body: JSON.stringify({ config: generatedConfig }) }).then(r => r.json());
      setValidation(result);
    } finally { setIsValidating(false); }
  };

  const handleCopy = () => {
    if (!generatedConfig) return;
    navigator.clipboard.writeText(JSON.stringify(generatedConfig, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePreset = (preset: InfraPreset) => {
    setGeneratedConfig({ container: preset.template as any });
    setStreamLines([]);
    setValidation(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="p-3 space-y-3">
        {/* Input */}
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Describe Your Infrastructure</div>
          <form onSubmit={handleGenerate} className="space-y-2">
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. A Python FastAPI service that processes images using ML models, needs GPU access, handles 100 req/s, deployed globally with low latency..."
              disabled={isGenerating}
              className="min-h-[80px] text-xs resize-none bg-background border-border"
            />
            <input value={projectType} onChange={e => setProjectType(e.target.value)} placeholder="Project type (optional: api, ml, worker, static...)" className="w-full h-7 px-2 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground" />
            <Button type="submit" disabled={isGenerating || !description.trim()} className="w-full h-8 text-xs bg-gradient-to-r from-purple-700 to-blue-700 text-white border-0">
              {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Generating...</> : <><Sparkles size={12} className="mr-1.5" />Generate Infrastructure</>}
            </Button>
          </form>
        </div>

        {/* Presets */}
        {!generatedConfig && presets.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Quick Presets</div>
            <div className="grid grid-cols-1 gap-1.5">
              {presets.map(p => (
                <button key={p.id} onClick={() => handlePreset(p)} className="text-left p-2.5 rounded border border-border bg-background hover:border-primary/40 transition-colors">
                  <div className="text-xs font-semibold">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">{p.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stream */}
        {(streamLines.length > 0 || isGenerating) && (
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Generation Stream</div>
            <div ref={streamRef} className="h-28 overflow-y-auto p-2 bg-black/20 rounded border border-border font-mono text-[10px] text-muted-foreground">
              {streamLines.map((l, i) => (
                <div key={i} className={l.startsWith("[error]") ? "text-red-400" : l.startsWith("[status]") ? "text-blue-400" : l.startsWith("[generating]") ? "text-muted-foreground/70" : "text-foreground"}>
                  {l}
                </div>
              ))}
              {isGenerating && <span className="text-purple-400 animate-pulse">▍</span>}
            </div>
          </div>
        )}

        {/* Generated config */}
        {generatedConfig && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Generated Config</div>
              <div className="flex space-x-1">
                <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" disabled={isValidating} onClick={handleValidate}>
                  {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Validate"}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={handleCopy}>
                  {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                </Button>
              </div>
            </div>

            {validation && (
              <div className={`mb-2 p-2 rounded border text-[11px] ${validation.valid ? "border-green-900/30 bg-green-900/10" : "border-red-900/30 bg-red-900/10"}`}>
                <div className={`flex items-center space-x-1.5 font-semibold mb-1 ${validation.valid ? "text-green-400" : "text-red-400"}`}>
                  {validation.valid ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                  <span>{validation.valid ? "Valid configuration" : "Validation failed"}</span>
                </div>
                {validation.errors.map((e, i) => <div key={i} className="text-red-400">✗ {e}</div>)}
                {validation.warnings.map((w, i) => <div key={i} className="text-amber-400">⚠ {w}</div>)}
              </div>
            )}

            {generatedConfig.explanation && (
              <div className="mb-2 p-2.5 rounded-lg border border-blue-900/30 bg-blue-900/10 text-[11px] text-muted-foreground italic">
                {generatedConfig.explanation}
              </div>
            )}

            {generatedConfig.container && <JsonSection title="Container" data={generatedConfig.container} defaultOpen />}
            {generatedConfig.scaling && <JsonSection title="Scaling" data={generatedConfig.scaling} />}
            {generatedConfig.routing && <JsonSection title="Routing" data={generatedConfig.routing} />}
            {generatedConfig.monitoring && <JsonSection title="Monitoring" data={generatedConfig.monitoring} />}
          </div>
        )}
      </div>
    </div>
  );
}
