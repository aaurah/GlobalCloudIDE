import React, { useState, useRef, useEffect } from "react";
import { useIde } from "../../hooks/use-ide";
import { AiAction } from "../../lib/ide-types";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { ScrollArea } from "../ui/scroll-area";
import { Wand2, PenTool, Lightbulb, SplitSquareVertical, Check, Loader2 } from "lucide-react";

export function AiPanel({ isVisible }: { isVisible: boolean }) {
  const { activeTabPath, tabs, isAiLoading, aiResponse, setAiState, updateTabContent } = useIde();
  const [action, setAction] = useState<AiAction>("generate");
  const [promptText, setPromptText] = useState("");
  const activeTab = tabs.find(t => t.path === activeTabPath);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [aiResponse]);

  const handleSubmit = async () => {
    if (!promptText.trim() && action === "generate") return;
    
    setAiState(true, "");
    
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          prompt: promptText,
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

  const handleApply = () => {
    if (activeTabPath && aiResponse) {
      // Very basic extraction of code blocks if they exist, else replace whole file
      let newContent = aiResponse;
      const codeMatch = aiResponse.match(/```[a-z]*\n([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        newContent = codeMatch[1];
      }
      updateTabContent(activeTabPath, newContent);
    }
  };

  if (!isVisible) return null;

  const actions: { id: AiAction; label: string; icon: React.ReactNode; placeholder: string }[] = [
    { id: "generate", label: "Generate", icon: <Wand2 size={14} />, placeholder: "Describe what you want to build..." },
    { id: "fix", label: "Fix", icon: <PenTool size={14} />, placeholder: "What's wrong with this code?" },
    { id: "explain", label: "Explain", icon: <Lightbulb size={14} />, placeholder: "Ask questions about the code..." },
    { id: "refactor", label: "Refactor", icon: <SplitSquareVertical size={14} />, placeholder: "How should this be refactored?" },
  ];

  return (
    <div className="w-[280px] h-full flex flex-col bg-card border-l border-border shrink-0">
      <div className="h-9 px-3 flex items-center text-xs font-semibold text-foreground border-b border-border uppercase tracking-wider shrink-0">
        AI Assistant
      </div>

      <div className="p-3 flex flex-col space-y-3 border-b border-border shrink-0">
        <div className="grid grid-cols-2 gap-1.5">
          {actions.map(a => (
            <button
              key={a.id}
              onClick={() => setAction(a.id)}
              className={`flex items-center justify-center space-x-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                action === a.id 
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
          placeholder={actions.find(a => a.id === action)?.placeholder}
          value={promptText}
          onChange={e => setPromptText(e.target.value)}
          className="min-h-[80px] text-[13px] resize-none bg-background border-border placeholder:text-muted-foreground"
        />

        <Button 
          onClick={handleSubmit} 
          disabled={isAiLoading || (!promptText.trim() && action === "generate")}
          className="w-full h-8 text-xs font-semibold"
        >
          {isAiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Ask AI"}
        </Button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-background relative">
        <ScrollArea className="flex-1" ref={scrollRef}>
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
        {aiResponse && !isAiLoading && action !== "explain" && (
          <div className="p-3 border-t border-border shrink-0 bg-card">
            <Button onClick={handleApply} className="w-full h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white border-0" variant="outline">
              <Check className="w-4 h-4 mr-1.5" />
              Apply to Active File
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
