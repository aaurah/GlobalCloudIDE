import React, { useState, useRef, useCallback } from "react";
import { useIde } from "../../hooks/use-ide";
import { EditorTabs } from "../editor/EditorTabs";
import { MonacoEditor } from "../editor/MonacoEditor";
import { Button } from "../ui/button";
import { Play, Square, BrainCircuit, Save, Maximize2, Minimize2, X, Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { useOfflineCache } from "../../hooks/use-offline-cache";
import { useWriteFile } from "@workspace/api-client-react";

const LANGUAGES = [
  { value: "node",   label: "Node.js" },
  { value: "python", label: "Python" },
  { value: "bash",   label: "Bash" },
];

interface MobileEditorShellProps {
  onOpenAi: () => void;
  onRun: () => void;
  isRunning: boolean;
  onStop: () => void;
  selectedLang?: string;
  onLangChange?: (lang: string) => void;
}

export function MobileEditorShell({ onOpenAi, onRun, isRunning, onStop, selectedLang = "node", onLangChange }: MobileEditorShellProps) {
  const { tabs, activeTabPath, setActiveTab, closeFile, updateTabContent, markTabClean } = useIde();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveDone, setSaveDone] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const { queueWrite, isOnline } = useOfflineCache();
  const writeFile = useWriteFile();

  const activeTab = tabs.find(t => t.path === activeTabPath);

  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTabPath || isSaving) return;
    setIsSaving(true);
    try {
      if (isOnline) {
        await writeFile.mutateAsync({ data: { path: activeTabPath, content: activeTab.content } });
      } else {
        queueWrite(activeTabPath, activeTab.content);
      }
      markTabClean(activeTabPath);
      setSaveDone(true);
      setTimeout(() => setSaveDone(false), 1500);
    } catch {
      // silently queue for later
      queueWrite(activeTabPath, activeTab.content);
    } finally {
      setIsSaving(false);
    }
  }, [activeTab, activeTabPath, isSaving, isOnline, writeFile, queueWrite, markTabClean]);

  return (
    <div className={cn(
      "flex flex-col bg-[#1e1e1e] transition-all duration-200",
      isFullscreen ? "fixed inset-0 z-30" : "h-full"
    )}>
      {/* Swipeable file chips */}
      {tabs.length > 0 && (
        <div
          ref={tabsRef}
          className="flex h-9 items-center gap-1.5 px-2 bg-[#181818] border-b border-[#2d2d2d] overflow-x-auto scrollbar-hide shrink-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {tabs.map(tab => (
            <button
              key={tab.path}
              onClick={() => setActiveTab(tab.path)}
              className={cn(
                "flex items-center shrink-0 h-6 px-3 rounded-full text-[11px] font-medium transition-all touch-manipulation gap-1 active:scale-95",
                activeTabPath === tab.path
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "bg-[#2a2d2e] text-muted-foreground border border-transparent"
              )}
            >
              {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />}
              <span>{tab.path.split("/").pop()}</span>
              <span
                onClick={(e) => { e.stopPropagation(); closeFile(tab.path); }}
                className="ml-0.5 opacity-60 hover:opacity-100 p-0.5 rounded-full hover:bg-white/10 touch-manipulation"
              >
                <X size={9} />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Editor — fills remaining space */}
      <div className="flex-1 min-h-0 relative">
        <MonacoEditor hideEmptyState />

        {/* Fullscreen toggle */}
        <button
          onClick={() => setIsFullscreen(f => !f)}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/50 text-muted-foreground hover:text-foreground backdrop-blur-sm touch-manipulation"
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>

        {/* Empty state */}
        {tabs.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="w-12 h-12 rounded-2xl bg-muted/20 flex items-center justify-center">
              <BrainCircuit size={22} className="text-primary/50" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No file open</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Open a file from the Files panel</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick actions bar */}
      <div className="flex items-center h-12 px-3 gap-2 bg-[#181818] border-t border-[#2d2d2d] shrink-0">
        {/* Run / Stop */}
        {isRunning ? (
          <Button
            size="sm"
            variant="destructive"
            className="flex-1 h-9 text-xs font-semibold touch-manipulation flex items-center gap-1.5 active:scale-95"
            onClick={onStop}
          >
            <Square size={12} className="fill-current" /> Stop
          </Button>
        ) : (
          <Button
            size="sm"
            className="flex-1 h-9 text-xs font-semibold touch-manipulation flex items-center gap-1.5 active:scale-95"
            onClick={onRun}
            disabled={!activeTabPath}
          >
            <Play size={12} className="fill-current" /> Run
          </Button>
        )}

        {/* Save */}
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-9 px-3 text-xs font-semibold touch-manipulation flex items-center gap-1 border active:scale-95",
            saveDone ? "border-green-600/40 text-green-400" : activeTab?.isDirty ? "border-amber-600/40 text-amber-400" : "border-border text-muted-foreground"
          )}
          onClick={handleSave}
          disabled={!activeTabPath || isSaving}
        >
          {saveDone ? <Check size={12} /> : <Save size={12} />}
        </Button>

        {/* Language picker */}
        <div className="relative">
          <button
            onClick={() => setLangOpen(o => !o)}
            className="flex items-center gap-1 h-9 px-2.5 rounded-md border border-border text-[10px] font-semibold text-muted-foreground bg-[#2a2d2e] touch-manipulation active:scale-95"
          >
            {LANGUAGES.find(l => l.value === selectedLang)?.label ?? "Node.js"}
            <ChevronDown size={10} className={`transition-transform ${langOpen ? "rotate-180" : ""}`} />
          </button>
          {langOpen && (
            <div className="absolute bottom-full right-0 mb-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-20 min-w-[110px]">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.value}
                  onClick={() => { onLangChange?.(lang.value); setLangOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left touch-manipulation hover:bg-muted/50",
                    selectedLang === lang.value && "text-primary bg-primary/10"
                  )}
                >
                  {selectedLang === lang.value && <Check size={10} />}
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI assist */}
        <Button
          size="sm"
          variant="outline"
          className="h-9 px-3 text-xs font-semibold touch-manipulation flex items-center gap-1 border-purple-700/50 text-purple-400 hover:bg-purple-900/20 active:scale-95"
          onClick={onOpenAi}
        >
          <BrainCircuit size={13} />
        </Button>
      </div>
    </div>
  );
}
