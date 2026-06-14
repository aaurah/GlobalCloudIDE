import React, { useState, useRef, useEffect } from "react";
import { useIde } from "../../hooks/use-ide";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";
import { OutputLine } from "../../lib/ide-types";
import { Button } from "../ui/button";
import { Trash2, Copy, Check } from "lucide-react";

interface BottomPanelProps {
  /** fullHeight: fills all available space (mobile terminal view) */
  fullHeight?: boolean;
}

export function BottomPanel({ fullHeight = false }: BottomPanelProps) {
  const { outputLines, terminalLines, addTerminalLine, clearOutput } = useIde();
  const [activeTab, setActiveTab] = useState("output");
  const [terminalInput, setTerminalInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [copied, setCopied] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "output") outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [outputLines, activeTab]);

  useEffect(() => {
    if (activeTab === "terminal") terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLines, activeTab]);

  const handleTerminalSubmit = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      if (history[idx]) setTerminalInput(history[idx]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setTerminalInput(idx < 0 ? "" : history[idx] ?? "");
      return;
    }
    if (e.key !== "Enter" || !terminalInput.trim()) return;

    const cmd = terminalInput.trim();
    setTerminalInput("");
    setHistoryIdx(-1);
    setHistory(prev => [cmd, ...prev.slice(0, 49)]);
    addTerminalLine({ type: "stdout", text: `$ ${cmd}` });

    // Built-in commands
    if (cmd === "clear" || cmd === "cls") {
      clearOutput?.();
      return;
    }

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "bash", code: cmd })
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
              if (data.content) addTerminalLine({ type: "stdout", text: data.content });
              if (data.error) addTerminalLine({ type: "stderr", text: data.error });
            } catch {}
          }
        }
      }
    } catch (err: any) {
      addTerminalLine({ type: "error", text: err.message });
    }
  };

  const handleCopyOutput = () => {
    const text = outputLines.map(l => l.text).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const LineRenderer = ({ line }: { line: OutputLine }) => (
    <div className={cn(
      "font-mono text-[12px] sm:text-[13px] leading-5 break-all",
      line.type === "stderr" || line.type === "error" ? "text-destructive" :
      line.type === "info" ? "text-muted-foreground" :
      line.type === "system" ? "text-primary" :
      "text-foreground"
    )}>
      {line.text}
    </div>
  );

  return (
    <div className={cn("flex flex-col bg-card border-t border-border", fullHeight ? "h-full" : "h-full")}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        {/* Tab bar with action buttons */}
        <div className="flex items-center px-2 h-9 border-b border-border shrink-0 gap-2">
          <TabsList className="h-7 bg-transparent space-x-1">
            <TabsTrigger value="output" className="text-xs h-6 px-3 data-[state=active]:bg-muted">Output</TabsTrigger>
            <TabsTrigger value="terminal" className="text-xs h-6 px-3 data-[state=active]:bg-muted">Terminal</TabsTrigger>
          </TabsList>
          <div className="flex items-center space-x-1 ml-auto">
            {activeTab === "output" && (
              <>
                <Button variant="ghost" size="icon" className="h-6 w-6 touch-manipulation" onClick={handleCopyOutput} title="Copy output">
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 touch-manipulation text-muted-foreground hover:text-red-400" onClick={clearOutput} title="Clear output">
                  <Trash2 size={12} />
                </Button>
              </>
            )}
            {activeTab === "terminal" && (
              <Button variant="ghost" size="icon" className="h-6 w-6 touch-manipulation text-muted-foreground hover:text-red-400" onClick={() => addTerminalLine({ type: "system", text: "--- cleared ---" })} title="Clear terminal">
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        </div>
        
        {/* Output tab */}
        <TabsContent value="output" className="flex-1 min-h-0 m-0 outline-none p-0">
          <ScrollArea className="h-full w-full">
            <div className="p-3">
              {outputLines.length === 0 ? (
                <div className="text-muted-foreground text-xs italic">No output. Run some code!</div>
              ) : (
                outputLines.map((line, i) => <LineRenderer key={i} line={line} />)
              )}
              <div ref={outputEndRef} />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Terminal tab */}
        <TabsContent value="terminal" className="flex-1 min-h-0 m-0 outline-none p-0 flex flex-col">
          <ScrollArea className="flex-1 w-full">
            <div className="p-3">
              {terminalLines.length === 0 && (
                <div className="text-muted-foreground text-xs italic">Bash terminal — type a command below</div>
              )}
              {terminalLines.map((line, i) => <LineRenderer key={i} line={line} />)}
              <div ref={terminalEndRef} />
            </div>
          </ScrollArea>

          {/* Terminal input — taller on mobile for easier touch */}
          <div
            className="flex items-center px-3 shrink-0 bg-background border-t border-border font-mono text-[13px] cursor-text h-10 sm:h-8"
            onClick={() => inputRef.current?.focus()}
          >
            <span className="text-primary mr-2 select-none">$</span>
            <input
              ref={inputRef}
              type="text"
              value={terminalInput}
              onChange={e => setTerminalInput(e.target.value)}
              onKeyDown={handleTerminalSubmit}
              className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground touch-manipulation"
              placeholder="bash command..."
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              enterKeyHint="send"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
