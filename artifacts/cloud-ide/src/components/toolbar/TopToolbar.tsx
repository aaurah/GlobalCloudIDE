import React, { useState } from "react";
import { useIde } from "../../hooks/use-ide";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Terminal, Play, Square, PanelRight, 
  LogIn, LogOut, FolderOpen, ChevronDown, User, LayoutDashboard,
  Search
} from "lucide-react";
import { AuthModal } from "../platform/AuthModal";
import { ProjectManager } from "../platform/ProjectManager";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "../ui/dropdown-menu";

export function TopToolbar({ onToggleAiPanel }: { onToggleAiPanel: () => void }) {
  const { isRunning, setIsRunning, activeTabPath, tabs, addOutputLine, clearOutput } = useIde();
  const { user, logout, currentProject, openProjectManager, openPlatformDashboard } = usePlatform();
  const activeTab = tabs.find(t => t.path === activeTabPath);
  const [selectedLanguage, setSelectedLanguage] = useState(activeTab?.language || "node");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);

  React.useEffect(() => {
    if (activeTab) setSelectedLanguage(activeTab.language);
  }, [activeTab]);

  const handleRun = async () => {
    if (!activeTabPath || !activeTab) return;
    setIsRunning(true);
    clearOutput();
    addOutputLine({ type: "system", text: `Running ${activeTabPath} with ${selectedLanguage}...` });

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: selectedLanguage,
          code: activeTab.content,
          filename: activeTabPath.split("/").pop()
        })
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                addOutputLine({ type: "stdout", text: data.content });
              }
              if (data.error) {
                addOutputLine({ type: "stderr", text: data.error });
              }
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      }
      addOutputLine({ type: "system", text: `Process exited.` });
    } catch (e: any) {
      addOutputLine({ type: "error", text: `Execution failed: ${e.message}` });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <div className="flex h-10 items-center justify-between px-4 bg-background border-b border-border shrink-0 gap-2">
        <div className="flex items-center space-x-3 text-sm font-semibold text-primary shrink-0">
          <Terminal className="h-4 w-4" />
          <span>CloudIDE</span>
        </div>

        <div className="flex items-center space-x-1.5 flex-1 min-w-0 justify-center">
          {currentProject ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground max-w-[160px]"
              onClick={() => setProjectManagerOpen(true)}
            >
              <FolderOpen className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <span className="truncate">{currentProject.name}</span>
              <ChevronDown className="h-3 w-3 ml-1 shrink-0 opacity-50" />
            </Button>
          ) : user ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setProjectManagerOpen(true)}
            >
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
              Open Project
            </Button>
          ) : null}
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger className="h-7 w-[110px] bg-card text-xs border-muted-border">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="node">Node.js</SelectItem>
              <SelectItem value="python">Python</SelectItem>
              <SelectItem value="bash">Bash</SelectItem>
            </SelectContent>
          </Select>

          {isRunning ? (
            <Button variant="destructive" size="sm" className="h-7 px-3 text-xs flex items-center space-x-1" onClick={() => setIsRunning(false)}>
              <Square className="h-3 w-3 fill-current" />
              <span>Stop</span>
            </Button>
          ) : (
            <Button variant="default" size="sm" className="h-7 px-3 text-xs flex items-center space-x-1" onClick={handleRun} disabled={!activeTabPath}>
              <Play className="h-3 w-3 fill-current" />
              <span>Run</span>
            </Button>
          )}

          {user ? (
            <>
              {/* Platform Dashboard button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={openPlatformDashboard}
                title="Platform Dashboard"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="h-3 w-3 text-primary" />
                    </div>
                    <span className="hidden sm:inline text-muted-foreground max-w-[80px] truncate">
                      {user.username}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-semibold">{user.username}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setProjectManagerOpen(true)}>
                    <FolderOpen className="mr-2 h-3.5 w-3.5" />
                    Projects
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openPlatformDashboard}>
                    <LayoutDashboard className="mr-2 h-3.5 w-3.5" />
                    Platform Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-red-400 focus:text-red-400">
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs border-border"
              onClick={() => setAuthModalOpen(true)}
            >
              <LogIn className="h-3.5 w-3.5 mr-1.5" />
              Sign In
            </Button>
          )}

          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={onToggleAiPanel}>
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
      <ProjectManager open={projectManagerOpen} onOpenChange={setProjectManagerOpen} />
    </>
  );
}
