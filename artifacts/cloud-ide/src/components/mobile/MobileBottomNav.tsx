import React, { useEffect, useRef } from "react";
import { Code2, Terminal, Rocket, Bot, Menu, Settings } from "lucide-react";

export type MobileView = "code" | "terminal" | "deploy" | "ai" | "settings" | "files";

interface MobileBottomNavProps {
  activeView: MobileView;
  onViewChange: (view: MobileView) => void;
  pendingWrites?: number;
}

const NAV_ITEMS: { id: MobileView; label: string; icon: React.ReactNode; badge?: boolean }[] = [
  { id: "files",    label: "Files",    icon: <Menu size={20} /> },
  { id: "code",     label: "Code",     icon: <Code2 size={20} /> },
  { id: "terminal", label: "Term",     icon: <Terminal size={20} /> },
  { id: "ai",       label: "AI",       icon: <Bot size={20} /> },
  { id: "deploy",   label: "Deploy",   icon: <Rocket size={20} /> },
  { id: "settings", label: "Settings", icon: <Settings size={20} /> },
];

export function MobileBottomNav({ activeView, onViewChange, pendingWrites = 0 }: MobileBottomNavProps) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Animate active pill position
  useEffect(() => {
    if (!navRef.current || !pillRef.current) return;
    const idx = NAV_ITEMS.findIndex(i => i.id === activeView);
    if (idx < 0) return;
    const buttons = navRef.current.querySelectorAll<HTMLButtonElement>("button");
    const btn = buttons[idx];
    if (!btn) return;
    const navRect = navRef.current.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const left = btnRect.left - navRect.left + btnRect.width / 2 - 16;
    pillRef.current.style.transform = `translateX(${left}px)`;
  }, [activeView]);

  return (
    <nav
      className="relative flex shrink-0 border-t border-border bg-background/95 backdrop-blur-xl safe-area-bottom"
      style={{ height: "58px" }}
    >
      {/* Sliding pill indicator */}
      <span
        ref={pillRef}
        className="absolute top-0 w-8 h-0.5 rounded-full bg-primary transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{ transform: "translateX(0px)" }}
      />

      <div ref={navRef} className="flex w-full">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const showBadge = item.id === "code" && pendingWrites > 0;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-all duration-200 touch-manipulation select-none
                active:scale-[0.88] ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={`relative transition-transform duration-200 ${isActive ? "scale-110" : "scale-100"}`}
              >
                {item.icon}
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-background animate-pulse" />
                )}
              </span>
              <span className={`text-[9px] font-semibold tracking-wide transition-colors ${isActive ? "text-primary" : ""}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
