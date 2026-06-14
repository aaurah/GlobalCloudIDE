import { Router } from "express";
import OpenAI from "openai";
import { deployments } from "./deploy";
import { getProjectDir } from "./projects";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import os from "os";

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
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace");
}

async function readProjectFile(projectId: string, filePath: string): Promise<string> {
  try {
    const dir = getProjectDir(projectId);
    const abs = path.resolve(dir, filePath.replace(/^\//, ""));
    if (!abs.startsWith(dir)) return "[path traversal denied]";
    return await fs.readFile(abs, "utf-8");
  } catch {
    return "[file not found]";
  }
}

async function writeProjectFile(projectId: string, filePath: string, content: string): Promise<void> {
  const dir = getProjectDir(projectId);
  const abs = path.resolve(dir, filePath.replace(/^\//, ""));
  if (!abs.startsWith(dir)) throw new Error("path traversal");
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

async function listProjectFiles(projectId: string): Promise<string[]> {
  const dir = getProjectDir(projectId);
  const paths: string[] = [];
  async function walk(d: string) {
    try {
      const entries = await fs.readdir(d, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) await walk(full);
        else paths.push("/" + path.relative(dir, full));
      }
    } catch {}
  }
  await walk(dir);
  return paths;
}

async function runInProject(projectId: string, language: string, code: string): Promise<string> {
  return new Promise(resolve => {
    const ext = language === "python" ? ".py" : language === "bash" ? ".sh" : ".js";
    const cmd = language === "python" ? "python3" : language === "bash" ? "bash" : "node";
    const tmp = path.join(os.tmpdir(), `devops_${Date.now()}${ext}`);
    fs.writeFile(tmp, code, "utf-8").then(() => {
      const child = spawn(cmd, [tmp], {
        cwd: getProjectDir(projectId),
        timeout: 15_000,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });
      let out = "";
      child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { out += "[stderr] " + d.toString(); });
      child.on("close", (code) => {
        fs.unlink(tmp).catch(() => {});
        resolve(out.slice(0, 3000) + (code !== 0 ? `\n[exit ${code}]` : ""));
      });
      child.on("error", () => resolve("[process error]"));
    }).catch(() => resolve("[could not write file]"));
  });
}

const DEVOPS_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the project",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to project root" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write or patch a file in the project",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string", description: "Complete file content" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List all files in the project",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "run_code",
      description: "Run code in the project directory",
      parameters: {
        type: "object",
        properties: {
          language: { type: "string", enum: ["node", "python", "bash"] },
          code: { type: "string" },
        },
        required: ["language", "code"],
      },
    },
  },
];

// POST /api/devops/analyze — SSE streaming
router.post("/devops/analyze", async (req, res) => {
  const { projectId, issue, autoFix = false } = req.body as {
    projectId?: string;
    issue?: string;
    autoFix?: boolean;
  };

  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const deployment = deployments.get(projectId);
  const buildLogs = deployment?.buildLogs.slice(-50).join("\n") ?? "(no build logs)";
  const runtimeLogs = deployment?.runtimeLogs.slice(-50).join("\n") ?? "(no runtime logs)";
  const deployStatus = deployment?.status ?? "idle";

  const systemPrompt = `You are an expert DevOps AI agent. You analyze deployment failures, diagnose issues, and fix code.

Your tools let you read/write project files and run code. When fixing issues:
1. Read the relevant files first
2. Diagnose the root cause from the error logs
3. Apply targeted fixes
4. Run the code to verify the fix works
5. Summarize what you changed

Be concise in your thinking messages. Write complete fixed files.`;

  const userMessage = `Project ID: ${projectId}
Deployment status: ${deployStatus}

Build logs:
${buildLogs}

Runtime logs:
${runtimeLogs}

${issue ? `User reported issue: ${issue}` : ""}

${autoFix ? "Diagnose and automatically fix any issues you find." : "Diagnose the issue and explain what went wrong and how to fix it."}`;

  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    const filesChanged: string[] = [];
    let iterations = 0;
    const MAX_ITER = autoFix ? 8 : 3;

    while (iterations < MAX_ITER) {
      iterations++;

      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 4096,
        messages,
        tools: autoFix ? DEVOPS_TOOLS : undefined,
        tool_choice: autoFix ? "auto" : undefined,
      });

      const choice = response.choices[0];
      if (!choice) break;

      const msg = choice.message;
      messages.push(msg);

      if (msg.content) {
        send({ type: "thinking", content: msg.content });
      }

      if (choice.finish_reason === "stop" || !msg.tool_calls?.length) break;

      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

      for (const toolCall of msg.tool_calls) {
        if (toolCall.type !== "function") continue;
        const fn = toolCall.function.name;
        let args: Record<string, string> = {};
        try { args = JSON.parse(toolCall.function.arguments); } catch {}

        let result = "";

        if (fn === "read_file") {
          send({ type: "action", action: "read_file", path: args.path });
          result = await readProjectFile(projectId, args.path);
        } else if (fn === "write_file") {
          send({ type: "action", action: "write_file", path: args.path });
          await writeProjectFile(projectId, args.path, args.content);
          if (!filesChanged.includes(args.path)) filesChanged.push(args.path);
          result = `Written: ${args.path}`;
        } else if (fn === "list_files") {
          send({ type: "action", action: "list_files", path: "/" });
          const files = await listProjectFiles(projectId);
          result = files.join("\n") || "(empty project)";
        } else if (fn === "run_code") {
          send({ type: "action", action: "run_code", language: args.language });
          const output = await runInProject(projectId, args.language, args.code);
          send({ type: "output", content: output });
          result = output;
        }

        toolResults.push({ role: "tool", tool_call_id: toolCall.id, content: result });
      }

      messages.push(...toolResults);
    }

    send({ type: "done", filesChanged });
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DevOps agent failed";
    req.log.error({ err }, "DevOps agent error");
    send({ type: "error", content: message });
    send({ type: "done", filesChanged: [] });
    res.end();
  }
});

export default router;
