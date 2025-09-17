# Dexter MCP Tool Refactor Plan

## Working Approach
- Capture desired user journeys and required capabilities.
- Audit existing MCP tools to decide what stays, what changes, and what goes.
- Define a minimal v1 bundle, then layer in optional toolsets.
- Track prerequisites, owners, and status for each work item.

## Journey & Capability Checklist
| Journey | Description | Key Capabilities | Notes |
|---------|-------------|------------------|-------|
| Research & Discovery | Give agents enough market and web context to evaluate a token | Web search, URL fetch/smart fetch, DexScreener metrics, optional OHLCV | Target for v1; rebuild `web-research` + keep `dexscreener` |
| Wallet Operations | Manage managed wallets and execute trades | Wallet resolution, balance listing, trading flows, aliases | **Must ship**; rebuild auth + wallet stack immediately |
| Report Browsing | Surface stored analyzer reports to agents | List/download reports, mint lookup helpers | Requires new report storage (files or DB); revisit post-v1 |
| Connector Auth | Connect MCP users to Dexter accounts | OAuth against Dexter/Supabase (no link codes), token provisioning | Requires new OAuth endpoint + connector config |

## Wallet & Auth Toolset Focus
| Module | Role | Hard Dependencies | Current Gaps | Action |
|--------|------|-------------------|-------------|--------|
| wallet-auth.mjs | Resolve wallet IDs from auth context | Prisma (wallet tables), JWT utils, bearer maps | Legacy imports gone; no current wallet mapping | Rebuild minimal resolver tied to new DB/API |
| wallet-aliases.mjs | User-defined wallet aliases | Prisma (`ai_user_tokens`, `ai_wallet_aliases`, `managed_wallets`) | Token issuance + schema not confirmed | Confirm schema, reapply with new resolver |
| wallet-extra.mjs | Fetch wallet analysis via API | API endpoint `/api/wallet-analysis` | Endpoint missing in new API | Replace with slimmer balance/metrics call |
| trading.mjs | Execute trades & list balances | Solana RPC, Jupiter client, Prisma managed wallets | Depends on removed traders + secrets | Redesign trading flow after resolver exists |

### Wallet/Auth Rebuild Outline
- MCP wallet tools now rely on `/api/wallets/resolver`; legacy wallet link/generate flows removed until API replacements exist.
- Confirm surviving tables (`managed_wallets`, `oauth_user_wallets`) and drop legacy link-code artifacts.
- Expose a shared resolver module (e.g. `dexter-api/src/wallets/resolver.ts`) returning `{ publicAddress, walletId, label, permissions }` with the public address as the canonical key.
- Update MCP `wallet-auth.mjs` to call the resolver API and cache results per Supabase user; no direct Prisma usage inside MCP.
- Remove link-code tooling entirely; OAuth tokens issued by Dexter/Supabase become the only supported path.
- Define how long-lived Supabase tokens are minted for connectors (multi-year/"forever" lifetimes) and how revocation works if a token is compromised.
- Implemented `/api/wallets/resolver` returning mapped `managed_wallets` for the authenticated Supabase user (view + trade permissions scaffolded).
### Prisma Schema Snapshot (Wallet/Auth)
- `managed_wallets`: custodial Solana wallets keyed by UUID with `public_key`, optional `label`, `status`, and JSON `metadata`. No direct owner column; ownership is implied through `oauth_user_wallets`.
- `oauth_user_wallets`: maps OAuth provider + subject to a `wallet_id` and optional `supabase_user_id`. Supports multiple wallets per identity via `default_wallet` flag.
- `ai_app_users` / `ai_user_tokens` / `ai_user_settings`: legacy user directory and per-user default wallet pointers. Today the canonical identity should be Supabase; we can deprecate tokens once connector OAuth returns Supabase IDs.
- `ai_wallet_aliases`: per-user nickname table for wallets. With `managed_wallets.label` available, we can migrate aliases into wallet metadata and remove this table.
- `account_links` & `linking_codes`: former link-code tables. **Dropped Feb 2025**; keep archives only if needed for audits.
- `ai_trade_audit`: append-only ledger of wallet actions; keep for compliance, but ensure it records Supabase user IDs instead of legacy tokens.


### Trading Primitive Outline
- Define trading service interface in the API (quote lookup, submit swap, poll status).
- MCP `trading.mjs` proxies through that API; MCP never handles private keys directly.
- Separate read-only balance listing from mutation endpoints; require explicit tool opt-in for swap/transfer with per-user authorization checks.
- Enforce wallet scoping in the API so a user (including admins) can only act on wallets they own unless an explicit elevated flag is set server-side.
- Capture required secrets (`SOLANA_RPC_ENDPOINT`, Jupiter API key, wallet key storage) and how they are provisioned per environment.

### Connector OAuth Rollout Plan
- `/api/connector/oauth/authorize` now redirects to `/connector/auth`, a Supabase-backed login page that exchanges the session for an OAuth code.
- Authorization codes are short-lived and exchanged server-side via Supabase service-role key; refresh grant reuses the same endpoint.
- Legacy `/api/link/*` endpoints have now been removed; connectors must use the Supabase OAuth flow exclusively. `/api/identity/*` stays temporarily for backward-compatible lookups until dependent callers migrate.
- MCP `wallet-auth.mjs` will drop Prisma usage and call `/api/wallets/resolver` using the Supabase bearer, enforcing per-user scoping.
- Token endpoint issues Supabase-backed access tokens (via refresh grant). Session hashing logged; persistence pending `connector_sessions` migration.
- Implement `GET /api/connector/oauth/authorize` and `POST /api/connector/oauth/token` in dexter-api.
- Use Supabase service-role key to mint long-lived JWTs (1yr+) and store hashed tokens in `connector_sessions`.
- Update ChatGPT/Claude connector configs to point to the new authorize/token endpoints (scopes: `wallet.read wallet.trade`).
- MCP server validates Supabase JWT via `SUPABASE_JWT_SECRET`; link-code tooling removed.
- After rollout, drop Prisma models: ~~`account_links`, `linking_codes`~~ (done), `ai_user_tokens`, and migrate any alias data into `managed_wallets.label`.

### Research Tooling Baseline
- Keep a single search/fetch surface (`web_search`, `smart_fetch`) with Tavily plus Readability/Playwright fallback.
- Retain DexScreener suite but move UA/timeout config to env (`DEXSCREENER_USER_AGENT`, `DEXSCREENER_TIMEOUT_MS`).
- Rebuild OHLCV module against Birdeye REST directly from MCP or via API proxy if credentials should stay backend-only.
- Document the minimum JSON returned by each tool so FE and voice surfaces can consume consistent shapes.

## Tool Inventory
> For each existing tool module, we record the purpose, critical dependencies, current issues, and a recommendation.

| Tool | Purpose | Dependencies (runtime & data) | Current Issues | Recommendation | Status |
|------|---------|-------------------------------|----------------|----------------|--------|
| agent-run.mjs | Spawn token analyzer and socials processes | `token-ai/core/run-manager.js`, legacy analyzer CLIs, research webhooks | Core dependencies removed; would crash immediately | Drop for now – rebuild only if a new analyzer exists | Untriaged |
| dexscreener.mjs | Query DexScreener for token/pair metadata | axios, DexScreener HTTP API | Mostly intact; references legacy user agent string | Keep – minor polish (UA/env) | Untriaged |
| foundation.mjs | Wrap token activation/enrichment helpers | `token-ai/socials/tools/foundation.js` | Module missing after repo split | Replace with new data service or remove | Untriaged |
| ohlcv.mjs | Fetch Birdeye OHLCV ranges | `token-ai/socials/tools/market.js`, Birdeye API key | Depends on missing helper module | Rebuild standalone Birdeye client if needed | Untriaged |
| predictions.mjs | Read stored tweets & prediction scores | `config/prisma.js` (missing), Prisma tables | Prisma helper absent; schema unverified | Rebuild if prediction DB retained; else drop | Untriaged |
| program-accounts.mjs | Helius getProgramAccounts wrappers | node-fetch, Helius/Solana RPC creds | Functional but needs RPC env defaults reviewed | Keep – verify env names | Untriaged |
| report-analysis.mjs | List & read analyzer report JSON files | `../reports/ai-token-analyses`, filesystem | Reports directory no longer exists | Rebuild against new storage (or cut) | Untriaged |
| socials-data.mjs | Scrape Twitter/Telegram/market snapshots | `token-ai/socials` scrapers, Playwright sessions | All upstream scrapers missing after split | Drop – replace with new data pipeline later | Untriaged |
| socials-orchestrate.mjs | Run socials/orchestrator CLI and parse output | `token-ai/socials/orchestrator.js`, Node child processes | Orchestrator script absent; spawn fails | Drop | Untriaged |
| trading.mjs | Wallet management & Jupiter trading | `token-ai/trade-manager/*`, Prisma managed wallets, Solana RPC | Heavy dependencies gone; security sensitive | Drop – rebuild only with new wallet stack | Untriaged |
| voice-debug.mjs | Inspect realtime voice debug endpoints | Legacy UI server on `TOKEN_AI_UI_PORT` | UI endpoints removed in split | Drop unless new voice UI emerges | Untriaged |
| wallet-aliases.mjs | Manage per-user wallet aliases | Prisma (`ai_user_tokens`, `ai_wallet_aliases`, `managed_wallets`) | Requires DB + token issuance not yet defined | Rebuild if alias feature is still wanted | Untriaged |
| wallet-auth.mjs | Resolve wallet IDs from Supabase bearer tokens | `/api/wallets/resolver`, Supabase JWT | Rewritten to remove Prisma/link-code dependencies | Done |
| wallet-extra.mjs | Fetch wallet analysis from API server | node-fetch, `/api/wallet-analysis` endpoint | Endpoint not present in new API | Drop | Untriaged |
| web-research.mjs | Web search/fetch/crawl plus job helpers | Tavily API, node-fetch, Playwright, `token-ai/core/run-manager.js`, report dirs | Uses missing run manager & report paths; heavy deps | Rebuild core research toolkit (search/fetch) | Untriaged |
| websites.mjs | Website extraction + official link discovery | `token-ai/socials/tools/websites.js` & foundation helpers | Relies on missing legacy modules | Fold into rebuilt research pipeline or drop | Untriaged |

## v1 Tool Bundle
- **Must ship:** Supabase-backed wallet resolution (`wallet-auth`, `wallet-aliases` cleanup), trading primitives, DexScreener metrics, OHLCV/Birdeye coverage, and a single best-in-class research fetch/search tool.
- **Optional / follow-up:** Playwright crawling extras, report browsing, prediction history, and voice/UX debug tooling.

## Immediate Work Items
| Task | Owner | Status | Blocking | Notes |
|------|-------|--------|----------|-------|
| Inventory Prisma schema vs. new API needs | Backend | Completed | — | Snapshot captured in plan (`managed_wallets`, `oauth_user_wallets`, alias/link tables) |
| Draft OAuth-for-connector flow (Dexter auth endpoint + connector config) | Backend | Completed | — | `/api/connector/oauth/authorize` + `/api/connector/oauth/token` scaffolded (refresh_token grant) |
| Draft wallet resolver API contract | Backend | Completed | — | `/api/wallets/resolver` implemented (view/trade permissions scaffolded) |
| MCP wallet-auth rewrite to call resolver | MCP | Completed | — | Tools now call `/api/wallets/resolver`; session overrides respected |
| Trading pathway design (quote + execute) | Backend/MCP | Not started | Resolver contract, key custody decision | Define permission and approval model |
| Rebuild smart fetch tool with Tavily + fallback | MCP | Not started | Tavily key strategy | Merge old `web_search` variants into one |
| DexScreener env config pass | MCP | In progress | None | Move UA/timeouts/env and add retries |
| Birdeye OHLCV client rewrite | MCP | Not started | API key decision | Decide if MCP calls Birdeye directly or via API proxy |

## Prerequisites & Risks
| Item | Description | Owner | Status |
|------|-------------|-------|--------|
| Tavily key strategy | Decide where `TAVILY_API_KEY` lives and how MCP + API obtain it | TBD | Open |
| Prisma scope audit | Confirm which tables survive the split (account links, wallets, predictions) | Backend | Open |
| Trading key custody | Decide where Solana keypairs/Jupiter auth live; define rotation/backups | Security/Backend | Open |
| Report storage plan | Choose new location (filesystem vs DB) for analyzer reports or drop feature | TBD | Open |
| Playwright runtime | Verify deployment hosts can run Playwright/Chromium for rendered fetch | Infra | Open |


## Notes & Decisions Log
- _Use this section to jot quick decisions, open questions, and follow-ups._
- Wallet/auth + trading capabilities are now top priority; research tools remain essential but not at the expense of wallet readiness.
- Link-code flow is retired; the connector must use the new OAuth endpoint.
- Enforce wallet scoping (even for admins) inside the API to prevent prompt-based privilege escalation.
- Avoid redundant basic vs smart tool variants—ship one definitive implementation per capability.
