import React, { useState } from "react";
import { usePlatform, Project } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2, Plus, FolderOpen, Trash2, Settings, X, Cloud, Code2, Globe } from "lucide-react";

interface ProjectManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ProjectCard({ project, onSelect, onDelete }: {
  project: Project;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const typeIcons: Record<string, React.ReactNode> = {
    node: <Code2 size={16} className="text-green-400" />,
    python: <Code2 size={16} className="text-blue-400" />,
    static: <Globe size={16} className="text-purple-400" />,
  };

  return (
    <div className="group flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer">
      <div className="flex items-center space-x-3 min-w-0" onClick={onSelect}>
        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
          {typeIcons[project.type ?? "node"] ?? <FolderOpen size={16} className="text-primary" />}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{project.name}</div>
          {project.description && (
            <div className="text-[11px] text-muted-foreground truncate">{project.description}</div>
          )}
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {project.type ?? "node"} · {new Date(project.updatedAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onSelect}>
          <FolderOpen size={14} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={onDelete}>
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}

export function ProjectManager({ open, onOpenChange }: ProjectManagerProps) {
  const { user, token, setCurrentProject, closeProjectManager } = usePlatform();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("node");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (!open || !token) return;
    setIsLoading(true);
    fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setProjects(data);
        else setProjects([]);
      })
      .catch(() => setProjects([]))
      .finally(() => setIsLoading(false));
  }, [open, token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null, type: newType }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create project");
      }
      const created: Project = await res.json();
      setProjects(prev => [created, ...prev]);
      setNewName(""); setNewDesc(""); setNewType("node");
      setShowCreate(false);
      setCurrentProject(created);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelect = (project: Project) => {
    setCurrentProject(project);
    onOpenChange(false);
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
    await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setProjects(prev => prev.filter(p => p.id !== project.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] bg-card border-border p-0 overflow-hidden max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <DialogHeader>
            <div className="flex items-center space-x-2">
              <Cloud className="h-5 w-5 text-primary" />
              <DialogTitle className="text-base font-bold">Projects</DialogTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              {user?.username ? `Signed in as ${user.username}` : "Manage your cloud projects"}
            </p>
          </DialogHeader>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus size={14} className="mr-1.5" />
            New Project
          </Button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="p-4 border-b border-border bg-muted/20 flex flex-col space-y-3">
            <div className="text-xs font-semibold text-foreground">Create New Project</div>
            <Input
              placeholder="Project name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="h-8 text-sm bg-background border-border"
              required
              autoFocus
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              className="h-8 text-sm bg-background border-border"
            />
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="h-8 text-sm bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="node">Node.js</SelectItem>
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="static">Static Site</SelectItem>
              </SelectContent>
            </Select>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex space-x-2">
              <Button type="submit" size="sm" disabled={isCreating} className="flex-1 h-8 text-xs">
                {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create & Open"}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <FolderOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No projects yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create your first project to get started</p>
            </div>
          ) : (
            <div className="flex flex-col space-y-2">
              {projects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onSelect={() => handleSelect(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
