import React from "react";
import { useIde } from "../../hooks/use-ide";

export function StatusBar() {
  const { activeTabPath, tabs, cursorPosition } = useIde();
  const activeTab = tabs.find(t => t.path === activeTabPath);

  return (
    <div className="flex h-6 items-center justify-between px-4 bg-sidebar border-t border-sidebar-border text-[11px] text-muted-foreground shrink-0 select-none">
      <div className="flex space-x-4">
        <span>{activeTabPath || "No file open"}</span>
        {activeTab && <span>{activeTab.language}</span>}
      </div>
      <div>
        {activeTabPath && <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>}
      </div>
    </div>
  );
}
