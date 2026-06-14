import { Router } from "express";
import { spawn } from "child_process";
import { getProjectDir } from "./projects";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

type StageStatus = "pending" | "running" | "passed" | "failed" | "skipped";
type PipelineStatus = "pending" | "running" | "passed" | "failed" | "cancelled";

interface PipelineStage {
  name: string;
  command: string;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  logs: string[];
}

interface Pipeline {
  id: string;
  projectId: string;
  name: string;
  environment: string;
  status: PipelineStatus;
  stages: PipelineStage[];
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  triggeredBy?: string;
}

interface PipelineDefinition {
  name?: string;
  environment?: string;
  stages: Array<{ name: string; command: string }>;
}

const pipelines = new Map<string, Pipeline[]>(); // projectId → []

function getProjectPipelines(projectId: string): Pipeline[] {
  if (!pipelines.has(projectId)) pipelines.set(projectId, []);
  return pipelines.get(projectId)!;
}

function makeid() { return Math.random().toString(36).slice(2, 10); }

const DEFAULT_DEF: PipelineDefinition = {
  name: "CI/CD Pipeline",
  environment: "production",
  stages: [
    { name: "Install",  command: "echo 'Installing dependencies...'" },
    { name: "Build",    command: "echo 'Building application...'" },
    { name: "Test",     command: "echo 'Running tests... All passed.'" },
    { name: "Package",  command: "echo 'Packaging artifacts...'" },
    { name: "Deploy",   command: "echo 'Deploying to production...'" },
  ],
};

async function runStage(
  stage: PipelineStage,
  cwd: string,
  onLog: (msg: string) => void
): Promise<boolean> {
  stage.status = "running";
  stage.startedAt = new Date().toISOString();

  return new Promise(resolve => {
    const [cmd, ...args] = stage.command.split(" ");
    const child = spawn(cmd, args, { cwd, shell: true, timeout: 120_000 });

    child.stdout.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      if (line) { stage.logs.push(line); onLog(line); }
    });
    child.stderr.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      if (line) { stage.logs.push("[stderr] " + line); onLog("[stderr] " + line); }
    });
    child.on("close", code => {
      stage.finishedAt = new Date().toISOString();
      stage.durationMs = new Date(stage.finishedAt).getTime() - new Date(stage.startedAt!).getTime();
      stage.status = code === 0 ? "passed" : "failed";
      resolve(code === 0);
    });
    child.on("error", err => {
      stage.logs.push(`[error] ${err.message}`);
      stage.status = "failed";
      stage.finishedAt = new Date().toISOString();
      resolve(false);
    });
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/pipelines/:projectId/list
router.get("/pipelines/:projectId/list", (req, res) => {
  const list = getProjectPipelines(req.params.projectId);
  res.json({ projectId: req.params.projectId, pipelines: list.slice(0, 30) });
});

// GET /api/pipelines/:projectId/:pipelineId
router.get("/pipelines/:projectId/:pipelineId", (req, res) => {
  const { projectId, pipelineId } = req.params;
  const pipeline = getProjectPipelines(projectId).find(p => p.id === pipelineId);
  if (!pipeline) { res.status(404).json({ error: "Pipeline not found" }); return; }
  res.json(pipeline);
});

// POST /api/pipelines/:projectId/run — SSE streaming pipeline execution
router.post("/pipelines/:projectId/run", async (req, res) => {
  const { projectId } = req.params;
  const def: PipelineDefinition = req.body?.definition ?? DEFAULT_DEF;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const pipeline: Pipeline = {
    id: makeid(),
    projectId,
    name: def.name ?? "Pipeline",
    environment: def.environment ?? "production",
    status: "running",
    startedAt: new Date().toISOString(),
    triggeredBy: "user",
    stages: def.stages.map(s => ({
      name: s.name,
      command: s.command,
      status: "pending",
      logs: [],
    })),
  };

  getProjectPipelines(projectId).unshift(pipeline);
  send({ type: "pipeline_started", id: pipeline.id, name: pipeline.name });

  let projectDir: string;
  try {
    projectDir = getProjectDir(projectId);
  } catch {
    projectDir = process.cwd();
  }

  let overallPassed = true;

  for (const stage of pipeline.stages) {
    if (!overallPassed) {
      stage.status = "skipped";
      send({ type: "stage_skipped", stage: stage.name });
      continue;
    }

    send({ type: "stage_start", stage: stage.name, command: stage.command });
    pipeline.status = "running";

    const passed = await runStage(stage, projectDir, (msg) => {
      send({ type: "stage_log", stage: stage.name, message: msg });
    });

    if (!passed) {
      overallPassed = false;
      pipeline.status = "failed";
      send({ type: "stage_failed", stage: stage.name });
    } else {
      send({ type: "stage_passed", stage: stage.name, durationMs: stage.durationMs });
    }
  }

  pipeline.finishedAt = new Date().toISOString();
  pipeline.durationMs = new Date(pipeline.finishedAt).getTime() - new Date(pipeline.startedAt).getTime();
  pipeline.status = overallPassed ? "passed" : "failed";

  send({ type: "pipeline_done", status: pipeline.status, durationMs: pipeline.durationMs, pipeline });
  res.end();
});

// POST /api/pipelines/:projectId/:pipelineId/cancel
router.post("/pipelines/:projectId/:pipelineId/cancel", (req, res) => {
  const { projectId, pipelineId } = req.params;
  const pipeline = getProjectPipelines(projectId).find(p => p.id === pipelineId);
  if (!pipeline) { res.status(404).json({ error: "Pipeline not found" }); return; }
  if (pipeline.status === "running") {
    pipeline.status = "cancelled";
    pipeline.finishedAt = new Date().toISOString();
    // Mark pending stages as skipped
    for (const s of pipeline.stages) {
      if (s.status === "pending" || s.status === "running") s.status = "skipped";
    }
  }
  res.json({ success: true, pipeline });
});

export default router;
