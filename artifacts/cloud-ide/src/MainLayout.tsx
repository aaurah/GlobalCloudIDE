import React, { useState, useEffect, useRef } from "react";
import { TopToolbar } from "./components/toolbar/TopToolbar";
import { StatusBar } from "./components/statusbar/StatusBar";
import { FileExplorer } from "./components/sidebar/FileExplorer";
import { EditorTabs } from "./components/editor/EditorTabs";
import { MonacoEditor } from "./components/editor/MonacoEditor";
import { BottomPanel } from "./components/panel/BottomPanel";
import { AiPanel } from "./components/panel/AiPanel";
import { CommandPalette } from "./components/palette/CommandPalette";
import { PlatformDashboard } from "./components/platform/PlatformDashboard";
import { MobileBottomNav, type MobileView } from "./components/mobile/MobileBottomNav";
import { MobileFileDrawer } from "./components/mobile/MobileFileDrawer";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { IdeProvider, useIde } from "./hooks/use-ide";
import { PlatformProvider, usePlatform } from "./hooks/use-platform";
import { useIsMobile, useSwipeGesture } from "./hooks/use-mobile";

// Mobile views ordered for swipe navigation
const MOBILE_VIEWS: MobileView[] = ["files", "code", "terminal", "ai", "deploy"];

function IdeLayout() {
  const [aiPanelVisible, setAiPanelVisible] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("code");
  const [fileDrawerOpen, setFileDrawerOpen] = useState(false);
  const { isPaletteOpen, openPalette } = useIde();
  const { isPlatformDashboardOpen, closePlatformDashboard, openPlatformDashboard } = usePlatform();
  const isMobile = useIsMobile();
  const mainRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut Cmd/Ctrl+K
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

  // Swipe left/right to switch mobile views
  useSwipeGesture(
    mainRef,
    () => {
      if (!isMobile) return;
      const idx = MOBILE_VIEWS.indexOf(mobileView);
      if (idx < MOBILE_VIEWS.length - 1) setMobileView(MOBILE_VIEWS[idx + 1]);
    },
    () => {
      if (!isMobile) return;
      const idx = MOBILE_VIEWS.indexOf(mobileView);
      if (idx > 0) setMobileView(MOBILE_VIEWS[idx - 1]);
    }
  );

  const handleMobileViewChange = (view: MobileView) => {
    if (view === "files") {
      setFileDrawerOpen(true);
    } else if (view === "deploy") {
      openPlatformDashboard();
      setMobileView("code");
    } else {
      setMobileView(view);
    }
  };

  if (isMobile) {
    return (
      <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-foreground">
        {/* Compact mobile toolbar */}
        <TopToolbar
          onToggleAiPanel={() => handleMobileViewChange("ai")}
          compact
        />

        {/* Main content area */}
        <div ref={mainRef} className="flex-1 min-h-0 overflow-hidden relative">
          {/* Code view: editor + tabs */}
          <div className={`absolute inset-0 flex flex-col bg-[#1e1e1e] transition-opacity duration-200 ${mobileView === "code" ? "opacity-100 pointer-events-auto z-10" : "opacity-0 pointer-events-none z-0"}`}>
            <EditorTabs />
            <MonacoEditor />
          </div>

          {/* Terminal view: full-height terminal */}
          <div className={`absolute inset-0 transition-opacity duration-200 ${mobileView === "terminal" ? "opacity-100 pointer-events-auto z-10" : "opacity-0 pointer-events-none z-0"}`}>
            <BottomPanel fullHeight />
          </div>

          {/* AI view: full-screen AI panel */}
          <div className={`absolute inset-0 transition-opacity duration-200 ${mobileView === "ai" ? "opacity-100 pointer-events-auto z-10" : "opacity-0 pointer-events-none z-0"}`}>
            <AiPanel isVisible={mobileView === "ai"} />
          </div>
        </div>

        {/* Mobile bottom nav */}
        <MobileBottomNav activeView={mobileView === "code" && fileDrawerOpen ? "files" : mobileView} onViewChange={handleMobileViewChange} />

        {/* File drawer overlay */}
        <MobileFileDrawer open={fileDrawerOpen} onClose={() => setFileDrawerOpen(false)} />

        {/* Platform dashboard overlay */}
        <PlatformDashboard open={isPlatformDashboardOpen} onClose={closePlatformDashboard} />

        {/* Command palette */}
        <CommandPalette onOpenAiPanel={() => handleMobileViewChange("ai")} />
      </div>
    );
  }

  // ── Desktop layout ──────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <TopToolbar onToggleAiPanel={() => setAiPanelVisible(!aiPanelVisible)} />
      
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Sidebar: hidden on small tablets, shown on md+ */}
        <div className="hidden md:flex shrink-0 w-[220px]">
          <FileExplorer />
        </div>
        
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

      <PlatformDashboard
        open={isPlatformDashboardOpen}
        onClose={closePlatformDashboard}
      />
    </div>
  );
}

export default function AppLayout() {
  return (
    <PlatformProvider>
      <IdeProvider>
        <IdeLayout />
      </IdeProvider>
    </PlatformProvider>
  );
}
