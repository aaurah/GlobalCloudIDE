export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number | null;
  children?: FileEntry[] | null;
}

export interface OpenTab {
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export type AiAction = "generate" | "fix" | "explain" | "refactor";

export interface OutputLine {
  type: "stdout" | "stderr" | "info" | "error" | "system";
  text: string;
  timestamp: number;
}

export type AgentMode = "builder" | "debugger" | "reviewer";

export interface AgentStep {
  type: "thinking" | "action" | "output" | "error" | "done";
  content?: string;
  action?: string;
  path?: string;
  language?: string;
  filesChanged?: string[];
  timestamp: number;
}
