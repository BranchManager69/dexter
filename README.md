# Dexter Ops (Legacy Monorepo)

This repository now serves as the **operations and deployment shell** for Dexter. The runtime code for each
service lives in its own GitHub repository:

- **dexter-api** – https://github.com/BranchManager69/dexter-api
- **dexter-fe** – https://github.com/BranchManager69/dexter-fe
- **dexter-mcp** – https://github.com/BranchManager69/dexter-mcp

Clone those three repos alongside this one (for example, under `/home/branchmanager/websites/`) and follow
their READMEs for build, test, and development details. This repo now contains only shared operational
notes and utility scripts.

## Health Check

Use the consolidated smoke test to verify the production deployment:

```bash
npm install   # first time only
npm run smoke:prod
```

`ops/smoke.mjs` pings the production API, MCP server, and OIDC metadata endpoints.

## Deployment Overview

- `dexter-api`, `dexter-fe`, and `dexter-mcp` are managed separately (each repo has its own `.env.example`,
  PM2 instructions, and CI hooks).
- This repo keeps shared documentation (`OPERATIONS.md`) and any automation scripts that work across
  services (smoke tests, NGINX config snapshots, etc.).
- The historical Token-AI codebase (`token-ai/`) remains for reference only. Treat it as archived.

See `OPERATIONS.md` for the latest ops notes, PM2 guidance, and environment layout.
