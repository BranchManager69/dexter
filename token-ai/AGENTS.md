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

## Systemd Deployment (Dexter)
- Services: `dexter-ui` (UI/API/WS) and `dexter-mcp` (MCP HTTP)
- Start/Stop/Restart: `sudo systemctl start|stop|restart dexter-ui dexter-mcp`
- Status: `systemctl status dexter-ui` / `systemctl status dexter-mcp`
- Logs: `sudo journalctl -u dexter-ui -f` / `sudo journalctl -u dexter-mcp -f`
- Notes: Production runs under systemd. Local ad‑hoc runs via `node server.js` are fine for development.

Important
- Use systemd only in prod. Do not use pm2 for `dexter-ui` or `dexter-mcp`.
- Default ports: UI `3017`, MCP `3930`.
- After client‑side Realtime code changes, restart both services and hard‑refresh the browser to load updated assets.

## Realtime Voice Agent
- Response gating: the client queues `response.create` to prevent `conversation_already_has_active_response`. One response at a time; queued items flush on `response.done`/`response.completed`.
- MCP‑first tools: the session registers the MCP server and suppresses overlapping local function tools so trading calls execute via MCP (avoids local `unknown_tool` loops).
- Tool output wiring: the client only emits `function_call_output` for active local tools. MCP calls are executed server‑side and summarized in the debug panel.
- Debug panel: the “Tools” overlay opens below the Voice Debug header so it never covers the Voice HUD.

## MCP Tooling Semantics
- list_managed_wallets: zero‑input list of the current user’s wallets.
  - Optional filters: `search` (partial label or key prefix/suffix), `limit`, `offset`.
  - If `search` is an empty string, the bridge normalizes it to “no filter”.
- Trading tools (execute_buy / execute_sell / previews): routed to MCP; UI does not execute these locally.
- SSE compatibility: the bridge parses SSE `data:` frames from MCP; JSON parsing errors like `mcp_bad_json` should not occur in normal operation.

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
