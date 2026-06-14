import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const router = Router();

function getPlatformDir(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

function getProjectsFile(): string {
  return path.join(getPlatformDir(), "projects.json");
}

export function getProjectDir(projectId: string): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/projects", projectId);
}

export interface DeployConfig {
  type: "static" | "node" | "python";
  buildCommand: string;
  startCommand: string;
  port: number;
  entryPoint: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  deployConfig: DeployConfig;
}

const DEFAULT_DEPLOY_CONFIG: DeployConfig = {
  type: "node",
  buildCommand: "",
  startCommand: "node index.js",
  port: 3000,
  entryPoint: "index.js",
};

async function readProjects(): Promise<Project[]> {
  try {
    const raw = await fs.readFile(getProjectsFile(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeProjects(projects: Project[]): Promise<void> {
  await fs.mkdir(getPlatformDir(), { recursive: true });
  await fs.writeFile(getProjectsFile(), JSON.stringify(projects, null, 2), "utf-8");
}

// GET /api/projects
router.get("/projects", async (req, res) => {
  const projects = await readProjects();
  res.json(projects.map(p => ({ ...p })));
});

// POST /api/projects
router.post("/projects", async (req, res) => {
  const { name, description, type, ownerId } = req.body as {
    name?: string;
    description?: string;
    type?: string;
    ownerId?: string;
  };

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const projects = await readProjects();
  const id = randomUUID().slice(0, 8);

  const deployConfig: DeployConfig = {
    ...DEFAULT_DEPLOY_CONFIG,
    type: (type as DeployConfig["type"]) ?? "node",
  };

  const project: Project = {
    id,
    name,
    description: description ?? "",
    ownerId: ownerId ?? "guest",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deployConfig,
  };

  // Create project workspace directory with a starter file
  const projectDir = getProjectDir(id);
  await fs.mkdir(projectDir, { recursive: true });

  const starters: Record<string, { file: string; content: string }> = {
    node: {
      file: "index.js",
      content: `const http = require('http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>Hello from ${name}!</h1><p>Deployed via CloudIDE</p>');
});
server.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
`,
    },
    python: {
      file: "app.py",
      content: `from http.server import HTTPServer, BaseHTTPRequestHandler
import os

PORT = int(os.environ.get('PORT', 3000))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.end_headers()
        self.wfile.write(b'<h1>Hello from ${name}!</h1><p>Deployed via CloudIDE</p>')
    def log_message(self, format, *args):
        print(format % args)

print(f'Server running on port {PORT}')
HTTPServer(('', PORT), Handler).serve_forever()
`,
    },
    static: {
      file: "index.html",
      content: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${name}</title>
<style>body{font-family:system-ui;max-width:600px;margin:80px auto;text-align:center}</style>
</head>
<body>
<h1>Welcome to ${name}</h1>
<p>Deployed via CloudIDE</p>
</body>
</html>`,
    },
  };

  const starter = starters[deployConfig.type];
  if (starter) {
    await fs.writeFile(path.join(projectDir, starter.file), starter.content, "utf-8");
    if (deployConfig.type === "node") {
      project.deployConfig.entryPoint = "index.js";
      project.deployConfig.startCommand = "node index.js";
    } else if (deployConfig.type === "python") {
      project.deployConfig.entryPoint = "app.py";
      project.deployConfig.startCommand = "python3 app.py";
    } else {
      project.deployConfig.entryPoint = "index.html";
      project.deployConfig.startCommand = "";
    }
  }

  projects.push(project);
  await writeProjects(projects);

  res.status(201).json(project);
});

// GET /api/projects/:id
router.get("/projects/:id", async (req, res) => {
  const projects = await readProjects();
  const project = projects.find(p => p.id === req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

// PUT /api/projects/:id
router.put("/projects/:id", async (req, res) => {
  const projects = await readProjects();
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { name, description, deployConfig } = req.body as {
    name?: string;
    description?: string;
    deployConfig?: Partial<DeployConfig>;
  };

  if (name) projects[idx].name = name;
  if (description !== undefined) projects[idx].description = description;
  if (deployConfig) projects[idx].deployConfig = { ...projects[idx].deployConfig, ...deployConfig };
  projects[idx].updatedAt = new Date().toISOString();

  await writeProjects(projects);
  res.json(projects[idx]);
});

// DELETE /api/projects/:id
router.delete("/projects/:id", async (req, res) => {
  const projects = await readProjects();
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  projects.splice(idx, 1);
  await writeProjects(projects);

  try {
    await fs.rm(getProjectDir(req.params.id), { recursive: true, force: true });
  } catch { /* ignore */ }

  res.json({ success: true });
});

export default router;
