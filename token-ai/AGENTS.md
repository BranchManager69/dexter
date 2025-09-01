# Repository Guidelines

## Project Structure & Module Organization
- Source: `index.js` (agent CLI), `server.js` (live UI runner), `core/*` (tools, prompts, formatting), `agents/*` (state, memory, market), `socials/*` (orchestrator + providers), `prompts/*` (knowledge modules), `public/*` (dashboard/live pages), `reports/*` (JSON outputs), `scripts/*` (dev utilities).
- External deps: expects parent monorepo files like `../config/prisma.js` and `../utils/*`. This folder is synced as a subtree; keep paths stable.

## Build, Test, and Development Commands
- Install browsers: `npx playwright install`
- Run agent: `node index.js <MINT> --web-search --ohlcv --fast-ohlcv=birdeye`
  - Writes to `reports/ai-token-analyses/`
- Run socials orchestrator: `node socials/orchestrator.js <MINT> --steps=market,website,telegram,x --x-concurrency=1`
  - Emits `REPORT_FILE:/abs/path.json`
- Live UI: `node server.js --port 3013` → visit `/agent-live.html` or `/agent-dashboard.html`
- Prompt debug: `node scripts/check-prompts.js --domain=knowledge-base --voice=trencher`

## Coding Style & Naming Conventions
- Language: Node.js 18+, ESM-first (`import`/`export`). Mixed `.js` and `.mjs` where appropriate.
- Indentation: 2 spaces; include semicolons; prefer small, pure functions.
- Names: lowerCamelCase for vars/functions, UPPER_SNAKE_CASE for constants, kebab/underscore file names (e.g., `exec-tools.js`).
- Keep module boundaries: `core/*` = reusable primitives; `agents/*` = stateful logic; `socials/*` = IO-heavy orchestration.

## Testing Guidelines
- No formal test runner; use ad‑hoc scripts:
  - `node agents/test-market.mjs`, `node agents/test-memory.mjs`, `node socials/tools/test-ohlcv.mjs`
- Prefer deterministic inputs and log minimal, structured output. Save artifacts under `reports/`.
- Add new smoke tests as `test-*.mjs` near the code under test.

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits when possible (e.g., `feat(core): add birdeye fast path`, `fix(agent): handle missing OHLCV`). Imperative mood, present tense.
- PRs must include:
  - What/why summary and linked issue (if any)
  - Steps to reproduce/verify (commands), expected output (e.g., `REPORT_FILE:` path)
  - Screenshots for UI changes (`public/*`) or short logs for agent runs
  - Notes on configuration/env changes (`.env.example` updates if needed)

## Security & Config Tips
- Copy `.env.example` and keep secrets local. Do not commit API keys or Playwright/X session files.
- Avoid committing Telegram `.session` artifacts; ensure sessions and media caches are gitignored.
- Networked tools respect provider limits; prefer `--x-concurrency=1–2` to reduce bans.

## PM2 + Monorepo Deployment
- Ecosystem file: lives one level up at `../ecosystem.config.cjs` (gitignored by design). This subrepo is a subtree of the parent monorepo.
- Managed processes (relevant to `token-ai/`):
  - `ai-ui`: runs `token-ai/server.js` (dashboard/live UI). Port via `TOKEN_AI_UI_PORT` (default 3013). Env also sets `TOKEN_AI_MAX_CONCURRENCY`, `TOKEN_AI_LOGS_PER_RUN_LIMIT`, `TOKEN_AI_CHILD_MAX_MB`, `TOKEN_AI_BROADCAST_CHILD_LOGS`, `TOKEN_AI_EVENTS_TOKEN`.
  - `tg-daemon`: runs `token-ai/socials/telegram/session-daemon.js` (SOCKS5 MTProto helper for Telegram tooling).
  - `token-ai-mcp-http`: runs `token-ai/mcp/http-server.mjs` (full MCP tool server over HTTP/WS). Port via `TOKEN_AI_MCP_PORT` (default 3928).
  - `token-ai-mcp-stdio`: runs `token-ai/mcp/server.mjs` (stdio MCP, rarely needed under PM2).
  - Optional (not running by default): `mcp/http-server-chatgpt.mjs` exposes a minimal SSE‑style endpoint for ChatGPT. If you need it, run it under a separate name/port (e.g., `token-ai-mcp-http-sse` on 3929) to avoid clashing with the main server.
- Parent working directory: PM2 `cwd` is the monorepo root; scripts reference `token-ai/...` paths. External deps like `../config/prisma.js` resolve from the parent.
- Common PM2 commands:
  - Reload UI: `pm2 reload ai-ui`
  - Restart with env updates: `pm2 restart ai-ui --update-env`
  - Telegram daemon: `pm2 restart tg-daemon --update-env`
  - MCP HTTP: `pm2 restart token-ai-mcp-http --update-env`
  - Inspect: `pm2 status`, `pm2 logs <name> --lines 100`, `pm2 jlist`
- Local vs PM2: `node server.js` is fine for ad‑hoc runs; production is PM2‑managed—use the commands above instead of invoking Node directly.
- Assistant visibility note: automated tools in this folder cannot see PM2 state or the parent ecosystem file unless explicitly referenced; that file is outside this subtree. Operational guidance is captured here for clarity.

## Events, WebSocket, and Runner API

These interfaces are stable and UI-agnostic so they can be relied on by dashboards, CLIs, or other services.

### WebSocket Stream
- Path: `/ws` (same-origin). Use `wss://` when served over HTTPS.
- Envelope: `{ type: 'DATA', topic: 'terminal', subtype: 'ai_session'|'runner', event: string, data: object, timestamp?: string }`.
- Subtypes:
  - `ai_session`: real-time agent lifecycle and metrics.
  - `runner`: server child-process lifecycle.
- Notes: Clients often send `{ type: 'SUBSCRIBE', topic: 'terminal' }` on open, but the server currently broadcasts to all clients; no per-subscription routing.

### Agent Event Taxonomy (ai_session)
- `agent:session_start`: `{ mint, started_at, model }` → session opened.
- `agent:status`: `{ text }` → phase hints: `llm_round1_start`, `finalize_round_start`, `finalize_stream_completed`.
- `agent:tool_call` / `agent:tool_result`: `{ name, elapsed_ms? }` → tool lifecycle; market step toggles around OHLCV tools.
- `agent:partial_output`: `{ text }` → streamed assistant text.
- `agent:error`: `{ text }` → error emitted by agent/tool.
- `agent:final_json`: `{ file?, data }` → final analysis JSON; includes Branch/Risk scores and `metadata.market` snapshot.
- `process:step_start` / `process:step_end`: `{ step, elapsed_ms? }` → timeline state.
- `process:status` / `process:rationale` / `process:signal` / `process:source`: concise progress, why-notes, signals, and cited sources.
- `metrics:update`: `{ fdv, liquidity, volume24h }` → market badges.
- `agent:session_end`: `{ ok, branchScore?, riskScore? }` → session closed.

### Events Ingest HTTP API
- POST `/events` with JSON body `{ event, data }`.
- Security:
  - Local callers (127.0.0.1/::1) are always allowed.
  - For remote callers, set `TOKEN_AI_EVENTS_TOKEN`; then require header `x-agent-token: <token>`.
  - If `TOKEN_AI_EVENTS_TOKEN` is not set, remote access is effectively open; do not expose publicly without a token or proxy ACLs.
- Agent integration: set `TOKEN_AI_EVENTS_URL=http://localhost:<PORT>/events` for CLI runs; the Live Terminal runner injects this automatically when starting children.

### Runner API
- POST `/run` → `{ mint }` spawns `node index.js <mint>` with `TOKEN_AI_EVENTS_URL` injected.
- GET `/runs` → `{ ok, active: [{ pid, mint, startedAt }], limit }`.
- GET `/runs/:pid/logs` → `{ ok, pid, mint, logs: [{ stream, line, at }] }` (bounded by `TOKEN_AI_LOGS_PER_RUN_LIMIT`).
- DELETE `/runs/:pid` → `{ ok }` terminates the child (SIGTERM then SIGKILL fallback).

### Reports APIs
- GET `/recent-analyses?limit=12` → `{ ok, items: [{ mint, branchScore, riskScore, duration_ms, file, mtime }] }` from `reports/ai-token-analyses/`.
- GET `/latest-analysis` → `{ ok, file, mtime, data }` for the most recent analysis JSON.

### Relevant Environment Variables
- Server/UI: `TOKEN_AI_UI_PORT` (default 3013), override port via `--port` CLI flag.
- Events: `TOKEN_AI_EVENTS_TOKEN` (header `x-agent-token`); `TOKEN_AI_EVENTS_URL` (agent posts target).
- Runner limits: `TOKEN_AI_MAX_CONCURRENCY` (default 3), `TOKEN_AI_CHILD_MAX_MB` (default 1024), `TOKEN_AI_LOGS_PER_RUN_LIMIT` (default 200), `TOKEN_AI_BROADCAST_CHILD_LOGS=1` to broadcast child logs over WS.

### Security Notes
- Do not expose `/run` publicly without auth/rate limiting; consider proxy auth or IP allowlists.
- Always set `TOKEN_AI_EVENTS_TOKEN` if `/events` is reachable from outside localhost.
