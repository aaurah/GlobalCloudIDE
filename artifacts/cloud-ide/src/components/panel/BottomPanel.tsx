import React, { useState, useRef, useEffect } from "react";
import { useIde } from "../../hooks/use-ide";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";
import { OutputLine } from "../../lib/ide-types";

export function BottomPanel() {
  const { outputLines, terminalLines, addTerminalLine } = useIde();
  const [activeTab, setActiveTab] = useState("output");
  const [terminalInput, setTerminalInput] = useState("");
  const outputEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "output") outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
    if (activeTab === "terminal") terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [outputLines, terminalLines, activeTab]);

  const handleTerminalSubmit = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && terminalInput.trim()) {
      const cmd = terminalInput.trim();
      setTerminalInput("");
      addTerminalLine({ type: "stdout", text: `$ ${cmd}` });
      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: "bash",
            code: cmd
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
                  addTerminalLine({ type: "stdout", text: data.content });
                }
                if (data.error) {
                  addTerminalLine({ type: "stderr", text: data.error });
                }
              } catch (e) {
                // ignore
              }
            }
          }
        }
      } catch (err: any) {
        addTerminalLine({ type: "error", text: err.message });
      }
    }
  };

  const LineRenderer = ({ line }: { line: OutputLine }) => {
    return (
      <div className={cn(
        "font-mono text-[13px] leading-tight break-all",
        line.type === "stderr" || line.type === "error" ? "text-destructive" :
        line.type === "info" ? "text-muted-foreground" :
        line.type === "system" ? "text-primary" :
        "text-foreground"
      )}>
        {line.text}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-card border-t border-border">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center px-2 h-9 border-b border-border shrink-0">
          <TabsList className="h-7 bg-transparent space-x-1">
            <TabsTrigger value="output" className="text-xs h-6 px-3 data-[state=active]:bg-muted">Output</TabsTrigger>
            <TabsTrigger value="terminal" className="text-xs h-6 px-3 data-[state=active]:bg-muted">Terminal</TabsTrigger>
          </TabsList>
        </div>
        
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

        <TabsContent value="terminal" className="flex-1 min-h-0 m-0 outline-none p-0 flex flex-col">
          <ScrollArea className="flex-1 w-full">
            <div className="p-3">
              {terminalLines.map((line, i) => <LineRenderer key={i} line={line} />)}
              <div ref={terminalEndRef} />
            </div>
          </ScrollArea>
          <div className="flex items-center h-8 px-3 shrink-0 bg-background border-t border-border font-mono text-[13px]">
            <span className="text-primary mr-2">$</span>
            <input
              type="text"
              value={terminalInput}
              onChange={e => setTerminalInput(e.target.value)}
              onKeyDown={handleTerminalSubmit}
              className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
              placeholder="bash command..."
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
