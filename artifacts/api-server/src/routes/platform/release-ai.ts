import { Router } from "express";
import OpenAI from "openai";

const router = Router();

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured.");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

async function streamCompletion(
  res: any,
  systemPrompt: string,
  userMessage: string
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const stream = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) send({ content: delta });
    }

    send({ done: true });
  } catch (err: any) {
    send({ error: err.message });
  }

  res.end();
}

// POST /api/deploy/ai/plan — analyze risk, suggest strategy
router.post("/deploy/ai/plan", async (req, res) => {
  const { projectId, diffSummary, environments, changeCount, currentVersion } = req.body as {
    projectId?: string;
    diffSummary?: string;
    environments?: string[];
    changeCount?: number;
    currentVersion?: string;
  };

  const system = `You are a senior DevOps engineer and release manager. Analyze deployment scenarios and provide clear, actionable release plans. Format responses with markdown. Be concise and specific.`;

  const user = `Analyze this upcoming release and produce a deployment plan:

Project: ${projectId ?? "unknown"}
Current version: ${currentVersion ?? "unknown"}
Changed files: ${changeCount ?? "unknown"}
Target environments: ${(environments ?? ["production"]).join(", ")}
${diffSummary ? `\nChange summary:\n${diffSummary}` : ""}

Provide:
1. **Risk Assessment** (Low/Medium/High) with reasons
2. **Recommended Strategy** (standard/blue-green/canary) with justification
3. **Rollout Plan** step by step
4. **Rollback Triggers** — what metrics/errors should trigger a rollback
5. **Estimated deployment window**`;

  await streamCompletion(res, system, user);
});

// POST /api/deploy/ai/summary — summarize a release
router.post("/deploy/ai/summary", async (req, res) => {
  const { commits, diffStats, version, projectId } = req.body as {
    commits?: string[];
    diffStats?: { filesChanged: number; additions: number; deletions: number };
    version?: string;
    projectId?: string;
  };

  const system = `You are a technical writer creating release notes. Write clear, professional summaries for engineering and product audiences. Use markdown.`;

  const user = `Generate a release summary for:

Project: ${projectId ?? "unknown"}
Version: ${version ?? "unknown"}
${diffStats ? `Files changed: ${diffStats.filesChanged}, +${diffStats.additions} / -${diffStats.deletions} lines` : ""}
${commits?.length ? `\nCommits:\n${commits.map(c => `- ${c}`).join("\n")}` : ""}

Write:
1. **What Changed** — user-facing feature summary
2. **Technical Changes** — engineering details
3. **Breaking Changes** — if any
4. **Migration Steps** — if needed`;

  await streamCompletion(res, system, user);
});

// POST /api/deploy/ai/incident-help — generate incident response
router.post("/deploy/ai/incident-help", async (req, res) => {
  const { errorMessage, logs, service, environment, deployedVersion } = req.body as {
    errorMessage?: string;
    logs?: string[];
    service?: string;
    environment?: string;
    deployedVersion?: string;
  };

  const system = `You are an incident response expert (SRE). Analyze production incidents, identify root causes, and give concrete immediate actions. Be direct and actionable. Format with markdown. Prioritize: contain → diagnose → fix → prevent.`;

  const user = `INCIDENT ALERT — help needed immediately.

Service: ${service ?? "unknown"}
Environment: ${environment ?? "production"}
Deployed version: ${deployedVersion ?? "unknown"}
Error: ${errorMessage ?? "Unknown error"}
${logs?.length ? `\nRecent logs:\n${logs.slice(-20).join("\n")}` : ""}

Provide:
1. **Immediate Actions** (do these NOW)
2. **Root Cause Hypothesis** 
3. **Diagnosis Steps** — how to confirm root cause
4. **Fix Options** — with pros/cons of each
5. **Should we rollback?** — direct yes/no recommendation with reason
6. **Prevention** — how to prevent this class of issue`;

  await streamCompletion(res, system, user);
});

// POST /api/deploy/ai/branch-name — suggest branch name from description
router.post("/deploy/ai/branch-name", async (req, res) => {
  const { description } = req.body as { description: string };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Suggest 3 git branch names following conventional branch naming (feature/, fix/, chore/, release/). Return ONLY a JSON array of strings, no explanation.",
        },
        { role: "user", content: `Description: ${description}` },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "[]";
    try {
      const names = JSON.parse(text.match(/\[.*\]/s)?.[0] ?? "[]");
      send({ suggestions: names });
    } catch {
      send({ suggestions: [text.trim()] });
    }
    send({ done: true });
  } catch (err: any) {
    send({ error: err.message });
  }

  res.end();
});

// POST /api/deploy/ai/healthcheck-config — generate health check config
router.post("/deploy/ai/healthcheck-config", async (req, res) => {
  const { projectType, framework, endpoints } = req.body as {
    projectType?: string;
    framework?: string;
    endpoints?: string[];
  };

  const system = `You are a DevOps engineer. Generate production-ready health check configurations. Return JSON only.`;

  const user = `Generate a health check config for:
Project type: ${projectType ?? "node"}
Framework: ${framework ?? "express"}
Endpoints: ${endpoints?.join(", ") ?? "/"}

Return JSON with: { httpChecks, customScripts, alertThresholds }`;

  await streamCompletion(res, system, user);
});

export default router;
