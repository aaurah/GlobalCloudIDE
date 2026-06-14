import React, { useState, useEffect } from "react";
import { useGetMemory } from "@workspace/api-client-react";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { X, Plus, Save, Loader2 } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";
import { toast } from "../../hooks/use-toast";

interface TagListProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}

function TagList({ label, tags, onChange }: TagListProps) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const val = inputValue.trim();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (tag: string) => {
    onChange(tags.filter(t => t !== tag));
  };

  return (
    <div className="flex flex-col space-y-2">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map(tag => (
          <div key={tag} className="flex items-center space-x-1 bg-muted px-2 py-1 rounded-md text-[11px] font-medium text-foreground">
            <span>{tag}</span>
            <button onClick={() => handleRemove(tag)} className="text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex space-x-2">
        <Input 
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Add ${label.toLowerCase()}...`}
          className="h-7 text-xs bg-background"
        />
        <Button size="sm" variant="secondary" className="h-7 px-2" onClick={handleAdd}>
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}

export function MemoryPanel() {
  const { data: memory, isLoading } = useGetMemory();
  const [isSaving, setIsSaving] = useState(false);
  
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [architecture, setArchitecture] = useState<string[]>([]);
  const [namingConventions, setNamingConventions] = useState<string[]>([]);
  const [codingStyle, setCodingStyle] = useState<string[]>([]);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    if (memory) {
      setProjectName(memory.projectName || "");
      setDescription(memory.description || "");
      setArchitecture(memory.architecture || []);
      setNamingConventions(memory.namingConventions || []);
      setCodingStyle(memory.codingStyle || []);
      setDependencies(memory.dependencies || []);
      setNotes(memory.notes || []);
    }
  }, [memory]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          description,
          architecture,
          namingConventions,
          codingStyle,
          dependencies,
          notes
        })
      });
      if (!res.ok) throw new Error("Failed to save memory");
      toast({ title: "Memory saved successfully" });
    } catch (err: any) {
      toast({ title: "Failed to save memory", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <span className="text-xs">Loading memory...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background relative">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Project Name</label>
            <Input 
              value={projectName} 
              onChange={e => setProjectName(e.target.value)} 
              className="h-8 text-xs bg-background"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Description</label>
            <Textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              className="min-h-[80px] text-xs resize-none bg-background"
            />
          </div>

          <TagList label="Architecture" tags={architecture} onChange={setArchitecture} />
          <TagList label="Naming Conventions" tags={namingConventions} onChange={setNamingConventions} />
          <TagList label="Coding Style" tags={codingStyle} onChange={setCodingStyle} />
          <TagList label="Dependencies" tags={dependencies} onChange={setDependencies} />
          <TagList label="Notes" tags={notes} onChange={setNotes} />
        </div>
      </ScrollArea>
      <div className="p-3 border-t border-border shrink-0 bg-card">
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="w-full h-8 text-xs font-semibold"
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Memory
        </Button>
      </div>
    </div>
  );
}
