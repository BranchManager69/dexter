# Dexter Ops

Dexter Ops is the thin shell that hosts shared operational chores for the Dexter stack. Service code now
lives in individual repositories:

- `dexter-api` – https://github.com/BranchManager69/dexter-api
- `dexter-fe` – https://github.com/BranchManager69/dexter-fe
- `dexter-mcp` – https://github.com/BranchManager69/dexter-mcp

Clone those repos next to this one (for example under `/home/branchmanager/websites/`). This repo only
provides:

- `env.example` — baseline environment hints for local tooling
- `ops/` — shared scripts (PM2 config, nginx snapshots, production smoke test)
- `OPERATIONS.md` — deployment checklist and service layout reference

Everything else has been retired; refer to the service repos or the archived token-ai history if you need
older material.

## Quick Smoke Test

```bash
npm install   # first time
npm run smoke:prod
```

The script at `ops/smoke.mjs` checks the production API, MCP endpoint, and OIDC discovery document. Expect
zero output if the checks pass; failures are printed inline.

## PM2 + nginx References

The `ops/` folder contains the kept deployment snippets:

- `ops/ecosystem.config.cjs` – single PM2 file that bootstraps the API, FE, and MCP apps when the repos sit
  beside each other
- `ops/nginx-sites/*.conf` and `ops/nginx-snippets/` – snapshots of the production server blocks and common
  include files
- `ops/apply-nginx-alpha.sh` – example script demonstrating how to wire the configs on a fresh host (review
  the referenced snippet before running)

Adjust paths/ports as needed for new environments; the files are intended as templates, not turnkey deploys.

## Need More Detail?

`OPERATIONS.md` captures the authoritative runbook (directory layout, port map, env guidelines, smoke test
explanation). Check that document next when you are preparing a deploy or onboarding a new operator.
