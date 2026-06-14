import React, { useState } from "react";
import { useIde } from "../../hooks/use-ide";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Terminal, Play, Square, Loader2, PanelRight } from "lucide-react";

export function TopToolbar({ onToggleAiPanel }: { onToggleAiPanel: () => void }) {
  const { isRunning, setIsRunning, activeTabPath, tabs, addOutputLine, clearOutput } = useIde();
  const activeTab = tabs.find(t => t.path === activeTabPath);
  const [selectedLanguage, setSelectedLanguage] = useState(activeTab?.language || "node");

  // Update selected language when tab changes
  React.useEffect(() => {
    if (activeTab) setSelectedLanguage(activeTab.language);
  }, [activeTab]);

  const handleRun = async () => {
    if (!activeTabPath || !activeTab) return;
    setIsRunning(true);
    clearOutput();
    addOutputLine({ type: "system", text: `Running ${activeTabPath} with ${selectedLanguage}...` });

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: selectedLanguage,
          code: activeTab.content,
          filename: activeTabPath.split("/").pop()
        })
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                addOutputLine({ type: "stdout", text: data.content });
              }
              if (data.error) {
                addOutputLine({ type: "stderr", text: data.error });
              }
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      }
      addOutputLine({ type: "system", text: `Process exited.` });
    } catch (e: any) {
      addOutputLine({ type: "error", text: `Execution failed: ${e.message}` });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-10 items-center justify-between px-4 bg-background border-b border-border shrink-0">
      <div className="flex items-center space-x-3 text-sm font-semibold text-primary">
        <Terminal className="h-4 w-4" />
        <span>CloudIDE</span>
      </div>

      <div className="flex items-center space-x-2">
        <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
          <SelectTrigger className="h-7 w-[120px] bg-card text-xs border-muted-border">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="node">Node.js</SelectItem>
            <SelectItem value="python">Python</SelectItem>
            <SelectItem value="bash">Bash</SelectItem>
          </SelectContent>
        </Select>

        {isRunning ? (
          <Button variant="destructive" size="sm" className="h-7 px-3 text-xs flex items-center space-x-1" onClick={() => setIsRunning(false)}>
            <Square className="h-3 w-3 fill-current" />
            <span>Stop</span>
          </Button>
        ) : (
          <Button variant="default" size="sm" className="h-7 px-3 text-xs flex items-center space-x-1" onClick={handleRun} disabled={!activeTabPath}>
            <Play className="h-3 w-3 fill-current" />
            <span>Run</span>
          </Button>
        )}
      </div>

      <div>
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={onToggleAiPanel}>
          <PanelRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
