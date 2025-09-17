# Dexter Operations Manual

_Last updated: 2025-09-17_

Dexter is the production trade stack that powers **dexter.cash**. The stack lives entirely on this EC2 host under `/home/branchmanager/websites/dexter` and is managed with **PM2**. This document replaces every legacy ops note (systemd, Clanka, Token-AI runbooks, etc.). If you need to touch production, start here.

---
## 1. High-Level Architecture

| Component | Purpose | Source | Runtime | Port |
|-----------|---------|--------|---------|------|
| **dexter-fe** | Next.js UI (marketing + /link workflow) | `alpha/dexter-fe` | `next start` | 43017 |
| **dexter-api** | REST + Agents API surface (Supabase-aware) | `alpha/dexter-api` | compiled Node server | 3030 |
| **dexter-mcp** | OAuth-enabled MCP HTTP server | `alpha/dexter-mcp` | Node ESM | 3930 |
| **redis-commander-prod** | Legacy dashboard (kept for reference) | external | PM2 | 8081 |
| **dexter NGINX vhost** | TLS termination, proxy, static | `/etc/nginx/sites-available/dexter.cash` | system nginx | 443/80 |
| **Supabase** | Auth + Postgres | Cloud | — | — |

**Key domain routing**
- `https://dexter.cash` → NGINX → `dexter-fe` (43017)
- `https://api.dexter.cash` → NGINX → `dexter-api` (3030)
- `https://dexter.cash/mcp` → NGINX → `dexter-mcp` (3930)

All deployments happen from the repo root (`~/websites/dexter`).

---
## 2. Process Management (PM2)

All three Dexter services run under PM2. Systemd units from older docs are **deprecated** and masked.

```bash
# View process table
pm2 ls

# Tail logs (non-blocking)
tail -n 100 ~/.pm2/logs/dexter-api-out.log
tail -n 100 ~/.pm2/logs/dexter-fe-out.log
tail -n 100 ~/.pm2/logs/dexter-mcp-out.log

# Restart a single service
pm2 restart dexter-api --update-env
pm2 restart dexter-fe  --update-env
pm2 restart dexter-mcp --update-env

# Restart the whole stack (API + FE + MCP)
pm2 restart dexter-api dexter-fe dexter-mcp --update-env

# Persist current process list across reboots
pm2 save
```

PM2 logs live in `~/.pm2/logs/`. Use `pm2 flush` only if you intentionally want to truncate logs.

Startup configuration is defined in `alpha/ecosystem.config.cjs`. To (re)launch everything from scratch:

```bash
pm2 start alpha/ecosystem.config.cjs --only dexter-api,dexter-fe,dexter-mcp
pm2 save
```

---
## 3. Code & Directory Layout

```
~/websites/dexter
├── alpha/
│   ├── dexter-api/        # TypeScript API (build to dist/)
│   ├── dexter-fe/         # Next.js app (build outputs to .next/)
│   └── dexter-mcp/        # OAuth MCP server + tools
├── public/                # Static assets served via Next & nginx (historical)
├── token-ai/              # Legacy UI server still used for some CLI scripts
├── pm2 logs: ~/.pm2/logs/
├── env files: .env, token-ai/.env, alpha/dexter-fe/.env.production
└── deployment docs: OPERATIONS.md (this file), ISSUE.md (current incident log)
```

---
## 4. Environment Management

**Authoritative file:** `/home/branchmanager/websites/dexter/.env`

Usage summary:
- `dexter-api` & `dexter-mcp` load from the repo root `.env` automatically.
- Legacy Token-AI scripts expect a mirrored copy at `token-ai/.env`.
- `dexter-fe` reads build-time vars from `alpha/dexter-fe/.env.production` (tracked) and runtime data from API rewrites.

Typical workflow after editing environment values:
```bash
# Edit
vim ~/websites/dexter/.env

# Sync legacy copy if needed
cp ~/websites/dexter/.env ~/websites/dexter/token-ai/.env

# Update Next.js production env if you changed frontend values
vim ~/websites/dexter/alpha/dexter-fe/.env.production

# Restart affected services
pm2 restart dexter-api dexter-mcp dexter-fe --update-env
```

**Sanity checks**
- `curl -s https://api.dexter.cash/auth/config`
- `curl -s https://dexter.cash/agent-env.js?v=1` (should echo latest MCP URL, wallet defaults, etc.)

---
## 5. Deploying Code Changes

### 5.1 Frontend (dexter-fe)
1. `cd ~/websites/dexter/alpha/dexter-fe`
2. `npm install` (if dependencies changed)
3. `npm run build` (produces `.next/` for `next start`)
4. `pm2 restart dexter-fe --update-env`
5. Verify: `curl -I https://dexter.cash` and open the site.

### 5.2 API (dexter-api)
1. `cd ~/websites/dexter/alpha/dexter-api`
2. `npm install`
3. `npm run build` (transpiles TS → `dist/`)
4. `pm2 restart dexter-api --update-env`
5. Smoke tests:
   - `curl -s https://api.dexter.cash/health`
   - `curl -s https://api.dexter.cash/mcp/health`

### 5.3 MCP Server (dexter-mcp)
1. `cd ~/websites/dexter/alpha/dexter-mcp`
2. `npm install` (rarely needed; dependencies are minimal)
3. No build step – it’s ESM. Just restart:
   `pm2 restart dexter-mcp --update-env`
4. Validate OAuth metadata:
   - `curl -s https://dexter.cash/mcp/.well-known/oauth-authorization-server`
   - `curl -s https://dexter.cash/mcp/.well-known/openid-configuration`

### 5.4 Combined Deploy Shortcut
```bash
# From repo root
git pull
(cd alpha/dexter-api   && npm install && npm run build )
(cd alpha/dexter-fe    && npm install && npm run build   )
# MCP rarely needs npm install, but include if package.json changed
pm2 restart dexter-api dexter-fe dexter-mcp --update-env
pm2 save
```

### 5.5 Post-Deploy Checklist
- ✅ `pm2 ls` shows API/FE/MCP online with fresh uptimes
- ✅ `curl https://dexter.cash/link` returns 200 (HTML)
- ✅ `curl https://api.dexter.cash/auth/config` echoes Supabase info
- ✅ `curl https://dexter.cash/mcp/.well-known/oauth-authorization-server` returns JSON
- ✅ `tail -n 50 ~/.pm2/logs/dexter-mcp-out.log` shows connectors hitting `/authorize` and `/token`

---
## 6. Reverse Proxy & TLS (nginx)

- Config path: `/etc/nginx/sites-available/dexter.cash` (linked into `sites-enabled/`)
- Static assets (`/public`) served directly when available; everything else proxied to PM2 services.
- SSL certificates managed via Certbot (`/etc/letsencrypt/live/dexter.cash/`).

Key commands:
```bash
sudo nginx -t                       # config test
sudo systemctl reload nginx         # zero-downtime reload
sudo certbot renew --dry-run        # monthly cron handles real renewals
```

If you adjust ports or add paths, update the nginx config and reload.

---
## 7. Observability & Troubleshooting

### 7.1 Quick Diagnostics
| What | Command |
|------|---------|
| Who’s listening | `ss -tulpn | rg '3030|3930|43017'` |
| Tail API logs | `tail -n 100 ~/.pm2/logs/dexter-api-out.log` |
| Tail MCP logs | `tail -n 100 ~/.pm2/logs/dexter-mcp-out.log` |
| Tail FE logs  | `tail -n 100 ~/.pm2/logs/dexter-fe-out.log` |
| Flush logs    | `pm2 flush dexter-api dexter-fe dexter-mcp` (optional) |
| Clear log files manually | `: > ~/.pm2/logs/dexter-mcp-out.log` |

### 7.2 Common Issues & Fixes
- **“Tool execution failed” in connectors** → Check MCP logs for `[linking]` entries, confirm `/userinfo` response contains `sub` and `email`.
- **UI shows stale env** → Purge Cloudflare cache for `/agent-env.js` or visit `/agent-env.js?v=2` (cache bust), ensure `dexter-fe` restarted after env change.
- **API TypeErrors after deploy** → Ensure `npm run build` ran successfully and `dist/` contains the latest JS.
- **MCP OAuth errors** → Run `TOKEN_AI_MCP_OAUTH_ALLOW_ANY=false` and confirm connectors request `scope=openid profile email`. Inspect `dexter-mcp-error.log` for stack traces.
- **Port already in use** → Something else is running; `pm2 stop <name>` then `ss -tulpn` to see the offender.
- **NGINX 502** → Backends down. Restart via PM2.

### 7.3 Monitoring Connectors
- Use the CLI smoke test while debugging without Claude/ChatGPT:
  ```bash
  npm run mcp:prod              # from repo root (invokes token-ai/scripts/test-mcp-http.mjs)
  ```
- When diagnosing OAuth, enable verbose logging by temporarily setting `TOKEN_AI_MCP_LOG_LEVEL=debug` in `.env` and restarting `dexter-mcp`.

---
## 8. Supabase & Database Notes

- Supabase project holds user accounts, managed wallets, linking tables, etc.
- Critical tables: `account_links`, `linking_codes`, `oauth_user_wallets`, `managed_wallets`.
- Prisma client config lives in `config/prisma.js`; both API and MCP share it.
- For quick DB introspection:
  ```bash
  node -e "require('./config/prisma.js').default.account_links.findMany({ take:5, orderBy:{ linked_at:'desc' } }).then(console.log).finally(()=>process.exit())"
  ```
- Treat secrets (database URL, anon key) as sensitive—**never** commit them; `.env` is gitignored.

---
## 9. Legacy & Cleanup

- **Systemd units** `dexter-ui.service` / `dexter-mcp.service` are masked and must stay disabled. All operations happen via PM2.
- Any references to Clanka ports (3013/3928) are historical; do not modify unless decommissioning Clanka.
- Old PM2 apps (`ai-ui`, etc.) should remain deleted: `pm2 delete ai-ui; pm2 save`.
- Auto-restart `.path` units from Token-AI era are no longer necessary; PM2 handles restarts.

---
## 10. Quick Reference Cheat Sheet

```bash
# Git + deploy
cd ~/websites/dexter
git pull
(cd alpha/dexter-api && npm install && npm run build)
(cd alpha/dexter-fe  && npm install && npm run build)
pm2 restart dexter-api dexter-fe dexter-mcp --update-env
pm2 save

# Verify services
pm2 ls
curl -s https://dexter.cash/link | head -n 5
curl -s https://api.dexter.cash/health
curl -s https://dexter.cash/mcp/.well-known/oauth-authorization-server

# Logs
tail -n 50 ~/.pm2/logs/dexter-api-out.log
tail -n 50 ~/.pm2/logs/dexter-fe-out.log
tail -n 50 ~/.pm2/logs/dexter-mcp-out.log
```

Keep this file current—update after every structural change.
