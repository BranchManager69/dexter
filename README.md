# Dexter — OAuth‑Enabled Token‑AI MCP (dexter.cash)

![status](https://img.shields.io/badge/status-live-brightgreen)
![domain](https://img.shields.io/badge/domain-dexter.cash-1f6feb)
![node](https://img.shields.io/badge/node-20.x-026e00?logo=node.js&logoColor=white)
![process](https://img.shields.io/badge/process%20manager-PM2-2aa889)
![proxy](https://img.shields.io/badge/reverse%20proxy-NGINX%2BTLS-009639?logo=nginx&logoColor=white)
![mcp](https://img.shields.io/badge/MCP-Streamable%20HTTP-8A2BE2)

A standalone deployment of the Token‑AI UI + Analyzer + OAuth‑enabled MCP stack, rebranded as Dexter. This repo is decoupled from Clanka and runs under PM2 with NGINX and TLS.

Use this README for day‑to‑day ops. It supersedes any old systemd‑based notes.

Quick links: [Live UI](https://dexter.cash/agent-live.html) · [Dashboard](https://dexter.cash/agent-dashboard.html) · [MCP Health](https://dexter.cash/mcp/health)

## Contents
- What’s here
- Local Replication Quickstart
- Environment & Ports
- Operating (PM2)
- Database (Prisma → Supabase)
- Public Deployment Checklist
- Updating & Deploying
- Logs & Debugging
- MCP endpoints
- MCP toolsets & trading
- PM2 usage
- Troubleshooting

## What’s Here
- UI/API/WS: `token-ai/server.js` serves the live UI, analyzer API, events, and WS.
- MCP HTTP: `alpha/dexter-mcp/http-server-oauth.mjs` (proxied at `/mcp`).
- Static UI: `public/` at repo root.
- Reports & logs: `token-ai/reports/*` and `logs/`.
- Docs: `OPERATIONS.md` (runnable details), `AGENTS.md` (internal notes).

## Local Replication Quickstart
- Install dependencies
  - `npm ci && (cd token-ai && npm ci)`
- Create env and copy to backend
  - `cp .env token-ai/.env`
- Minimal `.env` example (root)

  ```env
  OPENAI_API_KEY=sk-...
  # Optional for fast OHLCV
  BIRDEYE_API_KEY=...

  # Dev/demo mode (simplifies local auth)
  TOKEN_AI_DEMO_MODE=1

  # Optional: Supabase browser auth for the UI
  SUPABASE_URL=https://<project>.supabase.co
  SUPABASE_ANON_KEY=<anon-key>

  # Optional: Postgres for persistence/trading (temporary – Prisma)
  DATABASE_URL=postgresql://user:pass@localhost:5432/dexter
  ```

  Prefer copying from `env.example` if present: `cp env.example .env`

- First‑time browser install (Chromium only)
  - `cd token-ai && npx playwright install chromium`
- Start the UI/API/WS
  - `npm run start` (defaults to port `3013`)
  - or `npm run start:ui` (defaults to port `3017`; override via `TOKEN_AI_UI_PORT`)
- Optional: Start MCP HTTP with OAuth (local)
  - `npm run mcp:http:oauth` (defaults to `3930`; override via `TOKEN_AI_MCP_PORT`)
- Open locally
  - UI: `http://127.0.0.1:<port>/agent-live.html`
  - Dashboard: `http://127.0.0.1:<port>/agent-dashboard.html`
  - MCP Health: `http://127.0.0.1:<mcpPort>/mcp/health`

See `AGENTS.md` for contributor guidelines and coding conventions.

## Environment & Ports
- Authoritative env lives at repo root `.env`; copy to backend: `cp .env token-ai/.env`.
- UI/API/WS port
  - Local default: `3013` (`npm run start`)
  - Alt script default: `3017` (`npm run start:ui` or set `TOKEN_AI_UI_PORT`)
  - Production (PM2): `3017`
- MCP HTTP port
  - Local default: `3930` (`npm run mcp:http:oauth`)
  - Production (PM2): `3930` (proxied at `/mcp`)
- Browser UI auth
  - Optional Supabase: set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to enable magic‑link login.
  - For localhost, `TOKEN_AI_DEMO_MODE=1` provides a frictionless path without an external IdP.

## Operating (PM2)
- Apps (see `alpha/ecosystem.config.cjs`)
  - `dexter-api`: API on port `3030` (default)
  - `dexter-fe`: Next.js frontend on `DEXTER_FE_PORT` (default 43017)
  - `dexter-mcp`: MCP HTTP on `TOKEN_AI_MCP_PORT` (default 3930)
- Build (first time or after changes)
  - `cd alpha/dexter-api && npm ci && npm run build`
  - `cd alpha/dexter-fe && npm ci && npm run build`
- Start / Status / Logs
  - `pm2 start alpha/ecosystem.config.cjs --only dexter-api,dexter-fe,dexter-mcp`
  - `pm2 status`
  - `pm2 logs dexter-api` (or `dexter-fe`, `dexter-mcp`)
- Restart / Stop / Save
  - `pm2 restart dexter-api dexter-fe dexter-mcp`
  - `pm2 stop dexter-api dexter-fe dexter-mcp`
  - `pm2 save` (persist across reboots; run `pm2 startup` once and follow instructions)
- NGINX
  - Config: `/etc/nginx/sites-available/dexter.cash` (enabled)
  - Reload: `sudo nginx -t && sudo nginx -s reload`
  - Static HTML cache-busting: HTML is auto‑stamped on deploy so JS loads fresh.
    - The UI service runs a pre‑start stamper that writes `?v=<version>` tokens to public HTML.

## CLI Shortcuts (npm)
- Health
  - `npm run ok` → prints one line: `UI:OK | MCP:OK` (or DOWN)
- Route smoke tests
  - `npm run r` → server routes smoke test (JSON)
  - `npm run rt` → same with 60s timeout
- MCP tests
  - `npm run mcp:local` → quick MCP client test at `http://localhost:3930/mcp`
  - `npm run mcp:prod` → quick MCP client test at `https://dexter.cash/mcp`
- Services (PM2)
  - `pm2 status`
  - `pm2 restart dexter-api dexter-fe dexter-mcp`
  - `pm2 logs dexter-mcp`

Notes
- `npm run mcp` starts the stdio MCP server (no port) and is not used in production.

## Database (Prisma → Supabase)
- We’re migrating to Supabase to simplify onboarding. Until then, Postgres via Prisma backs persistence/trading features.
- Running without a DB
  - For UI + basic analysis, you can skip DB setup. Set `TOKEN_AI_DEMO_MODE=1`. Artifacts are written to `token-ai/reports/` and `token-ai/socials/reports/`.
- Enabling DB‑backed features now (temporary)
  - Set `DATABASE_URL` in `.env` (local Postgres or your Supabase Postgres URL)
  - Generate client: `npx prisma generate`
  - Apply schema: `npx prisma migrate deploy` (or `npx prisma db push` for dev)
  - Optional seed: `node prisma/seed.js` (or `ts-node prisma/seed.ts`)
- Supabase path
  - You can already point `DATABASE_URL` to Supabase today for Postgres. UI auth also supports `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Updating & Deploying
- Pull changes
  - `cd ~/websites/dexter && git pull`
- Install deps
  - Root: `npm ci`
  - Backend: `(cd token-ai && npm ci)`
- Apply env updates
  - `cp .env token-ai/.env`
- Restart services
  - `pm2 restart dexter-api dexter-fe dexter-mcp && pm2 save`

## Public Deployment Checklist
- Domain + TLS
  - NGINX reverse proxy with TLS and HTTP→HTTPS redirect
  - Proxy `/mcp` and expose `/.well-known/*` for OAuth metadata
- Processes
  - PM2 apps using `alpha/ecosystem.config.cjs` (`dexter-api`, `dexter-fe`, `dexter-mcp`)
- Secrets & Env
  - Set `OPENAI_API_KEY`, `TOKEN_AI_MCP_TOKEN`, and (optional) `SUPABASE_URL`/`SUPABASE_ANON_KEY`
  - Configure OIDC endpoints if not using `TOKEN_AI_DEMO_MODE`
- Hardening
  - Limit CORS (`TOKEN_AI_MCP_CORS`) to your origin
  - Ensure `/mcp-proxy` requires `?userToken` and injects bearer server‑side only
  - Rotate tokens regularly; never expose private keys/logs

## Logs & Debugging
- PM2 logs
  - `pm2 logs dexter-api`
  - `pm2 logs dexter-fe`
  - `pm2 logs dexter-mcp`
- Browser automation
  - Playwright smoke: `cd token-ai && node -e "(async()=>{const {chromium}=await import('playwright');const b=await chromium.launch();await b.close();console.log('ok')})()"`
- UI events & child logs
  - Child analyzer logs stream to the UI when `TOKEN_AI_BROADCAST_CHILD_LOGS=1` (default in unit file).

## MCP endpoints
- Public base (proxied): `https://dexter.cash/mcp`
- Health: `GET /mcp/health` → basic JSON status (issuer, oauth, sessions)
- OAuth OIDC metadata: `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`
- Stream check: `GET /mcp` with `Accept: text/event-stream` should return 200 and stream events

## MCP toolsets & trading
- Scope tools to reduce context size and improve reliability.
- Global (env):
  - `TOKEN_AI_MCP_TOOLSETS=all` (default) or CSV of `wallet,program,runs,reports,voice,web,trading`.
- Per-session (HTTP): initialize with `POST /mcp?tools=reports,web`.
- Through UI proxy: `/mcp-proxy?tools=…&userToken=…`.
- Details: see `alpha/dexter-mcp/README.md` → Toolset Scoping.

## PM2 usage
- Start all: `pm2 start alpha/ecosystem.config.cjs`
- Start subset: `pm2 start alpha/ecosystem.config.cjs --only dexter-mcp`
- Show: `pm2 status`
- Logs: `pm2 logs <name>`
- Persist: `pm2 save` (after `pm2 startup` once)

## Troubleshooting
- UI shows stale env
  - Hard refresh, then `curl -s https://dexter.cash/agent-env.js?v=1`
  - Confirm `TOKEN_AI_MCP_URL` points to `http://127.0.0.1:3930/mcp`
  - `pm2 restart dexter-api dexter-fe dexter-mcp && pm2 save`
- WebSocket issues
  - Verify NGINX routes `/ws` to `127.0.0.1:3017` and that `dexter-ui` is active.
- MCP OAuth errors
  - Check `pm2 logs dexter-mcp` and visit `/.well-known/openid-configuration`.
- Playwright missing libs
  - Error mentions system libraries: install runtime deps, then `npx playwright install chromium` again.
- Port conflicts
  - `ss -tulpen | rg '3017|3930'`

---

See `OPERATIONS.md` for PM2 ecosystem config details and deeper operational notes.
