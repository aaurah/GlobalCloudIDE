import React, { useState } from "react";
import { TopToolbar } from "./components/toolbar/TopToolbar";
import { StatusBar } from "./components/statusbar/StatusBar";
import { FileExplorer } from "./components/sidebar/FileExplorer";
import { EditorTabs } from "./components/editor/EditorTabs";
import { MonacoEditor } from "./components/editor/MonacoEditor";
import { BottomPanel } from "./components/panel/BottomPanel";
import { AiPanel } from "./components/panel/AiPanel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { IdeProvider } from "./hooks/use-ide";

export default function AppLayout() {
  const [aiPanelVisible, setAiPanelVisible] = useState(false);

  return (
    <IdeProvider>
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
      </div>
    </IdeProvider>
  );
}
