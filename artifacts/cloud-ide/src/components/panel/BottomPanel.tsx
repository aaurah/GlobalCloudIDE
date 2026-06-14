import React, { useState, useRef, useEffect, useCallback } from "react";
import { useIde } from "../../hooks/use-ide";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";
import { OutputLine } from "../../lib/ide-types";
import { Button } from "../ui/button";
import { Trash2, Copy, Check, Send, ChevronUp } from "lucide-react";

interface BottomPanelProps {
  fullHeight?: boolean;
}

function useLongPress(onLongPress: () => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const pos = "touches" in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };
    startRef.current = pos;
    timerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(30);
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    startRef.current = null;
  }, []);

  const move = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return;
    const dx = e.touches[0].clientX - startRef.current.x;
    const dy = e.touches[0].clientY - startRef.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancel();
  }, [cancel]);

  return { onMouseDown: start, onTouchStart: start, onMouseUp: cancel, onTouchEnd: cancel, onTouchMove: move, onMouseLeave: cancel };
}

function LineItem({ line, onCopy }: { line: OutputLine; onCopy: (text: string) => void }) {
  const [flash, setFlash] = useState(false);
  const longPress = useLongPress(() => {
    onCopy(line.text);
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
  });

  return (
    <div
      className={cn(
        "font-mono text-[12px] sm:text-[13px] leading-5 break-all rounded px-0.5 transition-colors select-text cursor-default",
        flash && "bg-primary/20",
        line.type === "stderr" || line.type === "error" ? "text-destructive" :
        line.type === "info" ? "text-muted-foreground" :
        line.type === "system" ? "text-primary" :
        "text-foreground"
      )}
      {...longPress}
    >
      {line.text}
    </div>
  );
}

function useSwipeToClear(ref: React.RefObject<HTMLElement | null>, onClear: () => void) {
  const startX = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - startY.current);
      if (dx > 80 && dy < 30) onClear();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [ref, onClear]);
}

export function BottomPanel({ fullHeight = false }: BottomPanelProps) {
  const { outputLines, terminalLines, addTerminalLine, clearOutput } = useIde();
  const [activeTab, setActiveTab] = useState("output");
  const [terminalInput, setTerminalInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputScrollRef = useRef<HTMLDivElement>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "output") outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [outputLines, activeTab]);

  useEffect(() => {
    if (activeTab === "terminal") terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLines, activeTab]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 1800);
  };

  const handleCopyLine = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast("Line copied")).catch(() => {});
  }, []);

  const handleCopyOutput = () => {
    const text = outputLines.map(l => l.text).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const clearAll = useCallback(() => {
    clearOutput?.();
    showToast("Output cleared");
  }, [clearOutput]);

  const clearTerminal = useCallback(() => {
    addTerminalLine({ type: "system", text: "--- cleared ---" });
    showToast("Terminal cleared");
  }, [addTerminalLine]);

  useSwipeToClear(outputScrollRef, clearAll);
  useSwipeToClear(terminalScrollRef, clearTerminal);

  const submitCommand = async () => {
    const cmd = terminalInput.trim();
    if (!cmd) return;
    setTerminalInput("");
    setHistoryIdx(-1);
    setHistory(prev => [cmd, ...prev.slice(0, 49)]);
    addTerminalLine({ type: "stdout", text: `$ ${cmd}` });

    if (cmd === "clear" || cmd === "cls") {
      clearOutput?.();
      return;
    }

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "bash", code: cmd }),
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

  const handleTerminalKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    if (e.key === "Enter") { await submitCommand(); }
  };

  return (
    <div className={cn("flex flex-col bg-card border-t border-border relative", fullHeight ? "h-full" : "h-full")}>
      {/* Copy toast */}
      {toastMsg && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 bg-foreground/90 text-background text-[11px] font-medium px-3 py-1 rounded-full shadow pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          {toastMsg}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        {/* Tab bar */}
        <div className="flex items-center px-2 h-9 border-b border-border shrink-0 gap-2">
          <TabsList className="h-7 bg-transparent space-x-1">
            <TabsTrigger value="output" className="text-xs h-6 px-3 data-[state=active]:bg-muted">Output</TabsTrigger>
            <TabsTrigger value="terminal" className="text-xs h-6 px-3 data-[state=active]:bg-muted">Terminal</TabsTrigger>
          </TabsList>
          <div className="flex items-center space-x-1 ml-auto">
            {activeTab === "output" && (
              <>
                <Button variant="ghost" size="icon" className="h-6 w-6 touch-manipulation" onClick={handleCopyOutput} title="Copy all output">
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 touch-manipulation text-muted-foreground hover:text-red-400" onClick={clearAll} title="Clear output (or swipe right)">
                  <Trash2 size={12} />
                </Button>
              </>
            )}
            {activeTab === "terminal" && (
              <Button variant="ghost" size="icon" className="h-6 w-6 touch-manipulation text-muted-foreground hover:text-red-400" onClick={clearTerminal} title="Clear terminal (or swipe right)">
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        </div>

        {/* Output tab */}
        <TabsContent value="output" className="flex-1 min-h-0 m-0 outline-none p-0">
          <ScrollArea className="h-full w-full">
            <div ref={outputScrollRef as any} className="p-3">
              {outputLines.length === 0 ? (
                <div className="text-muted-foreground text-xs italic">No output. Run some code!</div>
              ) : (
                <>
                  <div className="text-[9px] text-muted-foreground/50 mb-2 select-none">Hold to copy a line · Swipe right to clear</div>
                  {outputLines.map((line, i) => <LineItem key={i} line={line} onCopy={handleCopyLine} />)}
                </>
              )}
              <div ref={outputEndRef} />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Terminal tab */}
        <TabsContent value="terminal" className="flex-1 min-h-0 m-0 outline-none p-0 flex flex-col">
          <ScrollArea className="flex-1 w-full">
            <div ref={terminalScrollRef as any} className="p-3">
              {terminalLines.length === 0 && (
                <>
                  <div className="text-muted-foreground text-xs italic">Bash terminal — type a command below</div>
                  <div className="text-[9px] text-muted-foreground/50 mt-1 select-none">Hold to copy a line · Swipe right to clear</div>
                </>
              )}
              {terminalLines.map((line, i) => <LineItem key={i} line={line} onCopy={handleCopyLine} />)}
              <div ref={terminalEndRef} />
            </div>
          </ScrollArea>

          {/* Terminal input row — taller on mobile, with Send button */}
          <div
            className="flex items-center px-3 shrink-0 bg-background border-t border-border font-mono text-[13px] cursor-text h-12 sm:h-9 gap-2"
            onClick={() => inputRef.current?.focus()}
          >
            <span className="text-primary select-none">$</span>
            <input
              ref={inputRef}
              type="text"
              value={terminalInput}
              onChange={e => setTerminalInput(e.target.value)}
              onKeyDown={handleTerminalKeyDown}
              className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground touch-manipulation min-w-0"
              placeholder="bash command..."
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              enterKeyHint="send"
            />
            {/* History shortcut on mobile */}
            {history.length > 0 && (
              <button
                className="text-muted-foreground p-1 touch-manipulation shrink-0"
                onClick={e => {
                  e.stopPropagation();
                  const next = Math.min(historyIdx + 1, history.length - 1);
                  setHistoryIdx(next);
                  setTerminalInput(history[next] ?? "");
                  inputRef.current?.focus();
                }}
                title="Previous command"
              >
                <ChevronUp size={14} />
              </button>
            )}
            {/* Send button for mobile soft keyboards */}
            <button
              className={cn(
                "shrink-0 rounded-md p-1.5 touch-manipulation transition-colors",
                terminalInput.trim()
                  ? "text-primary hover:bg-primary/10 active:scale-90"
                  : "text-muted-foreground/40 cursor-default"
              )}
              onClick={e => { e.stopPropagation(); submitCommand(); }}
              disabled={!terminalInput.trim()}
              aria-label="Send command"
            >
              <Send size={14} />
            </button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
