import React, { useState, useEffect } from "react";
import { useIde } from "../../hooks/use-ide";
import { useListFiles, useReadFile, useWriteFile, useDeleteFile, useRenameFile, useMakeDirectory, getListFilesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { VscFile, VscFolder, VscFolderOpened, VscNewFile, VscNewFolder, VscCollapseAll, VscEdit, VscTrash } from "react-icons/vsc";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from "../ui/context-menu";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";
import { FileEntry } from "../../lib/ide-types";

function getLanguageFromFilename(filename: string) {
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
  if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
  if (filename.endsWith('.py')) return 'python';
  if (filename.endsWith('.sh') || filename.endsWith('.bash')) return 'bash';
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.html')) return 'html';
  if (filename.endsWith('.css')) return 'css';
  if (filename.endsWith('.md')) return 'markdown';
  return 'plaintext';
}

function FileTreeNode({ 
  entry, 
  depth = 0, 
  onOpenFile, 
  onRename, 
  onDelete,
  onNewFile,
  onNewFolder,
  expandedFolders,
  toggleFolder
}: { 
  entry: FileEntry; 
  depth?: number;
  onOpenFile: (path: string) => void;
  onRename: (oldPath: string) => void;
  onDelete: (path: string) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
}) {
  const { activeTabPath } = useIde();
  const isExpanded = expandedFolders.has(entry.path);
  const isActive = activeTabPath === entry.path;
  const isDirectory = entry.type === "directory";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      toggleFolder(entry.path);
    } else {
      onOpenFile(entry.path);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div 
          className={cn(
            "flex items-center py-1 px-2 cursor-pointer select-none text-[13px] group hover:bg-muted/50",
            isActive && !isDirectory ? "bg-muted text-foreground" : "text-muted-foreground",
          )}
          style={{ paddingLeft: `${(depth * 12) + 8}px` }}
          onClick={handleClick}
        >
          <span className="mr-1.5 opacity-80 group-hover:opacity-100">
            {isDirectory ? (
              isExpanded ? <VscFolderOpened className="text-amber-500" /> : <VscFolder className="text-amber-500" />
            ) : (
              <VscFile />
            )}
          </span>
          <span className="truncate">{entry.name}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48 bg-card border-border">
        {isDirectory && (
          <>
            <ContextMenuItem onClick={(e) => { e.stopPropagation(); onNewFile(entry.path); }}>
              <VscNewFile className="mr-2" /> New File
            </ContextMenuItem>
            <ContextMenuItem onClick={(e) => { e.stopPropagation(); onNewFolder(entry.path); }}>
              <VscNewFolder className="mr-2" /> New Folder
            </ContextMenuItem>
            <ContextMenuSeparator className="bg-border" />
          </>
        )}
        <ContextMenuItem onClick={(e) => { e.stopPropagation(); onRename(entry.path); }}>
          <VscEdit className="mr-2" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={(e) => { e.stopPropagation(); onDelete(entry.path); }} className="text-destructive focus:text-destructive">
          <VscTrash className="mr-2" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FileExplorer() {
  const { openFile, closeFile } = useIde();
  const queryClient = useQueryClient();
  const { data: files = [], isLoading } = useListFiles({ path: "/" });
  
  const { mutate: deleteFile } = useDeleteFile();
  const { mutate: renameFile } = useRenameFile();
  const { mutate: makeDirectory } = useMakeDirectory();
  const { mutate: writeFile } = useWriteFile();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["/"]));

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleOpenFile = async (path: string) => {
    try {
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        openFile(path, data.content, getLanguageFromFilename(path));
      }
    } catch (e) {
      console.error("Failed to read file", e);
    }
  };

  const invalidateFs = () => {
    queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
  };

  const handleDelete = (path: string) => {
    if (confirm(`Delete ${path}?`)) {
      deleteFile({ params: { path } }, {
        onSuccess: () => {
          closeFile(path);
          invalidateFs();
        }
      });
    }
  };

  const handleRename = (oldPath: string) => {
    const newName = prompt(`Rename ${oldPath} to:`, oldPath.split("/").pop());
    if (newName) {
      const parts = oldPath.split("/");
      parts.pop();
      const newPath = [...parts, newName].join("/") || `/${newName}`;
      renameFile({ data: { oldPath, newPath } }, { onSuccess: invalidateFs });
    }
  };

  const handleNewFile = (parentPath: string) => {
    const name = prompt("New file name:");
    if (name) {
      const path = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
      writeFile({ data: { path, content: "" } }, { onSuccess: invalidateFs });
    }
  };

  const handleNewFolder = (parentPath: string) => {
    const name = prompt("New folder name:");
    if (name) {
      const path = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
      makeDirectory({ data: { path } }, { onSuccess: invalidateFs });
    }
  };

  const renderTree = (entries: FileEntry[], depth: number = 0) => {
    return entries.map(entry => (
      <div key={entry.path}>
        <FileTreeNode
          entry={entry}
          depth={depth}
          onOpenFile={handleOpenFile}
          onRename={handleRename}
          onDelete={handleDelete}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
        />
        {entry.type === "directory" && expandedFolders.has(entry.path) && entry.children && (
          renderTree(entry.children, depth + 1)
        )}
      </div>
    ));
  };

  return (
    <div className="w-[220px] h-full flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 select-none">
      <div className="h-9 px-3 flex items-center justify-between text-xs font-semibold text-sidebar-foreground border-b border-sidebar-border uppercase tracking-wider">
        <span>Explorer</span>
        <div className="flex items-center space-x-1">
          <button onClick={() => handleNewFile("/")} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
            <VscNewFile size={14} />
          </button>
          <button onClick={() => handleNewFolder("/")} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
            <VscNewFolder size={14} />
          </button>
          <button onClick={() => setExpandedFolders(new Set(["/"]))} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
            <VscCollapseAll size={14} />
          </button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="py-2">
          {isLoading ? (
            <div className="px-3 text-xs text-muted-foreground">Loading...</div>
          ) : files.length === 0 ? (
            <div className="px-3 text-xs text-muted-foreground italic">Empty workspace.</div>
          ) : (
            renderTree(files)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
