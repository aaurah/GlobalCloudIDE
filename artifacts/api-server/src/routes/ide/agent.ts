import { Router } from "express";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import os from "os";
import { readMemory } from "./memory";

const router = Router();

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured. Please add it as a secret.");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  const workspaceRoot = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(workspaceRoot, "ide-workspace");
}

function safePath(userPath: string): string {
  const root = getWorkspaceRoot();
  const resolved = path.resolve(root, userPath.replace(/^\//, ""));
  if (!resolved.startsWith(root)) throw new Error("Path traversal not allowed");
  return resolved;
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".tsx": "typescriptreact", ".jsx": "javascriptreact",
    ".sh": "bash", ".md": "markdown",
  };
  return map[ext] ?? "plaintext";
}

function getRunLang(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".js") return "node";
  if (ext === ".sh") return "bash";
  return null;
}

async function runCodeSubprocess(language: string, code: string): Promise<string> {
  return new Promise((resolve) => {
    const extMap: Record<string, string> = { python: ".py", node: ".js", bash: ".sh" };
    const cmdMap: Record<string, string> = { python: "python3", node: "node", bash: "bash" };
    const ext = extMap[language] ?? ".sh";
    const cmd = cmdMap[language] ?? "bash";
    const tmpFile = path.join(os.tmpdir(), `agent_run_${Date.now()}${ext}`);

    fs.writeFile(tmpFile, code, "utf-8").then(() => {
      const child = spawn(cmd, [tmpFile], {
        timeout: 15_000,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });
      let output = "";
      child.stdout.on("data", (d: Buffer) => { output += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { output += "[stderr] " + d.toString(); });
      child.on("close", (code) => {
        fs.unlink(tmpFile).catch(() => {});
        resolve(output.slice(0, 3000) + (code !== 0 ? `\n[exit ${code}]` : ""));
      });
      child.on("error", () => resolve("[process error]"));
    }).catch(() => resolve("[failed to write temp file]"));
  });
}

async function readWorkspaceFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(safePath(filePath), "utf-8");
  } catch {
    return "";
  }
}

async function writeWorkspaceFile(filePath: string, content: string): Promise<void> {
  const abs = safePath(filePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

async function listWorkspaceFiles(dir = "/"): Promise<string[]> {
  const root = getWorkspaceRoot();
  const paths: string[] = [];
  async function walk(d: string) {
    try {
      const entries = await fs.readdir(d, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "__pycache__") continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) await walk(full);
        else paths.push("/" + path.relative(root, full).replace(/\\/g, "/"));
      }
    } catch {}
  }
  await walk(path.join(root, dir.replace(/^\//, "")));
  return paths;
}

type AgentMode = "builder" | "debugger" | "reviewer" | "auto";

interface AgentTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const TOOLS: AgentTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the content of a file in the workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path relative to workspace root, starting with /" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write or create a file in the workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root" },
          content: { type: "string", description: "Full file content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file from the workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List all files in the workspace",
      parameters: {
        type: "object",
        properties: { directory: { type: "string", description: "Directory to list, default /" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_code",
      description: "Run code and get the output. Use to verify code works or check for errors.",
      parameters: {
        type: "object",
        properties: {
          language: { type: "string", enum: ["python", "node", "bash"] },
          code: { type: "string", description: "Code to execute" },
        },
        required: ["language", "code"],
      },
    },
  },
];

function getSystemPrompt(mode: AgentMode, memory: Awaited<ReturnType<typeof readMemory>>): string {
  const memoryCtx = `
Project memory:
- Name: ${memory.projectName}
- Description: ${memory.description}
- Architecture: ${memory.architecture.join(", ") || "not defined"}
- Naming conventions: ${memory.namingConventions.join(", ") || "not defined"}
- Coding style: ${memory.codingStyle.join(", ") || "not defined"}
- Dependencies: ${memory.dependencies.join(", ") || "not defined"}
- Notes: ${memory.notes.join("; ") || "none"}
`.trim();

  const base = `You are an autonomous AI agent with full access to the project filesystem. You can read files, write files, delete files, list files, and run code.

${memoryCtx}

Always:
- Read relevant files before making changes
- Write complete, working code — never partial or placeholder code
- Run code to verify it works when appropriate
- Fix errors you encounter
- Be concise in your thinking messages`;

  switch (mode) {
    case "builder":
      return `${base}

You are the BUILDER agent. Your job is to create new code, files, and features. Focus on building clean, working implementations. When you create files, make sure they integrate well with existing code.`;
    case "debugger":
      return `${base}

You are the DEBUGGER agent. Your job is to find and fix bugs. Analyze error messages carefully, read the relevant code, understand the root cause, and apply targeted fixes. Run the fixed code to verify the fix works.`;
    case "reviewer":
      return `${base}

You are the REVIEWER agent. Your job is to analyze code quality and suggest improvements. Look for: performance issues, security problems, code duplication, missing error handling, unclear naming, and missing documentation. Provide specific, actionable improvements.`;
    case "auto":
    default:
      return `${base}

You are an autonomous AI agent. Analyze the task and determine the best approach — building new features, fixing bugs, or reviewing and improving code. Use your best judgment.`;
  }
}

// POST /api/agent — SSE streaming
router.post("/agent", async (req, res) => {
  const { mode = "auto", task, targetFile, errorOutput, autoRun = false } = req.body as {
    mode: AgentMode;
    task: string;
    targetFile?: string;
    errorOutput?: string;
    autoRun?: boolean;
  };

  if (!task) {
    res.status(400).json({ error: "task is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: Record<string, unknown>) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  const filesChanged: string[] = [];

  try {
    const memory = await readMemory();
    const systemPrompt = getSystemPrompt(mode, memory);

    let userMessage = task;
    if (targetFile) userMessage += `\n\nTarget file: ${targetFile}`;
    if (errorOutput) userMessage += `\n\nError output:\n${errorOutput}`;

    send({ type: "thinking", content: `Starting ${mode} agent...`, step: 1 });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 8192,
        messages,
        tools: TOOLS as OpenAI.Chat.ChatCompletionTool[],
        tool_choice: "auto",
      });

      const choice = response.choices[0];
      if (!choice) break;

      const msg = choice.message;
      messages.push(msg);

      if (msg.content) {
        send({ type: "thinking", content: msg.content, step: iterations });
      }

      if (choice.finish_reason === "stop" || !msg.tool_calls?.length) {
        break;
      }

      // Process tool calls
      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

      for (const toolCall of msg.tool_calls) {
        if (toolCall.type !== "function") continue;
        const fnName = toolCall.function.name;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(toolCall.function.arguments); } catch {}

        let result = "";

        if (fnName === "read_file") {
          const filePath = args.path as string;
          send({ type: "action", action: "read_file", path: filePath });
          result = await readWorkspaceFile(filePath);
          if (!result) result = "[File not found or empty]";

        } else if (fnName === "write_file") {
          const filePath = args.path as string;
          const content = args.content as string;
          send({ type: "action", action: "write_file", path: filePath });
          await writeWorkspaceFile(filePath, content);
          if (!filesChanged.includes(filePath)) filesChanged.push(filePath);
          result = `File written: ${filePath}`;

        } else if (fnName === "delete_file") {
          const filePath = args.path as string;
          send({ type: "action", action: "delete_file", path: filePath });
          try {
            await fs.unlink(safePath(filePath));
            result = `Deleted: ${filePath}`;
          } catch {
            result = `[Could not delete ${filePath}]`;
          }

        } else if (fnName === "list_files") {
          const dir = (args.directory as string) ?? "/";
          send({ type: "action", action: "list_files", path: dir });
          const files = await listWorkspaceFiles(dir);
          result = files.join("\n") || "[empty workspace]";

        } else if (fnName === "run_code") {
          const language = args.language as string;
          const code = args.code as string;
          send({ type: "action", action: "run_code", language });
          const output = await runCodeSubprocess(language, code);
          send({ type: "output", content: output });
          result = output;
        }

        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      messages.push(...toolResults);
    }

    send({ type: "done", filesChanged });
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Agent failed";
    req.log.error({ err }, "Agent failed");
    send({ type: "error", content: message });
    send({ type: "done", filesChanged });
    res.end();
  }
});

export default router;
