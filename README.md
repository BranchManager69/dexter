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
  Your starting point for everything Dexter. Explore the services, keep the repos side-by-side, and use this project as
  the shared playbook for environment setup, smoke tests, and deployment templates.
</p>

---

## What Is Dexter?

- **Dexter API** – issues OpenAI realtime tokens, proxies hosted MCP tools, and handles Coinbase x402 billing.
- **Dexter FE** – Next.js UI that showcases the voice/chat agents.
- **Dexter MCP** – fully managed Model Context Protocol transport with wallet tooling.
- **Dexter Ops** (this repo) – deployment checklists, shared env hints, smoke tests, nginx snapshots.
- **PumpStreams** – optional analytics suite tracking pump.fun livestreams (adjacent but often deployed together).

Keep the repos cloned as siblings (for example under `/home/branchmanager/websites/`) so shared scripts and env shims work as intended.

## Repo Map

| Repo | Role |
|------|------|
| [`dexter-api`](https://github.com/BranchManager69/dexter-api) | REST + realtime API issuing tokens and proxying MCP tools |
| [`dexter-fe`](https://github.com/BranchManager69/dexter-fe) | Next.js frontend for voice/chat surfaces |
| [`dexter-mcp`](https://github.com/BranchManager69/dexter-mcp) | Hosted MCP transport powering tool access |
| [`pumpstreams`](https://github.com/BranchManager69/pumpstreams) | Pump.fun reconnaissance & analytics (adjacent tooling) |

## Environment & Layout

- Each service ships its own `.env.example`; copy to `.env` / `.env.local` as needed.
- `dexter-api`’s loader will backfill values from sibling `.env` files when the repos live next to each other.
- This repo’s `env.example` documents the shared values the smoke test and nginx helpers expect.
- Directory layout used in production:
  ```
  ~/websites/
  ├── dexter-api/
  ├── dexter-fe/
  ├── dexter-mcp/
  └── dexter-ops/   ← you are here
  ```

## Deploy & Verify

- `env.example` – baseline environment hints for local tooling and the smoke test.
- `ops/` – deployment helpers:
  - `ecosystem.config.cjs` (PM2 process file for API, FE, MCP)
  - `nginx-sites/` + `nginx-snippets/` (server block snapshots and shared includes)
  - `apply-nginx-alpha.sh` (example bootstrap script; review before running)
- `smoke.mjs` (used by `npm run smoke:prod`)
- `OPERATIONS.md` – condensed runbook covering PM2 usage, nginx walkthroughs, port map, and troubleshooting notes.
- `ops/scripts/capture-previews.mjs` – invoked via `npm run capture:previews`; refreshes README screenshots and publishes them to `https://docs.dexter.cash/previews/`.

Historic `token-ai/` assets now live in https://github.com/BranchManager69/token-ai if you need to reference older material.

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

- **PM2** – `pm2 start ops/ecosystem.config.cjs` will boot all three services when they’ve been built in their respective repos. Override `DEXTER_API_PORT`, `DEXTER_FE_PORT`, or `TOKEN_AI_MCP_PORT` as required.
- **nginx** – Copy the desired files from `ops/nginx-sites/` into `/etc/nginx/sites-available/`, adjust domains/paths, symlink into `sites-enabled/`, then `nginx -t && systemctl reload nginx`.

## Next Steps

1. Read `OPERATIONS.md` for deployment details, port maps, and health-check procedures.
2. Jump into the service repos for development instructions (`dexter-api`, `dexter-fe`, `dexter-mcp`).
3. Visit [docs.dexter.cash](https://docs.dexter.cash) for long-form guides (OpenAI agent flows, x402 integration, MCP tooling).

> **Support expectations** – Repos are provided as reference implementations. We don’t offer bespoke support for cloning the full stack. Open issues for clear bugs or documentation gaps only.
