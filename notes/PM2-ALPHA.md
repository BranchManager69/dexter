# PM2 setup (alpha split)

Use PM2 to run dexter-api, dexter-fe, and dexter-mcp. PM2 will manage processes; you can still use `pm2 startup` to register PM2 with systemd so they survive reboots, but the apps themselves are not systemd units.

## One-time
```
npm i -g pm2
# from repo root
DEXTER_API_PORT=43030 DEXTER_FE_PORT=43017 NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:43030 \
  pm2 start alpha/pm2-ecosystem.cjs --only dexter-api,dexter-fe

# MCP (existing server)
# Rename or (re)start MCP under canonical name `dexter-mcp` (port 3930)
pm2 stop token-ai-mcp-http || true
pm2 start /home/branchmanager/websites/degenduel/token-ai/mcp/http-server-oauth.mjs \
  --name dexter-mcp \
  --cwd /home/branchmanager/websites/degenduel \
  --interpreter node
pm2 delete token-ai-mcp-http || true
pm2 save
pm2 save
# (optional) make PM2 resurrect on boot
pm2 startup   # follow the printed command
```

## Build steps (first run or after changes)
```
# API
cd alpha/dexter-api && npm ci && npm run build

# FE
cd alpha/dexter-fe && npm ci && npm run build
```

## Manage
```
pm2 ls
pm2 logs dexter-api --lines 200
pm2 logs dexter-fe --lines 200
pm2 logs dexter-mcp --lines 200
pm2 restart dexter-api
pm2 restart dexter-fe
pm2 restart dexter-mcp
pm2 save
```

## Env
- API reads env from `alpha/dexter-api/.env` (loaded by the PM2 ecosystem file via dotenv).
- FE uses `NEXT_PUBLIC_API_ORIGIN` (default: `https://api.dexter.cash`). Override via shell env before `pm2 start` or edit `alpha/pm2-ecosystem.cjs`.

## NGINX (unchanged from alpha split)
- dexter.cash → FE (Next.js 3017) 
- api.dexter.cash → API (3030)
- mcp.dexter.cash → dexter-mcp (3930)

See `notes/NGINX-ALPHA-SPLIT.conf`.
