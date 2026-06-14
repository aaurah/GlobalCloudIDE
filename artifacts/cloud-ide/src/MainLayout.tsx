import React, { useState, useEffect, useRef, useCallback } from "react";
import { TopToolbar } from "./components/toolbar/TopToolbar";
import { StatusBar } from "./components/statusbar/StatusBar";
import { FileExplorer } from "./components/sidebar/FileExplorer";
import { EditorTabs } from "./components/editor/EditorTabs";
import { MonacoEditor } from "./components/editor/MonacoEditor";
import { BottomPanel } from "./components/panel/BottomPanel";
import { AiPanel } from "./components/panel/AiPanel";
import { CommandPalette } from "./components/palette/CommandPalette";
import { PlatformDashboard } from "./components/platform/PlatformDashboard";
import { TrialBanner } from "./components/platform/TrialBanner";

// Mobile components
import { MobileBottomNav, type MobileView } from "./components/mobile/MobileBottomNav";
import { MobileSidebar } from "./components/mobile/MobileSidebar";
import { MobileEditorShell } from "./components/mobile/MobileEditorShell";
import { MobileAiWorkspace } from "./components/mobile/MobileAiWorkspace";
import { MobileDeployPanel } from "./components/mobile/MobileDeployPanel";
import { MobileSettingsPanel } from "./components/mobile/MobileSettingsPanel";
import { OfflineBanner } from "./components/mobile/OfflineBanner";
import { InstallPrompt } from "./components/mobile/InstallPrompt";
import { useOfflineCache } from "./hooks/use-offline-cache";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { IdeProvider, useIde } from "./hooks/use-ide";
import { PlatformProvider, usePlatform } from "./hooks/use-platform";
import { useIsMobile, useSwipeGesture } from "./hooks/use-mobile";

// Views that can be navigated to by swiping (excludes files/deploy/settings)
const SWIPE_VIEWS: MobileView[] = ["code", "terminal", "ai"];

function IdeLayout() {
  const [aiPanelVisible, setAiPanelVisible] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("code");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState("node");

  const { isPaletteOpen, openPalette, isRunning, setIsRunning, activeTabPath, tabs, addOutputLine, clearOutput } = useIde();
  const { isPlatformDashboardOpen, closePlatformDashboard, openPlatformDashboard } = usePlatform();
  const { pendingCount, isSyncing } = useOfflineCache();
  const isMobile = useIsMobile();
  const mainRef = useRef<HTMLDivElement>(null);

  // Cmd/Ctrl+K palette shortcut
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); openPalette(); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [openPalette]);

  // Swipe left/right between swipeable views
  useSwipeGesture(
    mainRef,
    () => {
      if (!isMobile || sidebarOpen) return;
      const idx = SWIPE_VIEWS.indexOf(mobileView as any);
      if (idx >= 0 && idx < SWIPE_VIEWS.length - 1) setMobileView(SWIPE_VIEWS[idx + 1]);
    },
    () => {
      if (!isMobile || sidebarOpen) return;
      const idx = SWIPE_VIEWS.indexOf(mobileView as any);
      if (idx > 0) setMobileView(SWIPE_VIEWS[idx - 1]);
    }
  );

  // Run handler — shared between desktop + mobile
  const handleRun = useCallback(async () => {
    const activeTab = tabs.find(t => t.path === activeTabPath);
    if (!activeTabPath || !activeTab) return;
    setIsRunning(true);
    clearOutput();
    addOutputLine({ type: "system", text: `Running ${activeTabPath}...` });
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: selectedLang, code: activeTab.content, filename: activeTabPath.split("/").pop() }),
      });
      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.content) addOutputLine({ type: "stdout", text: d.content });
            if (d.error)   addOutputLine({ type: "stderr", text: d.error });
          } catch {}
        }
      }
      addOutputLine({ type: "system", text: "Process exited." });
    } catch (e: any) {
      addOutputLine({ type: "error", text: e.message });
    } finally { setIsRunning(false); }
  }, [activeTabPath, tabs, selectedLang, setIsRunning, clearOutput, addOutputLine]);

  const handleMobileViewChange = (view: MobileView) => {
    if (view === "files") {
      setSidebarOpen(true);
    } else if (view === "deploy") {
      setMobileView("deploy");
    } else {
      setMobileView(view);
    }
  };

  // ── Mobile layout ─────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-foreground">
        {/* Offline banner — above everything */}
        <OfflineBanner pendingCount={pendingCount} isSyncing={isSyncing} />
        <TrialBanner />

        {/* Compact toolbar */}
        <TopToolbar
          onToggleAiPanel={() => setMobileView("ai")}
          compact
        />

        {/* View transitions — all panels mounted, slide+fade switches active one */}
        <div ref={mainRef} className="flex-1 min-h-0 overflow-hidden relative">

          {/* Code view: enhanced editor shell */}
          <div className={`mobile-view-panel flex flex-col ${mobileView === "code" ? "mobile-view-active" : "mobile-view-inactive"}`}>
            <MobileEditorShell
              onOpenAi={() => setMobileView("ai")}
              onRun={handleRun}
              isRunning={isRunning}
              onStop={() => setIsRunning(false)}
              selectedLang={selectedLang}
              onLangChange={setSelectedLang}
            />
          </div>

          {/* Terminal view — full height */}
          <div className={`mobile-view-panel ${mobileView === "terminal" ? "mobile-view-active" : "mobile-view-inactive"}`}>
            <BottomPanel fullHeight />
          </div>

          {/* AI workspace — quick actions + full panel */}
          <div className={`mobile-view-panel ${mobileView === "ai" ? "mobile-view-active" : "mobile-view-inactive"}`}>
            <MobileAiWorkspace />
          </div>

          {/* Deploy panel */}
          <div className={`mobile-view-panel flex flex-col ${mobileView === "deploy" ? "mobile-view-active" : "mobile-view-inactive"}`}>
            <div className="px-4 pt-3 pb-2 border-b border-border shrink-0">
              <div className="text-sm font-bold">Deploy</div>
              <div className="text-xs text-muted-foreground">Build status &amp; region health</div>
            </div>
            <MobileDeployPanel />
          </div>

          {/* Settings panel */}
          <div className={`mobile-view-panel flex flex-col ${mobileView === "settings" ? "mobile-view-active" : "mobile-view-inactive"}`}>
            <div className="px-4 pt-3 pb-2 border-b border-border shrink-0">
              <div className="text-sm font-bold">Settings</div>
              <div className="text-xs text-muted-foreground">Editor &amp; app preferences</div>
            </div>
            <MobileSettingsPanel />
          </div>

        </div>

        {/* Bottom nav */}
        <MobileBottomNav
          activeView={sidebarOpen ? "files" : mobileView}
          onViewChange={handleMobileViewChange}
        />

        {/* Rich slide-out sidebar (Files/Functions/Agents/Plugins) */}
        <MobileSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Platform dashboard overlay */}
        <PlatformDashboard open={isPlatformDashboardOpen} onClose={closePlatformDashboard} />

        {/* Command palette */}
        <CommandPalette onOpenAiPanel={() => setMobileView("ai")} />

        {/* PWA install prompt */}
        <InstallPrompt />
      </div>
    );
  }

  // ── Desktop layout ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <TrialBanner />
      <TopToolbar onToggleAiPanel={() => setAiPanelVisible(!aiPanelVisible)} />
      
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
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
      <PlatformDashboard open={isPlatformDashboardOpen} onClose={closePlatformDashboard} />
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
