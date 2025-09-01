# Repository Guidelines

Concise contributor guide for Dexter (Token‑AI UI + Analyzer + OAuth‑enabled MCP).

## Project Structure & Module Organization
- `token-ai/`: main codebase — analyzer, UI, MCP. Entry: `token-ai/server.js`; MCP: `token-ai/mcp/*`.
- `public/`: static UI assets served by the root server.
- `token-ai/reports/`, `logs/`: analyzer outputs and runtime logs.
- `prisma/`, `supabase/`, `utils/`: data/config and helper modules (when used).
- `token-ai/inspector/`: Inspector (client/server/cli) — TypeScript projects and tools.

## Build, Test, and Development Commands
- Install deps (root + backend):
  - `npm ci && (cd token-ai && npm ci)`
- Run UI/API locally (port defaults to 3017):
  - `npm run start` or `TOKEN_AI_UI_PORT=3017 npm run start:ui`
- Run MCP HTTP with OAuth (defaults to 3930):
  - `npm run mcp:http:oauth`
- Utilities / status:
  - `npm run status`
- Tests:
  - Root MCP smoke/tests: `npm run test:mcp`, `npm run test:server:routes`
  - Inspector client (Jest): `(cd token-ai/inspector/client && npm test)`
  - Inspector CLI: `(cd token-ai/inspector/cli && npm test)`

## Coding Style & Naming Conventions
- Runtime: Node 20.x, ESM (`"type": "module"`).
- Languages: JS in `token-ai/*`, TS in `token-ai/inspector/*`.
- Formatting: Prettier configured under `token-ai/inspector`. Use 2‑space indent, camelCase for code, kebab‑case for file names.

## Testing Guidelines
- Inspector client uses Jest (`jest.config.cjs`); name tests `*.test.ts(x)`.
- Inspector CLI tests run via Node scripts (`token-ai/inspector/cli/scripts`).
- Root tests validate MCP endpoints and routes; run them before opening a PR.

## Commit & Pull Request Guidelines
- Prefer Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- PRs must include: clear description, linked issues, reproduction commands, and screenshots for UI changes. Note affected services (`dexter-ui`, `dexter-mcp`).

## Security & Configuration Tips
- Env: edit `~/websites/dexter/.env` (authoritative) and copy to `token-ai/.env` before running: `cp .env token-ai/.env`.
- Do not commit secrets. Rotate keys if leaked. Use HTTPS endpoints (see `README.md`) for health checks.


