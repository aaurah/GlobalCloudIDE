import React, { useState, useRef } from "react";
import { useIde } from "../../hooks/use-ide";
import { AiPanel } from "../panel/AiPanel";
import { Button } from "../ui/button";
import { Wand2, Bug, Lightbulb, SplitSquareVertical, FileCode, Cpu, Mic, MicOff, Maximize2, Minimize2, X } from "lucide-react";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: string;
  prompt?: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "generate", label: "Generate", icon: <Wand2 size={14} />,             action: "generate", color: "bg-purple-700/20 text-purple-400 border-purple-700/30 active:bg-purple-700/40" },
  { id: "fix",      label: "Fix Bugs", icon: <Bug size={14} />,               action: "fix",      color: "bg-red-700/20 text-red-400 border-red-700/30 active:bg-red-700/40" },
  { id: "explain",  label: "Explain",  icon: <Lightbulb size={14} />,         action: "explain",  color: "bg-amber-700/20 text-amber-400 border-amber-700/30 active:bg-amber-700/40" },
  { id: "refactor", label: "Refactor", icon: <SplitSquareVertical size={14}/>, action: "refactor", color: "bg-blue-700/20 text-blue-400 border-blue-700/30 active:bg-blue-700/40" },
  { id: "debug",    label: "Debug",    icon: <Cpu size={14} />,               action: "fix",      prompt: "Debug and add console.log statements to trace the issue", color: "bg-orange-700/20 text-orange-400 border-orange-700/30 active:bg-orange-700/40" },
  { id: "newfile",  label: "New File", icon: <FileCode size={14} />,          action: "generate", prompt: "Create a new file for this project with boilerplate code", color: "bg-green-700/20 text-green-400 border-green-700/30 active:bg-green-700/40" },
];

export function MobileAiWorkspace() {
  const { setAiAction, setAiPrompt, setAiPanelTab } = useIde();
  const [isListening, setIsListening] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const recognitionRef = useRef<any>(null);

  const handleQuickAction = (action: QuickAction) => {
    setAiPanelTab("assistant");
    setAiAction(action.action as any);
    if (action.prompt) setAiPrompt(action.prompt);
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    recognition.onstart  = () => setIsListening(true);
    recognition.onend    = () => setIsListening(false);
    recognition.onerror  = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setAiPrompt(transcript);
      setAiPanelTab("assistant");
      setAiAction("generate");
    };
    recognition.start();
  };

  const hasSpeech = typeof window !== "undefined" && (
    !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition
  );

  return (
    <div className={`flex flex-col bg-card transition-all duration-200 ${isFullscreen ? "fixed inset-0 z-30" : "h-full"}`}>
      {/* Quick actions row */}
      <div className="shrink-0 border-b border-border">
        <div className="px-3 pt-2 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Quick Actions</span>
            <div className="flex items-center gap-1.5">
              {hasSpeech && (
                <button
                  onClick={handleVoiceInput}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold transition-all touch-manipulation active:scale-95 ${
                    isListening
                      ? "bg-red-600/20 text-red-400 border border-red-600/30 animate-pulse"
                      : "bg-muted/50 text-muted-foreground border border-border"
                  }`}
                >
                  {isListening ? <MicOff size={10} /> : <Mic size={10} />}
                  {isListening ? "Listening..." : "Voice"}
                </button>
              )}
              <button
                onClick={() => setIsFullscreen(f => !f)}
                className="p-1.5 rounded-md bg-muted/30 text-muted-foreground hover:text-foreground touch-manipulation active:scale-95"
              >
                {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
              {isFullscreen && (
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="p-1.5 rounded-md bg-muted/30 text-muted-foreground hover:text-foreground touch-manipulation active:scale-95"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* 2×3 grid of quick action chips */}
          <div className="grid grid-cols-3 gap-1.5">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action)}
                className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-center transition-all active:scale-90 touch-manipulation ${action.color}`}
              >
                {action.icon}
                <span className="text-[10px] font-semibold leading-none">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Full AI panel */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AiPanel isVisible={true} />
      </div>
    </div>
  );
}
