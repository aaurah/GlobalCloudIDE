import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { getAuthUser } from "./auth";

const router = Router();

interface SearchResult {
  id: string;
  type: "project" | "plugin" | "agent" | "file";
  title: string;
  description: string;
  score: number;
  meta?: Record<string, unknown>;
}

function score(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 1.0;
  if (t.startsWith(q)) return 0.9;
  if (t.includes(q)) return 0.7;
  const words = q.split(/\s+/);
  const matchedWords = words.filter(w => t.includes(w)).length;
  return matchedWords / words.length * 0.5;
}

function rankResults(query: string, items: SearchResult[]): SearchResult[] {
  return items
    .map(item => ({ ...item, score: Math.max(score(query, item.title), score(query, item.description) * 0.8) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function searchProjects(userId: string, query: string): Promise<SearchResult[]> {
  try {
    const cwd = process.cwd();
    const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
    const raw = await fs.readFile(path.resolve(root, "ide-workspace/.platform/projects.json"), "utf-8");
    const projects: any[] = JSON.parse(raw);
    return projects
      .filter(p => !userId || p.ownerId === userId || !p.ownerId)
      .map(p => ({
        id: p.id,
        type: "project" as const,
        title: p.name,
        description: p.description ?? `${p.type ?? "node"} project`,
        score: 0,
        meta: { type: p.type, ownerId: p.ownerId, createdAt: p.createdAt },
      }));
  } catch {
    return [];
  }
}

async function searchPlugins(query: string): Promise<SearchResult[]> {
  // Import plugin catalog
  const catalog = [
    { id: "markdown-preview", name: "Markdown Preview", description: "Live preview of Markdown files", category: "editor" },
    { id: "git-integration", name: "Git Integration", description: "Full Git workflow management", category: "vcs" },
    { id: "eslint-linter", name: "ESLint", description: "Real-time JavaScript/TypeScript linting", category: "linting" },
    { id: "prettier-formatter", name: "Prettier", description: "Opinionated code formatter", category: "formatting" },
    { id: "code-snippets", name: "Code Snippets", description: "Curated snippets for multiple languages", category: "productivity" },
    { id: "docker-compose", name: "Docker Compose", description: "Visual docker-compose.yml editor", category: "deployment" },
    { id: "rest-client", name: "REST Client", description: "In-IDE HTTP client for testing APIs", category: "testing" },
    { id: "database-explorer", name: "Database Explorer", description: "Connect to databases and run queries", category: "database" },
  ];
  return catalog.map(p => ({
    id: p.id, type: "plugin" as const, title: p.name, description: p.description, score: 0,
    meta: { category: p.category },
  }));
}

async function searchAgents(query: string): Promise<SearchResult[]> {
  const catalog = [
    { id: "builder-pro", name: "Builder Pro", description: "Autonomous full-stack builder", category: "builder" },
    { id: "debugger-x", name: "Debugger X", description: "Root-cause analysis and bug fixing", category: "debugger" },
    { id: "reviewer-ai", name: "Code Reviewer", description: "Senior engineer code review", category: "reviewer" },
    { id: "devops-engineer", name: "DevOps Engineer", description: "Infrastructure automation specialist", category: "devops" },
    { id: "doc-writer", name: "Documentation Writer", description: "Auto-generates README and API docs", category: "documentation" },
    { id: "test-generator", name: "Test Generator", description: "Automated test writer for unit and integration tests", category: "testing" },
    { id: "data-analyst", name: "Data Analyst", description: "Analyzes data files and generates insights", category: "data" },
  ];
  return catalog.map(a => ({
    id: a.id, type: "agent" as const, title: a.name, description: a.description, score: 0,
    meta: { category: a.category },
  }));
}

async function searchFiles(userId: string, query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const cwd = process.cwd();
    const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
    const workDir = path.resolve(root, "ide-workspace");

    async function walk(dir: string, depth = 0): Promise<void> {
      if (depth > 4) return;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workDir, fullPath);
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            id: relPath,
            type: "file",
            title: entry.name,
            description: relPath,
            score: entry.name.toLowerCase() === query.toLowerCase() ? 1.0 : 0.7,
            meta: { path: relPath },
          });
        }
      }
    }
    await walk(workDir);
  } catch {}
  return results.slice(0, 20);
}

// GET /search?q=...&type=all|projects|plugins|agents|files
router.get("/search", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const query = String(req.query.q ?? "").trim();
  const type = String(req.query.type ?? "all");
  const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 50);

  if (!query) return void res.json({ results: [], query });

  const searches: Promise<SearchResult[]>[] = [];
  if (type === "all" || type === "projects") searches.push(searchProjects(userId, query));
  if (type === "all" || type === "plugins") searches.push(searchPlugins(query));
  if (type === "all" || type === "agents") searches.push(searchAgents(query));
  if (type === "all" || type === "files") searches.push(searchFiles(userId, query));

  const allResults = (await Promise.all(searches)).flat();
  const ranked = rankResults(query, allResults).slice(0, limit);

  res.json({ results: ranked, query, total: ranked.length });
});

export default router;
