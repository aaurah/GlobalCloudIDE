import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { RunCodeBody } from "@workspace/api-zod";

const router = Router();

const BLOCKED = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  /:\(\)\{.*\}/,
  /chmod\s+777\s+\//,
  />\s*\/dev\/sd/,
  /shutdown/,
  /reboot/,
  /halt/,
];

function isSafe(code: string): boolean {
  return !BLOCKED.some((pattern) => pattern.test(code));
}

function getLangConfig(language: string): { cmd: string; args: (file: string) => string[] } {
  switch (language) {
    case "python":
      return { cmd: "python3", args: (f) => [f] };
    case "node":
      return { cmd: "node", args: (f) => [f] };
    case "bash":
      return { cmd: "bash", args: (f) => [f] };
    default:
      return { cmd: "bash", args: (f) => [f] };
  }
}

function getFileExtension(language: string): string {
  switch (language) {
    case "python": return ".py";
    case "node": return ".js";
    case "bash": return ".sh";
    default: return ".sh";
  }
}

// POST /api/run  — SSE streaming
router.post("/run", async (req, res) => {
  const parsed = RunCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { language, code } = parsed.data;

  if (!isSafe(code)) {
    res.status(400).json({ error: "Code contains blocked patterns" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Write code to a temp file
  const tmpDir = os.tmpdir();
  const ext = getFileExtension(language);
  const tmpFile = path.join(tmpDir, `ide_run_${Date.now()}${ext}`);

  try {
    await fs.writeFile(tmpFile, code, "utf-8");
    if (language === "bash") {
      await fs.chmod(tmpFile, 0o755);
    }
  } catch (err) {
    send({ error: "Failed to create temp file", done: true });
    res.end();
    return;
  }

  const { cmd, args } = getLangConfig(language);
  const child = spawn(cmd, args(tmpFile), {
    timeout: 30_000,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  send({ content: `▶ Running ${language} code...\n`, type: "info" });

  child.stdout.on("data", (chunk: Buffer) => {
    send({ content: chunk.toString(), type: "stdout" });
  });

  child.stderr.on("data", (chunk: Buffer) => {
    send({ content: chunk.toString(), type: "stderr" });
  });

  child.on("close", async (code) => {
    const exitMsg = code === 0
      ? `\n✓ Process exited with code ${code}`
      : `\n✗ Process exited with code ${code}`;
    send({ content: exitMsg, type: code === 0 ? "info" : "error" });
    send({ done: true });
    res.end();
    try { await fs.unlink(tmpFile); } catch { /* ignore */ }
  });

  child.on("error", async (err) => {
    send({ content: `Failed to start process: ${err.message}`, type: "error" });
    send({ done: true });
    res.end();
    try { await fs.unlink(tmpFile); } catch { /* ignore */ }
  });

  req.on("close", () => {
    child.kill("SIGTERM");
  });
});

export default router;
