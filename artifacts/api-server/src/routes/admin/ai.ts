import { Router } from "express";
import OpenAI from "openai";
import { requireAdmin, getAuditLog } from "./index";
import { deployments } from "../platform/deploy";

const router = Router();

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

async function streamText(res: any, system: string, user: string) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (d: object) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(d)}\n\n`); };

  try {
    const stream = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
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

// POST /api/admin/ai/summary — system health summary
router.post("/admin/ai/summary", requireAdmin("auditor"), async (req, res) => {
  const deployList = Array.from(deployments.entries()).map(([id, d]) => `${id}: ${d.status}`);
  const recentAudit = getAuditLog({ limit: 10 }).map(e => `${e.timestamp} [${e.adminUserId}] ${e.action}`);

  const system = `You are an AI system health analyst for a cloud IDE platform. Provide clear, concise summaries for admin users. Use markdown formatting.`;
  const user = `Analyze the current platform state and provide a health summary:

Active deployments: ${deployList.length}
Deployment statuses: ${JSON.stringify(deployList.slice(0, 10))}
Recent admin actions (last 10):
${recentAudit.join("\n")}

${req.body?.extra ? `Additional context: ${req.body.extra}` : ""}

Provide:
1. **System Health Status** (overall: healthy/degraded/critical)
2. **Key Metrics Summary** 
3. **Anomalies Detected** (if any)
4. **Recommended Actions**
5. **Trend Analysis** (based on patterns)`;

  await streamText(res, system, user);
});

// POST /api/admin/ai/suggestions — actionable suggestions
router.post("/admin/ai/suggestions", requireAdmin("support"), async (req, res) => {
  const { context } = req.body as { context?: string };
  const failedDeploys = Array.from(deployments.values()).filter(d => d.status === "failed").length;
  const runningDeploys = Array.from(deployments.values()).filter(d => d.status === "running").length;
  const recentErrors = getAuditLog({ action: "error", limit: 5 });

  const system = `You are an AI operations advisor for a cloud IDE platform. Give specific, actionable suggestions in bullet points. Format with markdown. Be direct and practical.`;
  const user = `Provide operational suggestions for the platform:

Failed deployments: ${failedDeploys}
Running deployments: ${runningDeploys}
Total deployments tracked: ${deployments.size}
${context ? `Admin context: ${context}` : ""}

Give 5-7 specific, actionable suggestions to:
- Improve system reliability
- Reduce failed deployments  
- Optimize resource usage
- Address any security concerns
- Improve user experience

Each suggestion should include: **Action**, **Why**, **Expected Impact**.`;

  await streamText(res, system, user);
});

// POST /api/admin/ai/explain-logs — explain a block of logs
router.post("/admin/ai/explain-logs", requireAdmin("support"), async (req, res) => {
  const { logs, service } = req.body as { logs: string[]; service?: string };
  if (!logs?.length) { res.status(400).json({ error: "logs array required" }); return; }

  const system = `You are a senior SRE explaining system logs to an admin. Be concise, highlight the root cause first, then provide context.`;
  const user = `Explain these ${service ?? "system"} logs:

${logs.slice(0, 50).join("\n")}

Provide:
1. **What happened** (1-2 sentences)
2. **Root cause** 
3. **Severity** (Low/Medium/High/Critical)
4. **Immediate actions needed**`;

  await streamText(res, system, user);
});

// POST /api/admin/ai/analyze-user — analyze a user's behavior
router.post("/admin/ai/analyze-user", requireAdmin("admin"), async (req, res) => {
  const { userId, auditEntries, billingData } = req.body as {
    userId: string;
    auditEntries?: string[];
    billingData?: object;
  };

  const userAudit = getAuditLog({ userId, limit: 20 }).map(e => `${e.action} at ${e.timestamp}`);

  const system = `You are an AI trust & safety analyst for a cloud platform. Analyze user behavior patterns. Be objective and evidence-based.`;
  const user = `Analyze user ${userId}:

Admin-visible audit log (last 20):
${userAudit.join("\n") || "No admin actions recorded"}
${auditEntries?.length ? `\nUser activity:\n${auditEntries.join("\n")}` : ""}
${billingData ? `\nBilling data: ${JSON.stringify(billingData)}` : ""}

Provide:
1. **Risk Assessment** (Low/Medium/High)
2. **Usage Patterns** — normal or anomalous?
3. **Policy Concerns** — if any
4. **Recommended Action** — monitor/warn/suspend/clear`;

  await streamText(res, system, user);
});

export default router;
