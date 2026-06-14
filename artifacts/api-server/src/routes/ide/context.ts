import { Router } from "express";
import fs from "fs/promises";
import path from "path";

const router = Router();

function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  const workspaceRoot = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(workspaceRoot, "ide-workspace");
}

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
  ".pdf", ".zip", ".tar", ".gz", ".rar",
  ".exe", ".bin", ".dll", ".so", ".dylib",
  ".mp3", ".mp4", ".wav", ".ogg", ".webm",
  ".woff", ".woff2", ".ttf", ".eot",
  ".pyc", ".pyo", ".class",
]);

const MAX_FILE_SIZE = 50_000; // 50KB per file for context
const MAX_TOTAL_FILES = 200;

interface FileContextEntry {
  path: string;
  content: string;
  language: string;
  size: number;
  imports: string[];
  functions: string[];
  classes: string[];
}

interface ProjectContext {
  totalFiles: number;
  totalSize: number;
  files: FileContextEntry[];
  structure: string;
  generatedAt: string;
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".tsx": "typescriptreact", ".jsx": "javascriptreact",
    ".html": "html", ".css": "css", ".json": "json",
    ".md": "markdown", ".sh": "bash", ".yaml": "yaml",
    ".yml": "yaml", ".xml": "xml", ".sql": "sql",
    ".rs": "rust", ".go": "go", ".java": "java", ".cpp": "cpp",
    ".c": "c", ".rb": "ruby", ".php": "php",
  };
  return map[ext] ?? "plaintext";
}

function extractImports(content: string, language: string): string[] {
  const imports: string[] = [];
  try {
    if (language === "python") {
      const matches = content.matchAll(/^(?:import|from)\s+([\w.]+)/gm);
      for (const m of matches) imports.push(m[1]);
    } else if (["javascript", "typescript", "typescriptreact", "javascriptreact"].includes(language)) {
      const matches = content.matchAll(/(?:import|require)\s*(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g);
      for (const m of matches) imports.push(m[1]);
    }
  } catch { /* ignore */ }
  return [...new Set(imports)].slice(0, 30);
}

function extractFunctions(content: string, language: string): string[] {
  const fns: string[] = [];
  try {
    if (language === "python") {
      const matches = content.matchAll(/^def\s+(\w+)\s*\(/gm);
      for (const m of matches) fns.push(m[1]);
    } else if (["javascript", "typescript", "typescriptreact", "javascriptreact"].includes(language)) {
      const matches = content.matchAll(/(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>|(\w+)\s*\([^)]*\)\s*\{)/g);
      for (const m of matches) fns.push(m[1] || m[2] || m[3]);
    }
  } catch { /* ignore */ }
  return [...new Set(fns.filter(Boolean))].slice(0, 30);
}

function extractClasses(content: string, language: string): string[] {
  const classes: string[] = [];
  try {
    const matches = content.matchAll(/^class\s+(\w+)/gm);
    for (const m of matches) classes.push(m[1]);
  } catch { /* ignore */ }
  return [...new Set(classes)].slice(0, 20);
}

async function scanDirectory(dirPath: string, rootPath: string, depth = 0): Promise<string[]> {
  if (depth > 10) return [];
  let allPaths: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await scanDirectory(fullPath, rootPath, depth + 1);
        allPaths = allPaths.concat(sub);
      } else {
        allPaths.push(fullPath);
      }
    }
  } catch { /* ignore */ }
  return allPaths;
}

function buildStructureTree(files: string[], rootPath: string): string {
  const tree: Record<string, string[]> = {};
  for (const f of files) {
    const rel = path.relative(rootPath, f);
    const dir = path.dirname(rel);
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push(path.basename(f));
  }

  let result = "workspace/\n";
  const dirs = Object.keys(tree).sort();
  for (const dir of dirs) {
    const indent = dir === "." ? "  " : "  " + dir.split(path.sep).map(() => "  ").join("") + "  ";
    if (dir !== ".") result += `  ${dir}/\n`;
    for (const file of tree[dir]) {
      result += `${indent}${file}\n`;
    }
  }
  return result;
}

// GET /api/context
router.get("/context", async (req, res) => {
  try {
    const root = getWorkspaceRoot();
    await fs.mkdir(root, { recursive: true });

    const allPaths = await scanDirectory(root, root);
    const limitedPaths = allPaths.slice(0, MAX_TOTAL_FILES);

    const fileEntries: FileContextEntry[] = [];
    let totalSize = 0;

    for (const filePath of limitedPaths) {
      const ext = path.extname(filePath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      try {
        const stat = await fs.stat(filePath);
        if (stat.size > MAX_FILE_SIZE) continue;

        const content = await fs.readFile(filePath, "utf-8");
        const relPath = "/" + path.relative(root, filePath).replace(/\\/g, "/");
        const language = detectLanguage(filePath);

        fileEntries.push({
          path: relPath,
          content: content.slice(0, MAX_FILE_SIZE),
          language,
          size: stat.size,
          imports: extractImports(content, language),
          functions: extractFunctions(content, language),
          classes: extractClasses(content, language),
        });

        totalSize += stat.size;
      } catch { /* skip unreadable files */ }
    }

    const context: ProjectContext = {
      totalFiles: fileEntries.length,
      totalSize,
      files: fileEntries,
      structure: buildStructureTree(limitedPaths, root),
      generatedAt: new Date().toISOString(),
    };

    res.json(context);
  } catch (err) {
    req.log.error({ err }, "Failed to build project context");
    res.status(500).json({ error: "Failed to build context" });
  }
});

export default router;
