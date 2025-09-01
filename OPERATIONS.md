# Dexter Ops Runbook

This document captures how Dexter (rebrand of Clanka) is deployed and operated on this server. It’s the single place to remember ports, services, env, and common tasks.

## Overview
- Domain: `dexter.cash` (and `www.dexter.cash`)
- Backend/UI: Token-AI UI server (copied from Clanka), plus MCP HTTP server with OAuth
- Reverse proxy: NGINX with Let’s Encrypt
- Process manager: systemd (`dexter-ui`, `dexter-mcp`)
- Env/config policy: reuse parent `.env` and configs via symlinks to avoid drift

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
  - Exec: `/usr/bin/node server.js --port 3017`
  - CWD: `/home/branchmanager/websites/dexter/token-ai`
  - Env:
    - `TOKEN_AI_UI_PORT=3017`
    - `TOKEN_AI_MCP_URL=http://127.0.0.1:3930/mcp`
    - `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `dexter-mcp.service`
  - Exec: `/usr/bin/node mcp/http-server-oauth.mjs`
  - CWD: `/home/branchmanager/websites/dexter/token-ai`
  - Env:
    - `TOKEN_AI_MCP_PORT=3930`
    - `TOKEN_AI_MCP_PUBLIC_URL=https://dexter.cash/mcp`

Common commands:
- `sudo systemctl restart dexter-ui dexter-mcp`
- `sudo systemctl status dexter-ui dexter-mcp`
- `journalctl -u dexter-ui -f` (tail logs)
- `sudo nginx -t && sudo systemctl reload nginx`

## Environment & Symlinks
- Single source of env: parent `.env`
  - `~/websites/dexter/.env` → symlink to `~/websites/degenduel/.env`
  - `~/websites/dexter/token-ai/.env` → symlink to same
- Parent config reused via symlinks:
  - `~/websites/dexter/config` → `~/websites/degenduel/config`
  - `~/websites/dexter/utils` → `~/websites/degenduel/utils`
- Why: preserve exact working configuration without key rotation; easy revert/compare.

### Decoupling plan (later)
- Copy only needed pieces from parent into Dexter: `config/prisma.js`, `config/database-env.js`, any imports used by `token-ai/*`, and required `utils/*`.
- Replace symlinks with real files; set dedicated `.env` for Dexter.

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
  - `npm run mcp` → `node token-ai/mcp/server.mjs`
  - `npm run mcp:http` → `node token-ai/mcp/http-server.mjs`
  - `npm run mcp:http:oauth` → `node token-ai/mcp/http-server-oauth.mjs`
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

