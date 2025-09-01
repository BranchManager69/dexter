# Dexter — OAuth‑Enabled Token‑AI MCP (dexter.cash)

![status](https://img.shields.io/badge/status-live-brightgreen)
![domain](https://img.shields.io/badge/domain-dexter.cash-1f6feb)
![node](https://img.shields.io/badge/node-20.x-026e00?logo=node.js&logoColor=white)
![process](https://img.shields.io/badge/process%20manager-systemd-2aa889)
![proxy](https://img.shields.io/badge/reverse%20proxy-NGINX%2BTLS-009639?logo=nginx&logoColor=white)
![mcp](https://img.shields.io/badge/MCP-Streamable%20HTTP-8A2BE2)

A standalone deployment of the Token‑AI UI + Analyzer + OAuth‑enabled MCP stack, rebranded as Dexter. This repo is decoupled from Clanka and runs under systemd with NGINX and TLS.

Use this README for day‑to‑day ops. It supersedes any old PM2‑based notes.

Quick links: [Live UI](https://dexter.cash/agent-live.html) · [Dashboard](https://dexter.cash/agent-dashboard.html) · [MCP Health](https://dexter.cash/mcp/health)

## Contents
- What’s here
- Quickstart
- Operating (systemd)
- Updating & Deploying
- Logs & Debugging
- MCP endpoints
- PM2 → systemd differences
- Troubleshooting

## What’s Here
- UI/API/WS: `token-ai/server.js` serves the live UI, analyzer API, events, and WS.
- MCP HTTP: `token-ai/mcp/http-server-oauth.mjs` (proxied at `/mcp`).
- Static UI: `public/` at repo root.
- Reports & logs: `token-ai/reports/*` and `logs/`.
- Docs: `OPERATIONS.md` (runnable details), `AGENTS.md` (internal notes).

## Quickstart
- Paths
  - Repo root: `~/websites/dexter`
  - Backend: `~/websites/dexter/token-ai`
- Env
  - Authoritative: `~/websites/dexter/.env`
  - Backend copy: `~/websites/dexter/token-ai/.env`
  - After edits, copy root → backend: `cp .env token-ai/.env` then restart services.
- First‑time browser install (Chromium only):
  - `cd token-ai && npx playwright install chromium`
- Health checks (HTTPS via NGINX)
  - UI: `https://dexter.cash/agent-live.html`
  - Dashboard: `https://dexter.cash/agent-dashboard.html`
  - MCP: `https://dexter.cash/mcp/health`

## Operating (systemd)
- Services
  - `dexter-ui`: UI/API/WS on port `3017`
  - `dexter-mcp`: MCP HTTP on port `3930`
- Start/Stop/Restart
  - `sudo systemctl start|stop|restart dexter-ui dexter-mcp`
  - Enable at boot: `sudo systemctl enable dexter-ui dexter-mcp`
  - Disable: `sudo systemctl disable dexter-ui dexter-mcp`
- Status
  - `systemctl status dexter-ui`
  - `systemctl status dexter-mcp`
- NGINX
  - Config: `/etc/nginx/sites-available/dexter.cash` (enabled)
  - Reload: `sudo nginx -t && sudo systemctl reload nginx`

## Updating & Deploying
- Pull changes
  - `cd ~/websites/dexter && git pull`
- Install deps
  - Root: `npm ci`
  - Backend: `(cd token-ai && npm ci)`
- Apply env updates
  - `cp .env token-ai/.env`
- Restart services
  - `sudo systemctl restart dexter-ui dexter-mcp`

## Logs & Debugging
- Journald (live)
  - UI: `sudo journalctl -u dexter-ui -f`
  - MCP: `sudo journalctl -u dexter-mcp -f`
- Recent window
  - `sudo journalctl -u dexter-ui --since "1 hour ago"`
- Browser automation
  - Playwright smoke: `cd token-ai && node -e "(async()=>{const {chromium}=await import('playwright');const b=await chromium.launch();await b.close();console.log('ok')})()"`
- UI events & child logs
  - Child analyzer logs stream to the UI when `TOKEN_AI_BROADCAST_CHILD_LOGS=1` (default in unit file).

## MCP endpoints
- Public base (proxied): `https://dexter.cash/mcp`
- Health: `GET /mcp/health`
- OAuth OIDC docs: `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`

## PM2 → systemd differences
- Process manager
  - Before: `pm2 start ai-ui`, `pm2 restart ai-ui`, `pm2 logs ai-ui`.
  - Now: `systemctl start|restart dexter-ui`, `journalctl -u dexter-ui -f`.
- Multiple services
  - UI/API/WS (`dexter-ui`) and MCP (`dexter-mcp`) are separate units.
- Env changes
  - Edit `.env` at repo root, copy to `token-ai/.env`, restart services.
- Cleanup old PM2 app (one‑time)
  - `pm2 list`
  - `pm2 stop ai-ui && pm2 delete ai-ui && pm2 save`

## Troubleshooting
- UI shows stale env
  - Hard refresh, then `curl -s https://dexter.cash/agent-env.js?v=1`
  - Confirm `TOKEN_AI_MCP_URL` points to `http://127.0.0.1:3930/mcp`
  - `sudo systemctl restart dexter-ui`
- WebSocket issues
  - Verify NGINX routes `/ws` to `127.0.0.1:3017` and that `dexter-ui` is active.
- MCP OAuth errors
  - Check `sudo journalctl -u dexter-mcp -f` and visit `/.well-known/openid-configuration`.
- Playwright missing libs
  - Error mentions system libraries: install runtime deps, then `npx playwright install chromium` again.
- Port conflicts
  - `ss -tulpen | rg '3017|3930'`

---

See `OPERATIONS.md` for exact unit templates and deeper operational notes.
