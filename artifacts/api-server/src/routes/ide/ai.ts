import { Router } from "express";
import OpenAI from "openai";
import { AiAssistBody } from "@workspace/api-zod";

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

function buildSystemPrompt(action: string): string {
  switch (action) {
    case "generate":
      return `You are an expert software engineer and code generator. When asked to generate code, produce clean, complete, working code with no placeholders or TODOs. Respond with ONLY the code — no explanation unless asked. Include comments where helpful.`;
    case "fix":
      return `You are an expert debugger. Analyze the provided code, identify bugs or errors, and return the FIXED code. Respond with ONLY the corrected code. If you make changes, add a brief comment explaining what was fixed.`;
    case "explain":
      return `You are an expert software engineer and teacher. Explain the provided code clearly and concisely. Use plain English. Describe what the code does, how it works, and any important concepts. Format your explanation with markdown.`;
    case "refactor":
      return `You are an expert software architect. Refactor the provided code to be cleaner, more maintainable, and follow best practices. Respond with ONLY the refactored code. Add comments explaining significant changes.`;
    default:
      return `You are an expert software engineer. Help the user with their code request.`;
  }
}

function buildUserMessage(action: string, code?: string | null, prompt?: string | null, language?: string | null, filename?: string | null): string {
  const lang = language ?? "code";
  const fileHint = filename ? ` (file: ${filename})` : "";

  switch (action) {
    case "generate":
      return `Generate ${lang} code${fileHint}: ${prompt ?? "a useful function"}`;
    case "fix":
      return `Fix the following ${lang} code${fileHint}:\n\n\`\`\`${lang}\n${code ?? ""}\n\`\`\`\n${prompt ? `\nAdditional context: ${prompt}` : ""}`;
    case "explain":
      return `Explain the following ${lang} code${fileHint}:\n\n\`\`\`${lang}\n${code ?? ""}\n\`\`\``;
    case "refactor":
      return `Refactor the following ${lang} code${fileHint}:\n\n\`\`\`${lang}\n${code ?? ""}\n\`\`\`\n${prompt ? `\nRefactoring goals: ${prompt}` : ""}`;
    default:
      return prompt ?? `Help me with this ${lang} code:\n\n${code ?? ""}`;
  }
}

// POST /api/ai — SSE streaming
router.post("/ai", async (req, res) => {
  const parsed = AiAssistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { action, code, prompt, language, filename } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const stream = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: buildSystemPrompt(action) },
        { role: "user", content: buildUserMessage(action, code, prompt, language, filename) },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        send({ content });
      }
    }

    send({ done: true });
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI request failed";
    req.log.error({ err }, "AI request failed");
    send({ error: message, done: true });
    res.end();
  }
});

export default router;
