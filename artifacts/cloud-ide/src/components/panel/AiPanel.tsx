import React, { useState, useRef, useEffect } from "react";
import { useIde } from "../../hooks/use-ide";
import { AiAction, AgentMode } from "../../lib/ide-types";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { ScrollArea } from "../ui/scroll-area";
import { 
  Wand2, PenTool, Lightbulb, SplitSquareVertical, 
  Check, Loader2, Hammer, Bug, Eye, BrainCircuit,
  FileCode, Play, List, Trash, AlertTriangle, Info,
  FileText, Rocket
} from "lucide-react";
import { MemoryPanel } from "./MemoryPanel";
import { DeployPanel } from "../platform/DeployPanel";
import { getListFilesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type AiPanelTab = "assistant" | "agent" | "memory" | "deploy";

export function AiPanel({ isVisible }: { isVisible: boolean }) {
  const { 
    activeTabPath, tabs, isAiLoading, aiResponse, setAiState, updateTabContent,
    aiPanelTab, setAiPanelTab, aiAction, setAiAction, aiPrompt, setAiPrompt,
    agentMode, setAgentMode, isAgentRunning, setIsAgentRunning, agentSteps, addAgentStep, clearAgentSteps
  } = useIde();
  
  const queryClient = useQueryClient();
  const activeTab = tabs.find(t => t.path === activeTabPath);
  const assistantScrollRef = useRef<HTMLDivElement>(null);
  const agentScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aiPanelTab === "assistant" && assistantScrollRef.current) {
      assistantScrollRef.current.scrollTop = assistantScrollRef.current.scrollHeight;
    }
  }, [aiResponse, aiPanelTab]);

  useEffect(() => {
    if (aiPanelTab === "agent" && agentScrollRef.current) {
      agentScrollRef.current.scrollTop = agentScrollRef.current.scrollHeight;
    }
  }, [agentSteps, aiPanelTab]);

  // ASSISTANT LOGIC
  const handleAssistantSubmit = async () => {
    if (!aiPrompt.trim() && aiAction === "generate") return;
    
    setAiState(true, "");
    
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: aiAction,
          prompt: aiPrompt,
          code: activeTab?.content || "",
          language: activeTab?.language || "plaintext",
          filename: activeTabPath?.split("/").pop() || undefined
        })
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullResponse += data.content;
                setAiState(true, fullResponse);
              }
              if (data.error) {
                fullResponse += `\n[Error: ${data.error}]`;
                setAiState(true, fullResponse);
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }
      setAiState(false, fullResponse);
    } catch (err: any) {
      setAiState(false, `[Error: ${err.message}]`);
    }
  };

  const handleAssistantApply = () => {
    if (activeTabPath && aiResponse) {
      let newContent = aiResponse;
      const codeMatch = aiResponse.match(/```[a-z]*\n([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        newContent = codeMatch[1];
      }
      updateTabContent(activeTabPath, newContent);
    }
  };

  // AGENT LOGIC
  const [agentTask, setAgentTask] = useState("");
  
  useEffect(() => {
    if (aiPanelTab === "agent" && aiPrompt && !agentTask) {
      setAgentTask(aiPrompt);
      setAiPrompt("");
    }
  }, [aiPanelTab, aiPrompt, agentTask, setAiPrompt]);

  const handleAgentSubmit = async () => {
    if (!agentTask.trim() || isAgentRunning) return;
    
    setIsAgentRunning(true);
    clearAgentSteps();
    
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: agentMode,
          task: agentTask,
          targetFile: activeTabPath || undefined,
        })
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              addAgentStep({
                type: data.type,
                content: data.content,
                action: data.action,
                path: data.path,
                language: data.language,
                filesChanged: data.filesChanged
              });
            } catch (e) {
              // ignore
            }
          }
        }
      }
    } catch (err: any) {
      addAgentStep({
        type: "error",
        content: `Agent execution failed: ${err.message}`
      });
    } finally {
      setIsAgentRunning(false);
    }
  };

  const handleReloadFiles = () => {
    queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
  };

  if (!isVisible) return null;

  const aiActions: { id: AiAction; label: string; icon: React.ReactNode; placeholder: string }[] = [
    { id: "generate", label: "Generate", icon: <Wand2 size={14} />, placeholder: "Describe what you want to build..." },
    { id: "fix", label: "Fix", icon: <PenTool size={14} />, placeholder: "What's wrong with this code?" },
    { id: "explain", label: "Explain", icon: <Lightbulb size={14} />, placeholder: "Ask questions about the code..." },
    { id: "refactor", label: "Refactor", icon: <SplitSquareVertical size={14} />, placeholder: "How should this be refactored?" },
  ];

  const panelTabs: { id: AiPanelTab; label: string }[] = [
    { id: "assistant", label: "Assistant" },
    { id: "agent", label: "Agent" },
    { id: "deploy", label: "Deploy" },
    { id: "memory", label: "Memory" },
  ];

  const renderAgentStep = (step: any, i: number) => {
    switch (step.type) {
      case "thinking":
        return (
          <div key={i} className="flex items-start space-x-2 text-muted-foreground text-xs mb-2">
            <BrainCircuit size={14} className="shrink-0 mt-0.5" />
            <div className="italic leading-relaxed">{step.content}</div>
          </div>
        );
      case "action":
        let icon = <Info size={14} />;
        let colorClass = "text-muted-foreground";
        let text = step.action;
        
        if (step.action === "write_file") {
          icon = <FileCode size={14} />;
          colorClass = "text-green-500";
          text = `+ write: ${step.path}`;
        } else if (step.action === "read_file") {
          icon = <FileText size={14} />;
          colorClass = "text-blue-500";
          text = `~ read: ${step.path}`;
        } else if (step.action === "run_code") {
          icon = <Play size={14} />;
          colorClass = "text-amber-500";
          text = `▶ run: ${step.language}`;
        } else if (step.action === "list_files") {
          icon = <List size={14} />;
          colorClass = "text-muted-foreground";
          text = `ls ${step.path || "."}`;
        } else if (step.action === "delete_file") {
          icon = <Trash size={14} />;
          colorClass = "text-red-500";
          text = `- delete: ${step.path}`;
        }
        
        return (
          <div key={i} className={`flex items-center space-x-2 text-xs font-mono mb-2 ${colorClass}`}>
            <span className="shrink-0">{icon}</span>
            <span>{text}</span>
          </div>
        );
      case "output":
        return (
          <div key={i} className="ml-5 mb-3 p-2 bg-black/30 rounded border border-white/5 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">
            {step.content}
          </div>
        );
      case "error":
        return (
          <div key={i} className="flex items-start space-x-2 text-red-400 text-xs mb-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div className="whitespace-pre-wrap font-mono">{step.content}</div>
          </div>
        );
      case "done":
        return (
          <div key={i} className="mt-4 p-3 bg-amber-600/10 border border-amber-600/20 rounded-md">
            <div className="flex items-center space-x-2 text-amber-500 text-xs font-bold uppercase tracking-wider mb-2">
              <Check size={14} />
              <span>Agent Completed</span>
            </div>
            {step.filesChanged && step.filesChanged.length > 0 && (
              <div className="mb-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Files Changed:</span>{" "}
                {step.filesChanged.join(", ")}
              </div>
            )}
            <Button size="sm" onClick={handleReloadFiles} className="w-full h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white">
              Reload Files
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-[320px] h-full flex flex-col bg-card border-l border-border shrink-0">
      <div className="h-9 flex items-center border-b border-border shrink-0 px-2 bg-muted/30">
        <div className="flex space-x-0.5 w-full bg-background rounded-md p-1 border border-border overflow-hidden">
          {panelTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setAiPanelTab(t.id)}
              className={`flex-1 text-[11px] font-semibold py-1 rounded-sm transition-colors ${
                aiPanelTab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {aiPanelTab === "memory" && <MemoryPanel />}
      {aiPanelTab === "deploy" && <DeployPanel />}

      {aiPanelTab === "assistant" && (
        <>
          <div className="p-3 flex flex-col space-y-3 border-b border-border shrink-0">
            <div className="grid grid-cols-2 gap-1.5">
              {aiActions.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAiAction(a.id)}
                  className={`flex items-center justify-center space-x-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    aiAction === a.id 
                      ? "bg-primary text-primary-foreground border-primary" 
                      : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {a.icon}
                  <span>{a.label}</span>
                </button>
              ))}
            </div>

            <Textarea
              placeholder={aiActions.find(a => a.id === aiAction)?.placeholder}
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              className="min-h-[80px] text-[13px] resize-none bg-background border-border placeholder:text-muted-foreground"
            />

            <Button 
              onClick={handleAssistantSubmit} 
              disabled={isAiLoading || (!aiPrompt.trim() && aiAction === "generate")}
              className="w-full h-8 text-xs font-semibold"
            >
              {isAiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Ask AI"}
            </Button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-background relative">
            <ScrollArea className="flex-1" ref={assistantScrollRef}>
              <div className="p-3">
                {aiResponse ? (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-foreground">
                    {aiResponse}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic text-center mt-10">
                    Select an action and ask the AI. Context is automatically included.
                  </div>
                )}
              </div>
            </ScrollArea>
            {aiResponse && !isAiLoading && aiAction !== "explain" && (
              <div className="p-3 border-t border-border shrink-0 bg-card">
                <Button onClick={handleAssistantApply} className="w-full h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white border-0" variant="outline">
                  <Check className="w-4 h-4 mr-1.5" />
                  Apply to Active File
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {aiPanelTab === "agent" && (
        <>
          <div className="p-3 flex flex-col space-y-3 border-b border-border shrink-0">
            <div className="flex space-x-1.5">
              {[
                { id: "builder", icon: <Hammer size={14} />, label: "Builder" },
                { id: "debugger", icon: <Bug size={14} />, label: "Debugger" },
                { id: "reviewer", icon: <Eye size={14} />, label: "Reviewer" },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setAgentMode(m.id as AgentMode)}
                  className={`flex-1 flex items-center justify-center space-x-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    agentMode === m.id 
                      ? "bg-amber-600 text-white border-amber-600" 
                      : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            <Textarea
              placeholder="Describe what the agent should do..."
              value={agentTask}
              onChange={e => setAgentTask(e.target.value)}
              disabled={isAgentRunning}
              className="min-h-[80px] text-[13px] resize-none bg-background border-border placeholder:text-muted-foreground"
            />

            <Button 
              onClick={handleAgentSubmit} 
              disabled={isAgentRunning || !agentTask.trim()}
              className="w-full h-8 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white border-0"
            >
              {isAgentRunning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Agent...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Run Agent</>
              )}
            </Button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-background relative">
            <ScrollArea className="flex-1" ref={agentScrollRef}>
              <div className="p-3">
                {agentSteps.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic text-center mt-10">
                    The agent runs autonomously. It will plan, execute code, and write files.
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {agentSteps.map((step, i) => renderAgentStep(step, i))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}
