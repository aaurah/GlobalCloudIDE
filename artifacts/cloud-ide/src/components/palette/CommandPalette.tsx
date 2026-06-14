import React, { useState, useEffect, useRef } from "react";
import { useIde } from "../../hooks/use-ide";
import { 
  Wand2, 
  PenTool, 
  Lightbulb, 
  SplitSquareVertical, 
  FileCode, 
  Gauge,
  MessageSquare,
  FileText,
  Search
} from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";

export function CommandPalette({ onOpenAiPanel }: { onOpenAiPanel: () => void }) {
  const { 
    isPaletteOpen, 
    closePalette, 
    setAiAction, 
    setAiPrompt, 
    setAiPanelTab,
    setAgentMode,
    activeTabPath
  } = useIde();
  
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isPaletteOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isPaletteOpen]);

  const commands = [
    {
      id: "generate",
      icon: <Wand2 size={14} />,
      label: "Generate File",
      category: "AI",
      shortcut: undefined,
      action: () => {
        setAiPanelTab("assistant");
        setAiAction("generate");
        setAiPrompt("");
        onOpenAiPanel();
      }
    },
    {
      id: "fix",
      icon: <PenTool size={14} />,
      label: "Fix Error in Active File",
      category: "AI",
      shortcut: undefined,
      action: () => {
        if (!activeTabPath) return;
        setAiPanelTab("assistant");
        setAiAction("fix");
        setAiPrompt("");
        onOpenAiPanel();
      }
    },
    {
      id: "explain",
      icon: <Lightbulb size={14} />,
      label: "Explain Active File",
      category: "AI",
      shortcut: undefined,
      action: () => {
        if (!activeTabPath) return;
        setAiPanelTab("assistant");
        setAiAction("explain");
        setAiPrompt("");
        onOpenAiPanel();
      }
    },
    {
      id: "refactor",
      icon: <SplitSquareVertical size={14} />,
      label: "Refactor Active File",
      category: "AI",
      shortcut: undefined,
      action: () => {
        if (!activeTabPath) return;
        setAiPanelTab("assistant");
        setAiAction("refactor");
        setAiPrompt("");
        onOpenAiPanel();
      }
    },
    {
      id: "create-component",
      icon: <FileCode size={14} />,
      label: "Create Component",
      category: "AI",
      shortcut: undefined,
      action: () => {
        setAiPanelTab("assistant");
        setAiAction("generate");
        setAiPrompt("Create a React component");
        onOpenAiPanel();
      }
    },
    {
      id: "optimize-perf",
      icon: <Gauge size={14} />,
      label: "Optimize Performance",
      category: "AI",
      shortcut: undefined,
      action: () => {
        if (!activeTabPath) return;
        setAiPanelTab("assistant");
        setAiAction("refactor");
        setAiPrompt("Optimize for performance");
        onOpenAiPanel();
      }
    },
    {
      id: "add-comments",
      icon: <MessageSquare size={14} />,
      label: "Add Comments",
      category: "Agent",
      shortcut: undefined,
      action: () => {
        if (!activeTabPath) return;
        setAiPanelTab("agent");
        setAgentMode("builder");
        setAiPrompt(`Add descriptive comments to ${activeTabPath}`);
        onOpenAiPanel();
      }
    },
    {
      id: "document-project",
      icon: <FileText size={14} />,
      label: "Document Project",
      category: "Agent",
      shortcut: undefined,
      action: () => {
        setAiPanelTab("agent");
        setAgentMode("builder");
        setAiPrompt("Generate README.md for this project");
        onOpenAiPanel();
      }
    }
  ];

  const filteredCommands = commands.filter(c => 
    c.label.toLowerCase().includes(search.toLowerCase()) || 
    c.category.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPaletteOpen) return;
      
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          closePalette();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPaletteOpen, filteredCommands, selectedIndex, closePalette]);

  if (!isPaletteOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[15vh]">
      <div 
        className="w-full max-w-lg bg-[#1a1a1f] border border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-white/10">
          <Search className="w-5 h-5 text-muted-foreground mr-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-[15px]"
          />
        </div>
        
        <ScrollArea className="max-h-96">
          <div className="p-2">
            {filteredCommands.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No commands found.
              </div>
            ) : (
              filteredCommands.map((cmd, idx) => (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    closePalette();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center px-3 py-2.5 rounded-md cursor-pointer text-sm transition-colors ${
                    idx === selectedIndex 
                      ? "bg-amber-600/20 text-amber-500" 
                      : "text-foreground hover:bg-white/5"
                  }`}
                >
                  <div className="w-5 h-5 flex items-center justify-center mr-3 shrink-0 opacity-80">
                    {cmd.icon}
                  </div>
                  <span className="flex-1 font-medium">{cmd.label}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-white/5 text-muted-foreground">
                      {cmd.category}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
