import React from "react";
import { Code2, Terminal, Rocket, Bot, Files } from "lucide-react";

export type MobileView = "code" | "terminal" | "deploy" | "ai" | "files";

interface MobileBottomNavProps {
  activeView: MobileView;
  onViewChange: (view: MobileView) => void;
}

const NAV_ITEMS: { id: MobileView; label: string; icon: React.ReactNode }[] = [
  { id: "files",    label: "Files",    icon: <Files size={18} /> },
  { id: "code",     label: "Code",     icon: <Code2 size={18} /> },
  { id: "terminal", label: "Terminal", icon: <Terminal size={18} /> },
  { id: "ai",       label: "AI",       icon: <Bot size={18} /> },
  { id: "deploy",   label: "Deploy",   icon: <Rocket size={18} /> },
];

export function MobileBottomNav({ activeView, onViewChange }: MobileBottomNavProps) {
  return (
    <nav className="flex h-14 shrink-0 border-t border-border bg-background/95 backdrop-blur-md safe-area-bottom">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => onViewChange(item.id)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors touch-manipulation select-none active:scale-95 ${
            activeView === item.id
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label={item.label}
        >
          <span className={`transition-all ${activeView === item.id ? "scale-110" : ""}`}>
            {item.icon}
          </span>
          <span className="text-[9px] font-semibold tracking-wide">{item.label}</span>
          {activeView === item.id && (
            <span className="absolute bottom-1 w-4 h-0.5 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </nav>
  );
}
