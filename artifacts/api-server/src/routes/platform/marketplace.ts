import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import { getAuthUser } from "./auth";
import { billingDeduct } from "./billing";
import { getProjectDir } from "./projects";

const router = Router();

export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  category: "builder" | "debugger" | "reviewer" | "devops" | "documentation" | "testing" | "data";
  capabilities: string[];
  model: string;
  icon: string;
  downloads: number;
  rating: number;
  installedBy: string[];
  systemPrompt: string;
  tools: string[];
  author: string;
  version: string;
}

const AGENT_CATALOG: MarketplaceAgent[] = [
  {
    id: "builder-pro",
    name: "Builder Pro",
    description: "Autonomous full-stack builder. Generates complete features, writes tests, and handles routing. Specializes in React, Node.js, and Python.",
    category: "builder",
    capabilities: ["write-files", "run-code", "list-files", "read-files", "create-structure"],
    model: "gpt-4o-mini",
    icon: "🏗️",
    downloads: 18400,
    rating: 4.8,
    installedBy: [],
    systemPrompt: `You are Builder Pro, an expert full-stack software engineer. You build complete, production-ready features from scratch. You write clean, well-structured code with proper error handling. Always provide working implementations, not stubs. Think step by step before coding.`,
    tools: ["read_file", "write_file", "list_files", "run_code", "delete_file"],
    author: "CloudIDE Team",
    version: "2.0.0",
  },
  {
    id: "debugger-x",
    name: "Debugger X",
    description: "Root-cause analysis expert. Runs your code, reads error logs, identifies the exact bug and its source, and applies a minimal targeted fix.",
    category: "debugger",
    capabilities: ["run-code", "read-files", "write-fixes", "trace-errors"],
    model: "gpt-4o-mini",
    icon: "🐛",
    downloads: 14200,
    rating: 4.9,
    installedBy: [],
    systemPrompt: `You are Debugger X, a world-class debugging expert. Your process: 1) Read the failing code carefully 2) Run it to see the exact error 3) Trace the error to its root cause 4) Apply a minimal, targeted fix 5) Verify the fix works. Never guess — always read the actual error output.`,
    tools: ["read_file", "write_file", "run_code", "list_files"],
    author: "CloudIDE Team",
    version: "1.5.0",
  },
  {
    id: "reviewer-ai",
    name: "Code Reviewer",
    description: "Senior engineer code review. Analyzes code quality, security vulnerabilities, performance issues, and architectural concerns with actionable feedback.",
    category: "reviewer",
    capabilities: ["read-files", "analyze-code", "security-scan", "performance-review"],
    model: "gpt-4o-mini",
    icon: "👀",
    downloads: 9800,
    rating: 4.7,
    installedBy: [],
    systemPrompt: `You are a Senior Code Reviewer with 15 years of experience. Review code for: 1) Correctness & edge cases 2) Security vulnerabilities 3) Performance bottlenecks 4) Code clarity & naming 5) Architecture & design patterns. Provide specific, actionable feedback with code examples.`,
    tools: ["read_file", "list_files", "run_code"],
    author: "CloudIDE Team",
    version: "1.3.0",
  },
  {
    id: "devops-engineer",
    name: "DevOps Engineer",
    description: "Infrastructure automation specialist. Creates Dockerfiles, CI/CD pipelines, deployment configs, and diagnoses server/deployment issues.",
    category: "devops",
    capabilities: ["write-files", "read-files", "create-configs", "analyze-logs", "deploy"],
    model: "gpt-4o-mini",
    icon: "⚙️",
    downloads: 7600,
    rating: 4.6,
    installedBy: [],
    systemPrompt: `You are a Senior DevOps Engineer specializing in cloud-native infrastructure. You write production-grade Dockerfiles, CI/CD pipelines (GitHub Actions, GitLab CI), Kubernetes manifests, and deployment scripts. You diagnose infrastructure issues from logs and provide remediation steps.`,
    tools: ["read_file", "write_file", "list_files", "run_code"],
    author: "CloudIDE Team",
    version: "1.2.0",
  },
  {
    id: "doc-writer",
    name: "Documentation Writer",
    description: "Technical writer that auto-generates README, API docs, inline comments, and usage guides from your actual codebase.",
    category: "documentation",
    capabilities: ["read-files", "write-docs", "generate-readme", "api-docs"],
    model: "gpt-4o-mini",
    icon: "📚",
    downloads: 6100,
    rating: 4.5,
    installedBy: [],
    systemPrompt: `You are a Technical Documentation Writer. You read codebases and generate clear, comprehensive documentation: READMEs with setup/usage/API docs, inline JSDoc/docstring comments, architecture decision records, and runbooks. Make docs that developers actually want to read.`,
    tools: ["read_file", "write_file", "list_files"],
    author: "CloudIDE Team",
    version: "1.1.0",
  },
  {
    id: "test-generator",
    name: "Test Generator",
    description: "Automated test writer for unit, integration, and e2e tests. Covers happy paths, edge cases, and error scenarios with high coverage.",
    category: "testing",
    capabilities: ["read-files", "write-tests", "run-tests", "coverage-analysis"],
    model: "gpt-4o-mini",
    icon: "✅",
    downloads: 5400,
    rating: 4.6,
    installedBy: [],
    systemPrompt: `You are a Test Engineering expert. You write comprehensive test suites using Jest, Vitest, Pytest, or the appropriate framework. Cover: unit tests for all functions, integration tests for APIs, edge cases, error conditions, and mocking external dependencies. Aim for >80% coverage.`,
    tools: ["read_file", "write_file", "list_files", "run_code"],
    author: "Community",
    version: "1.0.0",
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Analyzes data files (CSV, JSON), writes transformation scripts, generates visualizations, and provides statistical insights.",
    category: "data",
    capabilities: ["read-files", "write-scripts", "run-analysis", "visualize"],
    model: "gpt-4o-mini",
    icon: "📊",
    downloads: 3200,
    rating: 4.4,
    installedBy: [],
    systemPrompt: `You are a Data Analyst expert proficient in Python (pandas, numpy, matplotlib, seaborn) and JavaScript (D3, Chart.js). You analyze data files, perform statistical analysis, clean data, generate insightful visualizations, and explain findings clearly.`,
    tools: ["read_file", "write_file", "list_files", "run_code"],
    author: "Community",
    version: "1.0.0",
  },
];

function getMarketplaceFile(): string {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform/marketplace.json");
}

async function readMarketplace(): Promise<MarketplaceAgent[]> {
  try {
    const raw = await fs.readFile(getMarketplaceFile(), "utf-8");
    const stored: { id: string; installedBy: string[]; downloads: number }[] = JSON.parse(raw);
    return AGENT_CATALOG.map(a => {
      const s = stored.find(x => x.id === a.id);
      return s ? { ...a, installedBy: s.installedBy, downloads: s.downloads } : { ...a };
    });
  } catch {
    return AGENT_CATALOG.map(a => ({ ...a }));
  }
}

async function writeMarketplace(agents: MarketplaceAgent[]): Promise<void> {
  const file = getMarketplaceFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const slim = agents.map(a => ({ id: a.id, installedBy: a.installedBy, downloads: a.downloads }));
  await fs.writeFile(file, JSON.stringify(slim, null, 2));
}

// GET /marketplace/agents
router.get("/marketplace/agents", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const agents = await readMarketplace();
  const category = req.query.category as string | undefined;
  const filtered = category ? agents.filter(a => a.category === category) : agents;
  res.json(filtered.map(a => ({
    ...a,
    systemPrompt: undefined,
    installed: a.installedBy.includes(userId),
  })));
});

// GET /marketplace/agents/:id
router.get("/marketplace/agents/:id", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const agents = await readMarketplace();
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return void res.status(404).json({ error: "Agent not found" });
  res.json({ ...agent, systemPrompt: undefined, installed: agent.installedBy.includes(userId) });
});

// POST /marketplace/agents/:id/install
router.post("/marketplace/agents/:id/install", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const agents = await readMarketplace();
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return void res.status(404).json({ error: "Agent not found" });
  if (!agent.installedBy.includes(userId)) {
    agent.installedBy.push(userId);
    agent.downloads += 1;
    await writeMarketplace(agents);
  }
  res.json({ ok: true });
});

// DELETE /marketplace/agents/:id/uninstall
router.delete("/marketplace/agents/:id/uninstall", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const agents = await readMarketplace();
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return void res.status(404).json({ error: "Agent not found" });
  agent.installedBy = agent.installedBy.filter(id => id !== userId);
  await writeMarketplace(agents);
  res.json({ ok: true });
});

// POST /marketplace/agents/:id/run — SSE streaming agent execution
router.post("/marketplace/agents/:id/run", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const agents = await readMarketplace();
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return void res.status(404).json({ error: "Agent not found" });
  if (!agent.installedBy.includes(userId)) return void res.status(403).json({ error: "Agent not installed" });

  const { task, projectId } = req.body as { task: string; projectId?: string };
  if (!task) return void res.status(400).json({ error: "task required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  await billingDeduct(userId, 3, "ai-call", `Agent run: ${agent.name}`);

  const workDir = projectId ? getProjectDir(projectId) : process.cwd();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { send({ type: "error", content: "OPENAI_API_KEY not set" }); return void res.end(); }

  const client = new OpenAI({ apiKey });

  const toolDefs = [
    { name: "read_file", description: "Read a file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "write_file", description: "Write a file", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
    { name: "list_files", description: "List files in a directory", parameters: { type: "object", properties: { dir: { type: "string" } }, required: [] } },
    { name: "run_code", description: "Run code", parameters: { type: "object", properties: { language: { type: "string" }, code: { type: "string" } }, required: ["language", "code"] } },
    { name: "delete_file", description: "Delete a file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  ];

  const availableTools = toolDefs.filter(t => agent.tools.includes(t.name));
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: agent.systemPrompt },
    { role: "user", content: task },
  ];

  let iterations = 0;
  const filesChanged: string[] = [];

  try {
    while (iterations < 15) {
      iterations++;
      const response = await client.chat.completions.create({
        model: agent.model,
        messages,
        tools: availableTools.map(t => ({ type: "function" as const, function: t })),
        tool_choice: "auto",
      });

      const msg = response.choices[0].message;
      messages.push(msg);

      if (msg.content) send({ type: "thinking", content: msg.content });

      if (!msg.tool_calls?.length) break;

      const toolResultsArr: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

      for (const rawCall of msg.tool_calls) {
        const call = rawCall as { id: string; function: { name: string; arguments: string } };
        const args = JSON.parse(call.function.arguments);
        let result = "";
        send({ type: "action", action: call.function.name, path: args.path || args.dir, language: args.language });

        try {
          if (call.function.name === "read_file") {
            const p = path.resolve(workDir, args.path);
            result = await fs.readFile(p, "utf-8");
          } else if (call.function.name === "write_file") {
            const p = path.resolve(workDir, args.path);
            await fs.mkdir(path.dirname(p), { recursive: true });
            await fs.writeFile(p, args.content, "utf-8");
            if (!filesChanged.includes(args.path)) filesChanged.push(args.path);
            result = "OK";
          } else if (call.function.name === "list_files") {
            const p = path.resolve(workDir, args.dir || ".");
            const entries = await fs.readdir(p, { withFileTypes: true }).catch(() => []);
            result = entries.map(e => `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`).join("\n");
          } else if (call.function.name === "run_code") {
            const { spawn: spawnChild } = await import("child_process");
            result = await new Promise<string>(resolve => {
              const proc = spawnChild("bash", ["-c", args.code], { cwd: workDir });
              let out = "";
              proc.stdout.on("data", (d: Buffer) => out += d.toString());
              proc.stderr.on("data", (d: Buffer) => out += d.toString());
              proc.on("close", () => resolve(out.slice(0, 2000)));
              setTimeout(() => { proc.kill(); resolve(out + "\n[timeout]"); }, 10000);
            });
            send({ type: "output", content: result });
          } else if (call.function.name === "delete_file") {
            const p = path.resolve(workDir, args.path);
            await fs.unlink(p);
            result = "Deleted";
          }
        } catch (e: any) {
          result = `Error: ${e.message}`;
        }

        toolResultsArr.push({ role: "tool", content: result, tool_call_id: call.id });
      }

      messages.push(...toolResultsArr);
    }

    send({ type: "done", content: "Agent completed", filesChanged });
  } catch (err: any) {
    send({ type: "error", content: err.message });
  }
  res.end();
});

export default router;
