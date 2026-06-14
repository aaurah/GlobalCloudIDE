import React from "react";
import { Code2, Terminal, Rocket, Bot, Menu, Settings } from "lucide-react";

export type MobileView = "code" | "terminal" | "deploy" | "ai" | "settings" | "files";

interface MobileBottomNavProps {
  activeView: MobileView;
  onViewChange: (view: MobileView) => void;
}

const NAV_ITEMS: { id: MobileView; label: string; icon: React.ReactNode }[] = [
  { id: "files",    label: "Files",    icon: <Menu size={19} /> },
  { id: "code",     label: "Code",     icon: <Code2 size={19} /> },
  { id: "terminal", label: "Terminal", icon: <Terminal size={19} /> },
  { id: "ai",       label: "AI",       icon: <Bot size={19} /> },
  { id: "deploy",   label: "Deploy",   icon: <Rocket size={19} /> },
  { id: "settings", label: "Settings", icon: <Settings size={19} /> },
];

export function MobileBottomNav({ activeView, onViewChange }: MobileBottomNavProps) {
  return (
    <nav
      className="flex shrink-0 border-t border-border bg-background/98 backdrop-blur-md safe-area-bottom"
      style={{ height: "56px" }}
    >
      {NAV_ITEMS.map(item => {
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-all duration-150 touch-manipulation select-none active:scale-90 ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
            aria-label={item.label}
          >
            {/* Active pill indicator */}
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
            )}
            <span className={`transition-transform duration-150 ${isActive ? "scale-110" : "scale-100"}`}>
              {item.icon}
            </span>
            <span className="text-[9px] font-semibold tracking-wide">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
