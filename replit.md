# CloudIDE

A full-featured browser-based cloud IDE with Monaco Editor, multi-file explorer, live code execution, terminal, and AI code assistant.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/cloud-ide run dev` — run the frontend IDE (port 21471)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `OPENAI_API_KEY` — for AI assistant features

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Monaco Editor (CDN), Tailwind CSS, react-resizable-panels
- API: Express 5 with SSE streaming
- AI: OpenAI gpt-4o-mini (streamed via SSE)
- Code Execution: Node.js child_process.spawn (python3, node, bash)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `artifacts/cloud-ide/` — React+Vite frontend IDE
- `artifacts/api-server/src/routes/ide/fs.ts` — Filesystem routes (/fs/list, /fs/read, /fs/write, /fs/delete, /fs/rename, /fs/mkdir)
- `artifacts/api-server/src/routes/ide/run.ts` — Code execution route (/run) with SSE streaming
- `artifacts/api-server/src/routes/ide/ai.ts` — AI assistant route (/ai) with SSE streaming
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `ide-workspace/` — User's virtual filesystem (files stored here)

## Architecture decisions

- SSE streaming for both /run and /ai endpoints — real-time output without WebSockets
- Code runs in temp files via child_process.spawn, cleaned up after execution
- Filesystem sandboxed to `ide-workspace/` directory with path traversal prevention
- Monaco Editor loaded from CDN via AMD loader (not npm) to avoid bundle size issues
- No database — filesystem IS the persistence layer

## Product

Users get a full browser-based IDE with: Monaco editor (VS Code-quality), multi-file explorer with context menus, tabs for open files, live code execution for Python/Node/Bash with streaming output, interactive terminal, and an AI assistant with Generate/Fix/Explain/Refactor actions.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing OpenAPI spec, always run `pnpm --filter @workspace/api-spec run codegen` before editing routes
- ide-workspace/ directory is created automatically on first file list request
- Code execution timeout is 30 seconds per run
- OPENAI_API_KEY must be set as a secret for AI features to work

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
