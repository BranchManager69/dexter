<p align="center">
  <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0ODAgMTYwIiBmaWxsPSJub25lIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZ3JhZCIgeDE9IjAiIHkxPSIwIiB4Mj0iMSIgeTI9IjEiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMwZjE3MmEiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMWUyOTNiIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB4PSIxMiIgeT0iMTIiIHdpZHRoPSI0NTYiIGhlaWdodD0iMTM2IiByeD0iMjQiIGZpbGw9InVybCgjZ3JhZCkiIHN0cm9rZT0iIzMzNDE1NSIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHJlY3QgeD0iMjIiIHk9IjIyIiB3aWR0aD0iNDM2IiBoZWlnaHQ9IjExNiIgcng9IjE4IiBzdHJva2U9IiM0NzU1NjkiIHN0cm9rZS1vcGFjaXR5PSIwLjQ1IiBzdHJva2Utd2lkdGg9IjIiLz4KICA8dGV4dCB4PSI1MCUiIHk9Ijc0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZTBmMmZlIiBmb250LWZhbWlseT0iJ1NGIFBybyBEaXNwbGF5JywnU2Vnb2UgVUknLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNDgiIGZvbnQtd2VpZ2h0PSI2MDAiIGxldHRlci1zcGFjaW5nPSI0Ij5ERVhURVI8L3RleHQ+CiAgPHRleHQgeD0iNTAlIiB5PSIxMTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiMzOGJkZjgiIGZvbnQtZmFtaWx5PSInU0YgTW9ubycsJ0pldEJyYWlucyBNb25vJywnRmlyYSBDb2RlJyxtb25vc3BhY2UiIGZvbnQtc2l6ZT0iMjgiIGxldHRlci1zcGFjaW5nPSIxMCI+U1RBQ0s8L3RleHQ+Cjwvc3ZnPgo=" alt="Dexter Stack wordmark" width="360">
</p>

<p align="center">
  <a href="https://github.com/BranchManager69/dexter-api">Dexter API</a>
  · <a href="https://github.com/BranchManager69/dexter-fe">Dexter FE</a>
  · <a href="https://github.com/BranchManager69/dexter-mcp">Dexter MCP</a>
  · <strong>Dexter Ops</strong>
  · <a href="https://github.com/BranchManager69/pumpstreams">PumpStreams</a>
</p>

<h1 align="center">Dexter Ops</h1>

<p align="center">
  Operations glue for the Dexter stack. The application code lives in the service repositories—this project keeps the
  shared checklists, smoke tests, and deployment templates in one place.
</p>

---

## Highlights

- **Single source of ops truth** – `OPERATIONS.md` documents layout, ports, env guidance, and PM2 usage.
- **Reusable deployment assets** – `ops/` contains the PM2 config and nginx server block templates used in
  production.
- **Production smoke test** – `npm run smoke:prod` validates API health, MCP health, and OIDC metadata in
  one shot.

## Dexter Stack

| Repo | Role |
|------|------|
| [`dexter-api`](https://github.com/BranchManager69/dexter-api) | REST + realtime API issuing tokens and proxying MCP tools |
| [`dexter-fe`](https://github.com/BranchManager69/dexter-fe) | Next.js frontend for voice/chat surfaces |
| [`dexter-mcp`](https://github.com/BranchManager69/dexter-mcp) | Hosted MCP transport powering tool access |
| [`pumpstreams`](https://github.com/BranchManager69/pumpstreams) | Pump.fun reconnaissance & analytics (adjacent tooling) |

Clone the three repos alongside `dexter-ops` (for example under `/home/branchmanager/websites/`) so the
included PM2 and nginx templates resolve paths correctly.

## What’s Inside

- `env.example` – baseline environment hints for local tooling and the smoke test.
- `ops/` – deployment helpers:
  - `ecosystem.config.cjs` (PM2 process file for API, FE, MCP)
  - `nginx-sites/` + `nginx-snippets/` (server block snapshots and shared includes)
  - `apply-nginx-alpha.sh` (example bootstrap script; review before running)
  - `smoke.mjs` (used by `npm run smoke:prod`)
- `OPERATIONS.md` – condensed runbook covering layout, smoke tests, nginx guidance, and env notes.

Historic `token-ai/` assets now live in https://github.com/BranchManager69/token-ai if you need to reference
older material.

## Quick Start

```bash
git clone https://github.com/BranchManager69/dexter-ops.git
cd dexter-ops
npm install          # first time only

# Run the production health check
npm run smoke:prod
```

The smoke test prints success lines for each endpoint. Any failure exits non-zero with the offending check.

## Deployment Templates

The contents of `ops/` are reference implementations—adapt them to your environment:

- **PM2** – `pm2 start ops/ecosystem.config.cjs` will boot all three services when they’ve been built in
  their respective repos. Override `DEXTER_API_PORT`, `DEXTER_FE_PORT`, or `TOKEN_AI_MCP_PORT` as required.
- **nginx** – Copy the desired files from `ops/nginx-sites/` into `/etc/nginx/sites-available/`, adjust
  domains/paths, symlink into `sites-enabled/`, then `nginx -t && systemctl reload nginx`. The helper script
  demonstrates the flow.

## Next Steps

Need deeper instructions or troubleshooting flows? Open `OPERATIONS.md` next, then follow the service-specific
READMEs in `dexter-api`, `dexter-fe`, and `dexter-mcp` for build/run details.
