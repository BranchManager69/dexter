# Dexter Operations Manual

_Last updated: 2025-09-18_

Dexter runs as three services with their own repositories. This repo only carries shared templates and
utility scripts that make deployments smoother.

## Service Map

| Service    | Repo URL                                          | Default Port |
|------------|---------------------------------------------------|--------------|
| API        | https://github.com/BranchManager69/dexter-api     | 3030         |
| Frontend   | https://github.com/BranchManager69/dexter-fe      | 43017        |
| MCP Server | https://github.com/BranchManager69/dexter-mcp     | 3930         |

Keep the three repositories cloned alongside `dexter-ops` (for example under `/home/branchmanager/websites/`) so
the PM2 config and nginx snippets here resolve paths correctly.

## Directory Expectations

```
~/websites/
├── dexter-api/
├── dexter-fe/
├── dexter-mcp/
└── dexter-ops/           # this repo
```

Each service repo owns its build steps, `.env.example`, and deployment instructions. Use this repo only for shared glue.

## Smoke Test

Run the production smoke test from this repo:

```bash
npm run smoke:prod
```

`ops/smoke.mjs` performs three checks:

- `https://api.dexter.cash/health`
- `https://dexter.cash/mcp/health`
- `https://dexter.cash/.well-known/openid-configuration`

All responses must be HTTP 200 with the expected JSON payload. Any failure causes a non-zero exit.

## PM2 Helper

`ops/ecosystem.config.cjs` starts the three services when the repos are co-located. After building in each repo, run:

```bash
pm2 start ops/ecosystem.config.cjs
```

Override ports via environment variables (`DEXTER_API_PORT`, `DEXTER_FE_PORT`, `TOKEN_AI_MCP_PORT`) if needed.

## nginx Snapshots

`ops/nginx-sites/` and `ops/nginx-snippets/` mirror the production server blocks and include files. Treat them as templates:

1. Copy to `/etc/nginx/sites-available/`.
2. Adjust domains/paths as required.
3. Enable and reload nginx.

`ops/apply-nginx-alpha.sh` illustrates the flow; review the referenced conf before running it on a server.

## Environment Files

- Each service repo maintains its own `.env.example` and production secret state.
- `env.example` in this repo documents shared values the scripts expect when run locally.
- For production, rely on the service repos’ secrets—this repo is not authoritative.

## Where to Go Next

For service-specific runbooks, troubleshooting, or deployment steps, consult the READMEs and ops docs in the respective service repositories. Dexter Ops stays intentionally minimal.
