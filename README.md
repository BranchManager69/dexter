# Dexter Ops

Operations glue for the Dexter stack. The application code lives in the service repositories—this project
keeps the shared checklists, smoke tests, and deployment templates in one place.

---

## Highlights

- **Single source of ops truth** – `OPERATIONS.md` documents layout, ports, env guidance, and PM2 usage.
- **Reusable deployment assets** – `ops/` contains the PM2 config and nginx server block templates used in
  production.
- **Production smoke test** – `npm run smoke:prod` validates API health, MCP health, and OIDC metadata in
  one shot.

## Sister Repositories

| Repo | Description |
|------|-------------|
| [`dexter-api`](https://github.com/BranchManager69/dexter-api) | REST + realtime API service |
| [`dexter-fe`](https://github.com/BranchManager69/dexter-fe) | Next.js frontend |
| [`dexter-mcp`](https://github.com/BranchManager69/dexter-mcp) | MCP server with hosted tools |

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
