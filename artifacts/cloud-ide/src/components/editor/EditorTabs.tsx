import React from "react";
import { useIde } from "../../hooks/use-ide";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";

export function EditorTabs() {
  const { tabs, activeTabPath, setActiveTab, closeFile } = useIde();

  return (
    <div className="flex h-9 bg-[#181818] border-b border-[#2d2d2d] shrink-0 overflow-hidden">
      <ScrollArea className="flex-1 whitespace-nowrap">
        <div className="flex h-full w-max">
          {tabs.map(tab => (
            <div
              key={tab.path}
              onClick={() => setActiveTab(tab.path)}
              className={cn(
                "group flex items-center h-full px-3 border-r border-[#2d2d2d] cursor-pointer text-[13px] min-w-[120px] max-w-[200px] hover:bg-[#2a2d2e]",
                activeTabPath === tab.path ? "bg-[#1e1e1e] text-foreground border-t-2 border-t-primary" : "text-muted-foreground bg-transparent border-t-2 border-t-transparent"
              )}
            >
              <span className="truncate flex-1 pr-2">
                {tab.path.split("/").pop()}
              </span>
              <div className="flex items-center space-x-1">
                {tab.isDirty && <div className="h-2 w-2 rounded-full bg-primary" />}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(tab.path);
                  }}
                  className={cn(
                    "p-0.5 rounded-sm hover:bg-[#3d3d3d] text-muted-foreground hover:text-foreground",
                    !tab.isDirty && "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="h-1" />
      </ScrollArea>
    </div>
  );
}
