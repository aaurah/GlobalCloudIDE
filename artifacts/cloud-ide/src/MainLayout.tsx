import React, { useState, useEffect } from "react";
import { TopToolbar } from "./components/toolbar/TopToolbar";
import { StatusBar } from "./components/statusbar/StatusBar";
import { FileExplorer } from "./components/sidebar/FileExplorer";
import { EditorTabs } from "./components/editor/EditorTabs";
import { MonacoEditor } from "./components/editor/MonacoEditor";
import { BottomPanel } from "./components/panel/BottomPanel";
import { AiPanel } from "./components/panel/AiPanel";
import { CommandPalette } from "./components/palette/CommandPalette";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { IdeProvider, useIde } from "./hooks/use-ide";

function IdeLayout() {
  const [aiPanelVisible, setAiPanelVisible] = useState(false);
  const { isPaletteOpen, openPalette } = useIde();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPalette();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openPalette]);

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <TopToolbar onToggleAiPanel={() => setAiPanelVisible(!aiPanelVisible)} />
      
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        <FileExplorer />
        
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={70} minSize={20}>
              <div className="flex flex-col h-full">
                <EditorTabs />
                <MonacoEditor />
              </div>
            </ResizablePanel>
            
            <ResizableHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />
            
            <ResizablePanel defaultSize={30} minSize={10}>
              <BottomPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <AiPanel isVisible={aiPanelVisible} />
      </div>

      <StatusBar />
      
      <CommandPalette onOpenAiPanel={() => setAiPanelVisible(true)} />
    </div>
  );
}

export default function AppLayout() {
  return (
    <IdeProvider>
      <IdeLayout />
    </IdeProvider>
  );
}
