import React, { useState } from "react";
import { Plus, Play, BrainCircuit, FileCode, FolderOpen, X } from "lucide-react";
import type { MobileView } from "./MobileBottomNav";
import { cn } from "../../lib/utils";

interface FabAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color: string;
}

interface FloatingActionButtonProps {
  activeView: MobileView;
  onRun?: () => void;
  onOpenAi?: () => void;
  onNewFile?: () => void;
  onOpenFiles?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
}

export function FloatingActionButton({
  activeView,
  onRun,
  onOpenAi,
  onNewFile,
  onOpenFiles,
  isRunning,
  disabled,
}: FloatingActionButtonProps) {
  const [expanded, setExpanded] = useState(false);

  // Context-sensitive primary action per view
  const getPrimaryAction = () => {
    switch (activeView) {
      case "code":
        return {
          icon: isRunning ? <X size={20} /> : <Play size={20} />,
          color: isRunning ? "bg-destructive shadow-destructive/30" : "bg-primary shadow-primary/30",
          label: isRunning ? "Stop" : "Run",
          onClick: onRun,
        };
      case "ai":
        return { icon: <BrainCircuit size={20} />, color: "bg-purple-600 shadow-purple-600/30", label: "Ask AI", onClick: onOpenAi };
      case "files":
        return { icon: <FileCode size={20} />, color: "bg-green-600 shadow-green-600/30", label: "New File", onClick: onNewFile };
      default:
        return null;
    }
  };

  const expandableActions: FabAction[] = [
    { label: "Run Code",  icon: <Play size={16} />,          onClick: () => { onRun?.(); setExpanded(false); },       color: "bg-primary text-primary-foreground" },
    { label: "Ask AI",    icon: <BrainCircuit size={16} />,  onClick: () => { onOpenAi?.(); setExpanded(false); },    color: "bg-purple-600 text-white" },
    { label: "New File",  icon: <FileCode size={16} />,      onClick: () => { onNewFile?.(); setExpanded(false); },   color: "bg-green-600 text-white" },
    { label: "Files",     icon: <FolderOpen size={16} />,    onClick: () => { onOpenFiles?.(); setExpanded(false); }, color: "bg-blue-600 text-white" },
  ];

  const primary = getPrimaryAction();

  if (activeView === "terminal" || activeView === "deploy" || activeView === "settings") {
    return null;
  }

  if (primary && !expanded) {
    return (
      <button
        onClick={primary.onClick}
        disabled={disabled}
        className={cn(
          "fixed bottom-20 right-4 z-20 w-12 h-12 rounded-full flex items-center justify-center shadow-xl text-white transition-all duration-200 active:scale-90 touch-manipulation",
          primary.color,
          "disabled:opacity-40 disabled:scale-100"
        )}
        aria-label={primary.label}
      >
        {primary.icon}
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Expanded actions */}
      {expanded && (
        <div className="fixed bottom-24 right-4 z-30 flex flex-col items-end gap-2">
          {expandableActions.map((action, i) => (
            <div
              key={action.label}
              className="flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in"
              style={{ animationDelay: `${i * 40}ms`, animationDuration: "200ms" }}
            >
              <span className="text-[11px] font-semibold text-white bg-black/70 rounded-full px-2.5 py-1">
                {action.label}
              </span>
              <button
                onClick={action.onClick}
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center shadow-lg touch-manipulation active:scale-90",
                  action.color
                )}
              >
                {action.icon}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setExpanded(o => !o)}
        className={cn(
          "fixed bottom-20 right-4 z-30 w-12 h-12 rounded-full flex items-center justify-center shadow-xl text-white transition-all duration-300 touch-manipulation",
          expanded ? "bg-muted/80 rotate-45 scale-110" : "bg-primary shadow-primary/30 active:scale-90"
        )}
        aria-label="Actions"
      >
        <Plus size={20} />
      </button>
    </>
  );
}
