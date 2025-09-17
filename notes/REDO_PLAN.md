# REDO Plan — Dexter (Token‑AI UI + Analyzer + OAuth‑MCP)

This is a practical, incremental plan to refactor and harden Dexter while preserving current behavior. Keep changes scoped, observable, and reversible.

## Objectives
- Preserve current functionality; minimize downtime and user impact.
- Simplify architecture and configs; reduce coupling between UI, MCP, and Analyzer.
- Improve reliability (timeouts/retries), logging, and baseline tests.
- Standardize build/run scripts and environment management.
- Make rollback trivial via snapshots and unitized deploys.

## Scope & Constraints
- In-scope: `token-ai/` (server, MCP, analyzer, inspector), `public/`, `prisma/`, `supabase/`, `utils/`, NGINX + systemd service wrappers.
- Constraints: Node 20.x, ESM, 2-space indent, camelCase, kebab-case filenames, Prettier where configured.
- Ports: UI/API 3017 (default), MCP OAuth 3930 (default).

## Current State Snapshot
- Latest snapshot: see `_backup/` (created prior to refactor). Verify:
  ```bash
  sha256sum -c _backup/dexter-snapshot-*.tar.gz.sha256
  ```
- Keep this snapshot immutable; create fresh ones before risky steps.

## Phase 0 — Discovery (1–2 days)
- Inventory runtime and wiring:
  - `npm run status`; `npm run start` (UI/API); `npm run mcp:http:oauth`.
  - Verify routes, MCP endpoints, OAuth callback/config, and analyzer outputs in `token-ai/reports/`.
- Baseline tests and health:
  - Root: `npm run test:mcp`, `npm run test:server:routes`.
  - Inspector: `(cd token-ai/inspector/client && npm test)` and `(cd token-ai/inspector/cli && npm test)`.
- Config mapping: list all env vars read at runtime; note defaults vs required.
- Log review: error hotspots, timeouts, and long-running tasks.
- Outputs: architecture sketch, config table, risk list.

## Phase 1 — Success Criteria
- Reliability: no new 5xxs; analyzer tasks terminate with timeouts; retries bounded.
- Observability: structured logs for UI/MCP/analyzer with correlation IDs.
- Tests: smoke tests pass locally and in CI; minimum route/MCP coverage restored.
- Ops: single-command start for UI/MCP; documented service restarts.

## Phase 2 — Architecture Boundaries (proposal)
- Services:
  - UI/API: `token-ai/server.js` serving UI + API.
  - MCP (OAuth): `alpha/dexter-mcp/*` HTTP server.
  - Analyzer worker: isolated module with explicit I/O to `reports/` and logs.
  - Inspector: TS client/CLI with separate build/test.
- Contracts:
  - HTTP routes + MCP endpoints documented; payload schemas and error model unified.
  - File interfaces: stable report formats; no hidden cross-writes.
- Process model: keep systemd units; ensure `EnvironmentFile` points to `.env` and proper `WorkingDirectory`.

## Phase 3 — Incremental Refactor (small PRs)
1) Config unification
- Create/verify `.env.example` with authoritative keys and comments.
- Centralize config loader (single module) with: defaults, required list, validation, and runtime dump (redacted).

2) Error handling + logging
- Add error boundaries in request handlers and analyzer jobs.
- Adopt structured logs (JSON or consistent fields); include request IDs.

3) Build + scripts
- Ensure scripts:
  - `npm ci && (cd token-ai && npm ci)`
  - `npm run start` or `TOKEN_AI_UI_PORT=3017 npm run start:ui`
  - `npm run mcp:http:oauth`
  - `npm run status`
- Add `lint`/`format` where Prettier exists (inspector). Avoid repo‑wide churn.

4) Tests baseline
- Root MCP smoke, routes tests green.
- Inspector client/CLI tests run clean; stabilize flaky tests.
- Add a minimal analyzer smoke test (timeout bound, fake input → report file).

5) Analyzer isolation
- Encapsulate analyzer entry with explicit inputs/outputs and a cancellation/timeout controller.
- Guard filesystem writes to `token-ai/reports/` only; ensure concurrency safety.

6) OAuth/MCP hardening
- Validate OAuth envs at boot; fail fast with clear messages.
- Add retry/backoff for upstream calls; cap timeouts.

## Phase 4 — Data & Migrations (if used)
- Prisma/Supabase: inventory schema drift; generate migrations; back up DB.
- Establish migration checklist and rollback path.

## Phase 5 — Deploy & Rollback
- Pre-deploy: create fresh snapshot; confirm tests; dry-run systemd reload.
- Deployment steps (example):
  ```bash
  # update code
  npm ci && (cd token-ai && npm ci)
  # reload services
  sudo systemctl daemon-reload
  sudo systemctl restart dexter-ui dexter-mcp
  sudo systemctl status dexter-ui dexter-mcp --no-pager
  # nginx
  sudo nginx -t && sudo systemctl reload nginx
  ```
- Rollback: restore previous snapshot or revert commit, restart services, verify health.

## Documentation Updates
- README: commands, ports, env requirements, health checks.
- OPERATIONS.md: restart/rollback, log locations, common failures.
- SYSTEM_SERVICES.md: unit files, EnvironmentFile paths, journalctl tips.
- AGENTS.md: code style, scopes, and any architectural decisions affecting agents.

## Risks & Mitigations
- Secrets sprawl: use `.env` and never commit; redact logs.
- Long-running analyzer: enforce timeouts and streaming logs; kill on overrun.
- OAuth fragility: add circuit breakers and clear error messaging.
- Config drift: authoritative `.env.example` + config module.
- Node/ESM issues: pin Node 20.x; ensure ESM imports consistent.

## Timeline (draft)
- Week 1: Discovery, config unification, logging, test baseline.
- Week 2: Analyzer isolation, OAuth/MCP hardening, deploy/rollback rehearsals.

## Checklists

Pre-refactor
- [ ] Fresh backup in `_backup/` verified
- [ ] Open issues labeled (refactor scope)
- [ ] Env keys mapped and validated

Pre-deploy
- [ ] Tests green (root, inspector)
- [ ] NGINX config `nginx -t` passes
- [ ] `systemctl status` clean for both services

Post-deploy
- [ ] Smoke routes + MCP OK
- [ ] Analyzer jobs complete within SLA
- [ ] Logs clean (no new errors)

## Decision Log
- Use this section to record architectural decisions (date, context, decision, consequences).

