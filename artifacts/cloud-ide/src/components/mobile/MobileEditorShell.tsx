import React, { useState, useRef } from "react";
import { useIde } from "../../hooks/use-ide";
import { EditorTabs } from "../editor/EditorTabs";
import { MonacoEditor } from "../editor/MonacoEditor";
import { Button } from "../ui/button";
import { Play, Square, BrainCircuit, Save, Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "../../lib/utils";

interface MobileEditorShellProps {
  onOpenAi: () => void;
  onRun: () => void;
  isRunning: boolean;
  onStop: () => void;
}

export function MobileEditorShell({ onOpenAi, onRun, isRunning, onStop }: MobileEditorShellProps) {
  const { tabs, activeTabPath, setActiveTab, closeFile } = useIde();
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Swipeable tab chips — horizontal scroll row
  const tabsRef = useRef<HTMLDivElement>(null);

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
                "flex items-center shrink-0 h-6 px-3 rounded-full text-[11px] font-medium transition-all touch-manipulation gap-1",
                activeTabPath === tab.path
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "bg-[#2a2d2e] text-muted-foreground border border-transparent"
              )}
            >
              {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
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
        <MonacoEditor />

        {/* Fullscreen toggle — top-right corner */}
        <button
          onClick={() => setIsFullscreen(f => !f)}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/40 text-muted-foreground hover:text-foreground backdrop-blur-sm touch-manipulation"
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      {/* Quick actions bar — pinned above bottom nav */}
      <div className="flex items-center h-12 px-3 gap-2 bg-[#181818] border-t border-[#2d2d2d] shrink-0">
        {/* Run / Stop */}
        {isRunning ? (
          <Button
            size="sm"
            variant="destructive"
            className="flex-1 h-9 text-xs font-semibold touch-manipulation flex items-center gap-1.5"
            onClick={onStop}
          >
            <Square size={13} className="fill-current" /> Stop
          </Button>
        ) : (
          <Button
            size="sm"
            className="flex-1 h-9 text-xs font-semibold touch-manipulation flex items-center gap-1.5"
            onClick={onRun}
            disabled={!activeTabPath}
          >
            <Play size={13} className="fill-current" /> Run
          </Button>
        )}

        {/* AI assist */}
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-9 text-xs font-semibold touch-manipulation flex items-center gap-1.5 border-purple-700 text-purple-400 hover:bg-purple-900/20"
          onClick={onOpenAi}
        >
          <BrainCircuit size={13} /> AI Assist
        </Button>
      </div>
    </div>
  );
}
