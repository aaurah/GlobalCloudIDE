import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { OpenTab, OutputLine, AgentMode, AgentStep, AiAction } from "../lib/ide-types";
import { useWriteFile } from "@workspace/api-client-react";

interface IdeState {
  tabs: OpenTab[];
  activeTabPath: string | null;
  outputLines: OutputLine[];
  terminalLines: OutputLine[];
  isRunning: boolean;
  isAiLoading: boolean;
  aiResponse: string;
  cursorPosition: { line: number; column: number };
  
  isPaletteOpen: boolean;
  agentMode: AgentMode;
  isAgentRunning: boolean;
  agentSteps: AgentStep[];
  aiAction: AiAction;
  aiPrompt: string;
  aiPanelTab: "assistant" | "agent" | "memory";
}

interface IdeActions {
  openFile: (path: string, content: string, language: string) => void;
  closeFile: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateTabContent: (path: string, content: string) => void;
  markTabClean: (path: string) => void;
  addOutputLine: (line: Omit<OutputLine, "timestamp">) => void;
  clearOutput: () => void;
  addTerminalLine: (line: Omit<OutputLine, "timestamp">) => void;
  clearTerminal: () => void;
  setIsRunning: (running: boolean) => void;
  setAiState: (loading: boolean, response?: string) => void;
  setCursorPosition: (line: number, column: number) => void;
  
  openPalette: () => void;
  closePalette: () => void;
  setAgentMode: (mode: AgentMode) => void;
  setIsAgentRunning: (running: boolean) => void;
  addAgentStep: (step: Omit<AgentStep, "timestamp">) => void;
  clearAgentSteps: () => void;
  setAiAction: (action: AiAction) => void;
  setAiPrompt: (prompt: string) => void;
  setAiPanelTab: (tab: "assistant" | "agent" | "memory") => void;
}

const IdeContext = createContext<(IdeState & IdeActions) | null>(null);

export function IdeProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [terminalLines, setTerminalLines] = useState<OutputLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [cursorPosition, setCursorPositionState] = useState({ line: 1, column: 1 });
  
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [agentMode, setAgentModeState] = useState<AgentMode>("builder");
  const [isAgentRunning, setIsAgentRunningState] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [aiAction, setAiActionState] = useState<AiAction>("generate");
  const [aiPrompt, setAiPromptState] = useState("");
  const [aiPanelTab, setAiPanelTabState] = useState<"assistant" | "agent" | "memory">("assistant");

  const openFile = useCallback((path: string, content: string, language: string) => {
    setTabs(prev => {
      if (prev.find(t => t.path === path)) return prev;
      return [...prev, { path, content, language, isDirty: false }];
    });
    setActiveTabPath(path);
  }, []);

  const closeFile = useCallback((path: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.path === path);
      if (idx === -1) return prev;
      const next = prev.filter(t => t.path !== path);
      if (activeTabPath === path) {
        if (next.length > 0) {
          setActiveTabPath(next[Math.max(0, idx - 1)].path);
        } else {
          setActiveTabPath(null);
        }
      }
      return next;
    });
  }, [activeTabPath]);

  const setActiveTab = useCallback((path: string) => setActiveTabPath(path), []);

  const updateTabContent = useCallback((path: string, content: string) => {
    setTabs(prev => prev.map(t => t.path === path ? { ...t, content, isDirty: true } : t));
  }, []);

  const markTabClean = useCallback((path: string) => {
    setTabs(prev => prev.map(t => t.path === path ? { ...t, isDirty: false } : t));
  }, []);

  const addOutputLine = useCallback((line: Omit<OutputLine, "timestamp">) => {
    setOutputLines(prev => [...prev, { ...line, timestamp: Date.now() }]);
  }, []);

  const clearOutput = useCallback(() => setOutputLines([]), []);

  const addTerminalLine = useCallback((line: Omit<OutputLine, "timestamp">) => {
    setTerminalLines(prev => [...prev, { ...line, timestamp: Date.now() }]);
  }, []);

  const clearTerminal = useCallback(() => setTerminalLines([]), []);

  const setAiState = useCallback((loading: boolean, response?: string) => {
    setIsAiLoading(loading);
    if (response !== undefined) setAiResponse(response);
  }, []);

  const setCursorPosition = useCallback((line: number, column: number) => {
    setCursorPositionState({ line, column });
  }, []);

  const openPalette = useCallback(() => setIsPaletteOpen(true), []);
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);
  
  const setAgentMode = useCallback((mode: AgentMode) => setAgentModeState(mode), []);
  const setIsAgentRunning = useCallback((running: boolean) => setIsAgentRunningState(running), []);
  const addAgentStep = useCallback((step: Omit<AgentStep, "timestamp">) => {
    setAgentSteps(prev => [...prev, { ...step, timestamp: Date.now() }]);
  }, []);
  const clearAgentSteps = useCallback(() => setAgentSteps([]), []);
  
  const setAiAction = useCallback((action: AiAction) => setAiActionState(action), []);
  const setAiPrompt = useCallback((prompt: string) => setAiPromptState(prompt), []);
  const setAiPanelTab = useCallback((tab: "assistant" | "agent" | "memory") => setAiPanelTabState(tab), []);

  return (
    <IdeContext.Provider
      value={{
        tabs,
        activeTabPath,
        outputLines,
        terminalLines,
        isRunning,
        isAiLoading,
        aiResponse,
        cursorPosition,
        isPaletteOpen,
        agentMode,
        isAgentRunning,
        agentSteps,
        aiAction,
        aiPrompt,
        aiPanelTab,
        openFile,
        closeFile,
        setActiveTab,
        updateTabContent,
        markTabClean,
        addOutputLine,
        clearOutput,
        addTerminalLine,
        clearTerminal,
        setIsRunning,
        setAiState,
        setCursorPosition,
        openPalette,
        closePalette,
        setAgentMode,
        setIsAgentRunning,
        addAgentStep,
        clearAgentSteps,
        setAiAction,
        setAiPrompt,
        setAiPanelTab,
      }}
    >
      {children}
    </IdeContext.Provider>
  );
}

export function useIde() {
  const ctx = useContext(IdeContext);
  if (!ctx) throw new Error("useIde must be used within IdeProvider");
  return ctx;
}
