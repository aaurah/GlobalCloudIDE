import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { getAuthUser } from "./auth";

const router = Router();

export interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  capabilities: ("ui-panel" | "commands" | "ai-tools" | "file-templates" | "deploy-presets")[];
  config: Record<string, unknown>;
  icon: string;
  downloads: number;
  rating: number;
  installedBy: string[];
}

// Built-in plugin catalog
const PLUGIN_CATALOG: Plugin[] = [
  {
    id: "markdown-preview",
    name: "Markdown Preview",
    description: "Live preview of Markdown files with syntax highlighting and GitHub-style rendering.",
    version: "1.2.0",
    author: "CloudIDE Team",
    category: "editor",
    capabilities: ["ui-panel"],
    config: { theme: "github-dark", autoRefresh: true },
    icon: "📝",
    downloads: 12400,
    rating: 4.8,
    installedBy: [],
  },
  {
    id: "git-integration",
    name: "Git Integration",
    description: "Full Git workflow: stage, commit, push, pull, branch management, and diff viewer.",
    version: "2.1.0",
    author: "CloudIDE Team",
    category: "vcs",
    capabilities: ["ui-panel", "commands"],
    config: { defaultBranch: "main", autoFetch: true },
    icon: "🔀",
    downloads: 24100,
    rating: 4.9,
    installedBy: [],
  },
  {
    id: "eslint-linter",
    name: "ESLint",
    description: "Real-time JavaScript/TypeScript linting with auto-fix support.",
    version: "1.0.5",
    author: "ESLint Community",
    category: "linting",
    capabilities: ["commands", "ai-tools"],
    config: { autoFix: false, severity: "warning" },
    icon: "🔍",
    downloads: 31200,
    rating: 4.7,
    installedBy: [],
  },
  {
    id: "prettier-formatter",
    name: "Prettier",
    description: "Opinionated code formatter for JS, TS, CSS, HTML, JSON, and more.",
    version: "3.0.0",
    author: "Prettier Team",
    category: "formatting",
    capabilities: ["commands"],
    config: { printWidth: 100, tabWidth: 2, singleQuote: true },
    icon: "✨",
    downloads: 45000,
    rating: 4.9,
    installedBy: [],
  },
  {
    id: "code-snippets",
    name: "Code Snippets",
    description: "Curated snippets for React, Express, Python, and more. Trigger with prefix shortcuts.",
    version: "1.3.2",
    author: "Community",
    category: "productivity",
    capabilities: ["commands", "file-templates"],
    config: { languages: ["javascript", "typescript", "python"] },
    icon: "⚡",
    downloads: 8900,
    rating: 4.5,
    installedBy: [],
  },
  {
    id: "docker-compose",
    name: "Docker Compose",
    description: "Visual docker-compose.yml editor with service graph and one-click deploy presets.",
    version: "1.0.0",
    author: "CloudIDE Team",
    category: "deployment",
    capabilities: ["ui-panel", "deploy-presets", "file-templates"],
    config: { defaultNetwork: "bridge" },
    icon: "🐳",
    downloads: 5600,
    rating: 4.6,
    installedBy: [],
  },
  {
    id: "rest-client",
    name: "REST Client",
    description: "In-IDE HTTP client for testing APIs. Supports .http files, environments, and history.",
    version: "2.0.1",
    author: "Community",
    category: "testing",
    capabilities: ["ui-panel", "commands"],
    config: { timeout: 30000 },
    icon: "🌐",
    downloads: 19300,
    rating: 4.7,
    installedBy: [],
  },
  {
    id: "database-explorer",
    name: "Database Explorer",
    description: "Connect to PostgreSQL, MySQL, SQLite, and MongoDB. Browse tables and run queries.",
    version: "1.1.0",
    author: "CloudIDE Team",
    category: "database",
    capabilities: ["ui-panel", "commands"],
    config: {},
    icon: "🗄️",
    downloads: 7800,
    rating: 4.4,
    installedBy: [],
  },
];

function getPluginsFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform/plugins.json");
}

async function readPlugins(): Promise<Plugin[]> {
  try {
    const raw = await fs.readFile(getPluginsFile(), "utf-8");
    const stored: Plugin[] = JSON.parse(raw);
    // Merge stored installedBy into catalog
    return PLUGIN_CATALOG.map(p => {
      const s = stored.find(x => x.id === p.id);
      return s ? { ...p, installedBy: s.installedBy } : p;
    });
  } catch {
    return PLUGIN_CATALOG.map(p => ({ ...p }));
  }
}

async function writePlugins(plugins: Plugin[]): Promise<void> {
  const file = getPluginsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Only store the installedBy array — catalog is source of truth
  const slim = plugins.map(p => ({ id: p.id, installedBy: p.installedBy }));
  await fs.writeFile(file, JSON.stringify(slim, null, 2));
}

// GET /plugins — full catalog
router.get("/plugins", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const plugins = await readPlugins();
  const category = req.query.category as string | undefined;
  const filtered = category ? plugins.filter(p => p.category === category) : plugins;
  res.json(filtered.map(p => ({ ...p, installed: p.installedBy.includes(userId) })));
});

// GET /plugins/installed — user's plugins
router.get("/plugins/installed", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const plugins = await readPlugins();
  res.json(plugins
    .filter(p => p.installedBy.includes(userId))
    .map(p => ({ ...p, installed: true })));
});

// GET /plugins/:id
router.get("/plugins/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const plugins = await readPlugins();
  const plugin = plugins.find(p => p.id === req.params.id);
  if (!plugin) return void res.status(404).json({ error: "Plugin not found" });
  res.json({ ...plugin, installed: plugin.installedBy.includes(userId) });
});

// POST /plugins/install
router.post("/plugins/install", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { pluginId } = req.body as { pluginId: string };
  if (!pluginId) return void res.status(400).json({ error: "pluginId required" });

  const plugins = await readPlugins();
  const plugin = plugins.find(p => p.id === pluginId);
  if (!plugin) return void res.status(404).json({ error: "Plugin not found" });
  if (plugin.installedBy.includes(userId)) return void res.json({ ok: true, message: "Already installed" });

  plugin.installedBy.push(userId);
  plugin.downloads += 1;
  await writePlugins(plugins);
  res.json({ ok: true, plugin: { ...plugin, installed: true } });
});

// DELETE /plugins/:id/uninstall
router.delete("/plugins/:id/uninstall", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const plugins = await readPlugins();
  const plugin = plugins.find(p => p.id === req.params.id);
  if (!plugin) return void res.status(404).json({ error: "Plugin not found" });

  plugin.installedBy = plugin.installedBy.filter(id => id !== userId);
  await writePlugins(plugins);
  res.json({ ok: true });
});

export default router;
