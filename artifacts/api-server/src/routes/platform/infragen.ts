import { Router } from "express";
import OpenAI from "openai";
import { getAuthUser } from "./auth";

const router = Router();

const INFRA_PRESETS = [
  {
    id: "nodejs-api",
    name: "Node.js REST API",
    description: "Express API with health check, logging, and graceful shutdown",
    template: { base: "node:20", build: ["npm install"], run: "node server.js", ports: [3000], resources: { cpuLimit: 1, memoryMb: 512, timeoutSecs: 300 } },
  },
  {
    id: "python-ml",
    name: "Python ML Service",
    description: "FastAPI + scikit-learn ML inference endpoint",
    template: { base: "python:3.11", build: ["pip install -r requirements.txt"], run: "uvicorn main:app --host 0.0.0.0 --port 8000", ports: [8000], resources: { cpuLimit: 2, memoryMb: 2048, timeoutSecs: 600 } },
  },
  {
    id: "static-site",
    name: "Static Site",
    description: "nginx serving static files with compression and caching",
    template: { base: "nginx:alpine", build: ["npm run build", "cp -r dist /usr/share/nginx/html"], run: "nginx -g 'daemon off;'", ports: [80], resources: { cpuLimit: 0.5, memoryMb: 128, timeoutSecs: 0 } },
  },
  {
    id: "fullstack-react",
    name: "Full-Stack React + Express",
    description: "React frontend bundled with Express backend API",
    template: { base: "node:20", build: ["npm install", "npm run build"], run: "NODE_ENV=production node server.js", ports: [3000], resources: { cpuLimit: 1, memoryMb: 1024, timeoutSecs: 300 } },
  },
  {
    id: "worker-queue",
    name: "Background Worker",
    description: "Persistent background worker for queue processing",
    template: { base: "node:20", build: ["npm install"], run: "node worker.js", ports: [], resources: { cpuLimit: 0.5, memoryMb: 256, timeoutSecs: 0 } },
  },
];

// GET /infragen/presets
router.get("/infragen/presets", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  res.json(INFRA_PRESETS);
});

// POST /infragen/generate — NL → infrastructure configs via SSE
router.post("/infragen/generate", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { description, projectType } = req.body as { description: string; projectType?: string };
  if (!description) return void res.status(400).json({ error: "description required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { send({ type: "error", content: "OPENAI_API_KEY not set" }); return void res.end(); }

  const client = new OpenAI({ apiKey });
  send({ type: "status", content: "Generating infrastructure configuration..." });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: `You are an expert DevOps engineer that generates production-ready infrastructure configurations.

Given a user's description of their application, generate a complete infrastructure spec as JSON with these sections:
1. container (required): { base, build: string[], run, env: {}, ports: number[], resources: { cpuLimit, memoryMb, timeoutSecs } }
2. scaling (required): { minInstances, maxInstances, targetCpuPercent, cooldownSecs }
3. routing (required): { protocol, healthCheck, loadBalancing, regions: string[] }
4. monitoring (required): { alertCpuThreshold, alertMemoryThreshold, logLevel }
5. explanation: one-paragraph human-readable explanation of the choices

Return ONLY valid JSON. No markdown. No backticks.

Rules:
- node:20 for JS/TS, python:3.11 for Python, ubuntu:22.04 for others
- Include all necessary build steps
- Set appropriate resource limits (don't over-provision)
- Choose regions based on latency requirements
- Set health check path appropriately`,
        },
        {
          role: "user",
          content: `Generate infrastructure config for: ${description}${projectType ? `\nProject type: ${projectType}` : ""}`,
        },
      ],
    });

    let buffer = "";
    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      buffer += delta;
      if (delta) send({ type: "stream", content: delta });
    }

    send({ type: "parsing", content: "Parsing and validating configuration..." });

    let parsed: Record<string, unknown> = {};
    try {
      const jsonMatch = buffer.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      send({ type: "error", content: "Could not parse generated JSON. Try a more specific description." });
      return void res.end();
    }

    send({ type: "done", config: parsed });
  } catch (err: any) {
    send({ type: "error", content: err.message });
  }
  res.end();
});

// POST /infragen/validate — validate a config object
router.post("/infragen/validate", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { config } = req.body as { config: Record<string, unknown> };
  if (!config) return void res.status(400).json({ error: "config required" });

  const errors: string[] = [];
  const warnings: string[] = [];

  const container = config.container as any;
  if (!container) errors.push("container section is required");
  else {
    if (!container.base) errors.push("container.base is required");
    if (!Array.isArray(container.build)) errors.push("container.build must be an array");
    if (!container.run) errors.push("container.run is required");
    if (container.resources?.memoryMb > 4096) warnings.push("High memory allocation — consider reducing if possible");
    if (container.resources?.cpuLimit > 4) warnings.push("High CPU limit — consider reducing");
    if (!container.ports?.length) warnings.push("No ports exposed — ensure this is intentional for background workers");
  }

  const scaling = config.scaling as any;
  if (!scaling) warnings.push("No scaling config — defaults will be used");
  else {
    if (scaling.maxInstances < scaling.minInstances) errors.push("maxInstances must be >= minInstances");
    if (scaling.targetCpuPercent > 90) warnings.push("Target CPU >90% may cause instability");
  }

  res.json({ valid: errors.length === 0, errors, warnings });
});

export default router;
