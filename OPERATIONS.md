# Dexter Ops Runbook

This document captures how Dexter (rebrand of Clanka) is deployed and operated on this server. It’s the single place to remember ports, services, env, and common tasks. Prefer this over any old PM2-based notes.

## Overview
- Domain: `dexter.cash` (and `www.dexter.cash`)
- Backend/UI: Token-AI UI server (copied from Clanka), plus MCP HTTP server with OAuth
- Reverse proxy: NGINX with Let’s Encrypt
- Process manager: systemd (`dexter-ui`, `dexter-mcp`)
- Env: repo-root `.env` (authoritative) + `token-ai/.env` (real copy)

## Paths
- Repo root: `/home/branchmanager/websites/dexter`
- Static root: `/home/branchmanager/websites/dexter/public`
- Backend copy: `/home/branchmanager/websites/dexter/token-ai`
- NGINX site: `/etc/nginx/sites-available/dexter.cash` (enabled)
- Certs: `/etc/letsencrypt/live/dexter.cash/`
- Services:
  - UI: `/etc/systemd/system/dexter-ui.service`
  - MCP: `/etc/systemd/system/dexter-mcp.service`

## Ports
- UI server (Dexter): `3017` (HTTP, proxied by NGINX)
- MCP server (Dexter): `3930` (HTTP, proxied by NGINX)
- Note: Clanka ports remain 3013/3928; Dexter uses different ports to avoid impact.

## NGINX
- Static root: `/home/branchmanager/websites/dexter/public`
- Proxies → UI (`127.0.0.1:3017`):
  - `/ws`, `/events`, `/run`, `/runs`, `/recent-analyses`, `/latest-analysis`, `/realtime/`, `/agent-env.js`, `/ohlcv`, `/report-json`, `/report/...json`, `/mcp-proxy`
- Proxies → MCP (`127.0.0.1:3930`):
  - `/mcp`, `/mcp/`, `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration`
- TLS: certs provisioned via Certbot; HTTP→HTTPS redirect is on.
- CSP: allows `dexter.cash` and WS endpoints; includes OpenAI + Supabase.
- Cache control: `/agent-env.js` sets `no-store` and hides upstream cache headers.

## Services (systemd)
- `dexter-ui.service`
  - Exec: Node 20 runs `server.js --port 3017`
  - CWD: `/home/branchmanager/websites/dexter/token-ai`
  - Env:
    - `TOKEN_AI_UI_PORT=3017`
    - `TOKEN_AI_MCP_URL=http://127.0.0.1:3930/mcp`
    - `TOKEN_AI_BROADCAST_CHILD_LOGS=1`
    - `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `dexter-mcp.service`
  - Exec: Node 20 runs `alpha/dexter-mcp/http-server-oauth.mjs`
  - CWD: `/home/branchmanager/websites/dexter/alpha/dexter-mcp`
  - Env:
    - `TOKEN_AI_MCP_PORT=3930`
    - `TOKEN_AI_MCP_PUBLIC_URL=https://dexter.cash/mcp`

Common commands:
- `sudo systemctl restart dexter-ui dexter-mcp`
- `sudo systemctl status dexter-ui dexter-mcp`
- `journalctl -u dexter-ui -f` (tail logs)
- `sudo nginx -t && sudo systemctl reload nginx`

### Auto-Restarts (systemd .path watchers)
Enable automatic restarts when code or env files change (excludes `public/`).

- Install and enable watchers:
  - `sudo bash token-ai/scripts/install-systemd-watchers.sh`
- What it watches:
  - MCP: repo `.env`, `token-ai/.env`, `alpha/dexter-mcp/`, `alpha/dexter-mcp/tools/`, `alpha/dexter-mcp/common.mjs`
  - UI: repo `.env`, `token-ai/.env`, `token-ai/server.js`, `token-ai/server/`, `token-ai/core/`
- Notes:
  - Directory watches trigger on create/rename/delete (e.g., git pull/checkout). In‑place edits that don’t touch directory entries may not trigger.
  - Static `public/` is served directly from disk and doesn’t need a restart; purge cache if needed.

## Environment
- Authoritative env file: `~/websites/dexter/.env` (this repo)
- Local backend env: `~/websites/dexter/token-ai/.env` is a real copy kept in sync with the root `.env`.
  - After editing the root `.env`, copy it down: `cp ~/websites/dexter/.env ~/websites/dexter/token-ai/.env`
  - Then restart services to pick up changes: `sudo systemctl restart dexter-ui dexter-mcp`

### Decoupling notes
- Dexter now owns its env files. If any remaining symlinks exist to parent repos, replace them with real copies before further refactors.

## Cloudflare
- Recommended: use an API Token (not Global API Key) for purges.
  - Permissions: Zone.Zone (Read), Zone.Cache Purge (Edit)
  - Scope: `dexter.cash` zone only
- Purge `/agent-env.js` after env changes if the UI shows stale env.
- Current mitigation: we load `/agent-env.js?v=1` and set `no-store` on NGINX to bypass cache.

## GitHub
- Repo: `BranchManager69/dexter` (private)
- Remote: `origin https://github.com/BranchManager69/dexter.git`

## npm scripts (from repo root)
- UI/MCP
  - `npm run start:ui` → `node token-ai/server.js --port ${TOKEN_AI_UI_PORT:-3017}`
  - `npm run mcp` → `node alpha/dexter-mcp/server.mjs`
  - `npm run mcp:http` → `node alpha/dexter-mcp/http-server.mjs`
  - `npm run mcp:http:oauth` → `node alpha/dexter-mcp/http-server-oauth.mjs`
- MCP tools/tests
  - `npm run status` → `node token-ai/scripts/status.mjs`
  - `npm run test:mcp` → `node token-ai/scripts/test-mcp-all.mjs`
  - `npm run test:mcp:http` → `node token-ai/scripts/test-mcp-http.mjs`
  - Trading: `mcp:balances|buy|sell|trade`
  - Research: `mcp:search|fetch|crawl:site|crawl:urls|smart:fetch|note:*|finalize|run:quick`
- Voice smoke tests: `voice:smoke*`

## Troubleshooting
- UI not updating env:
  - Check `/agent-env.js?v=1` response; ensure `TOKEN_AI_MCP_URL` points to Dexter MCP (3930).
  - Restart `dexter-ui`: `sudo systemctl restart dexter-ui`.
- WebSocket issues:
  - Verify NGINX `/ws` proxies to `127.0.0.1:3017` and Cloudflare WS is enabled (it is by default).
- MCP auth flow:
  - `/.well-known/openid-configuration` should show issuer `https://dexter.cash/mcp`.
  - `dexter-mcp` logs: `journalctl -u dexter-mcp -f`.
- Port conflicts:
  - `ss -tulpen | rg 3017|3930` to see binders.

## Notes
- Clanka remains untouched and live on ports 3013/3928 and `clanka.win`.
- Dexter is a separate instance; NGINX routes dexter.cash to the new services.
- Reports read by Dexter UI are from the local token-ai copy, not Clanka.

## PM2 Cleanup (one-time)
- Stop and remove the old app if it’s still present:
  - `pm2 list`
  - `pm2 stop ai-ui && pm2 delete ai-ui`
  - `pm2 save`

## Service Unit Examples
Templates (use Node 20 path and replace placeholders):

`/etc/systemd/system/dexter-ui.service`
```
[Unit]
Description=Dexter UI Server (token-ai server.js)
After=network.target

[Service]
Type=simple
User=branchmanager
Group=branchmanager
WorkingDirectory=/home/branchmanager/websites/dexter/token-ai
Environment=NODE_ENV=production
Environment=TOKEN_AI_UI_PORT=3017
Environment=TOKEN_AI_MCP_URL=http://127.0.0.1:3930/mcp
Environment=TOKEN_AI_BROADCAST_CHILD_LOGS=1
Environment=SUPABASE_URL=https://<your-supabase>.supabase.co
Environment=SUPABASE_ANON_KEY=<anon-key>
ExecStart=/home/branchmanager/.nvm/versions/node/v20.19.1/bin/node server.js --port 3017
Restart=always
RestartSec=5
Environment=PATH=/home/branchmanager/.nvm/versions/node/v20.19.1/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/dexter-mcp.service`
```
[Unit]
Description=Dexter MCP HTTP Server (OAuth)
After=network.target

[Service]
Type=simple
User=branchmanager
Group=branchmanager
WorkingDirectory=/home/branchmanager/websites/dexter/token-ai
Environment=NODE_ENV=production
Environment=TOKEN_AI_MCP_PORT=3930
Environment=TOKEN_AI_MCP_PUBLIC_URL=https://dexter.cash/mcp
ExecStart=/home/branchmanager/.nvm/versions/node/v20.19.1/bin/node mcp/http-server-oauth.mjs
Restart=always
RestartSec=5
Environment=PATH=/home/branchmanager/.nvm/versions/node/v20.19.1/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
```
