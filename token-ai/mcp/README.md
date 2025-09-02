# Token‑AI MCP Servers (Unified /mcp)

This folder contains the Model Context Protocol (MCP) servers for Token‑AI. The unified public endpoint lives at `/mcp` using the official Streamable HTTP transport. OAuth is supported for user-facing connectors (Claude), and a bearer token is supported for backend/API usage (OpenAI Responses, Node SDK, UI proxy).

- Streamable HTTP + OAuth: `mcp/http-server-oauth.mjs`
- Bearer-only HTTP (optional): `mcp/http-server.mjs`
- Stdio server (optional/local): `mcp/server.mjs`
- Shared tool registration: `mcp/common.mjs`

Legacy note: The old ChatGPT-specific SSE server (`mcp/http-server-chatgpt.mjs`) is archived under `mcp/_archive/` and no longer used in Dexter.

## Quick Start

- Install deps once in this repo: `npm install`
- Stdio MCP (spawned by client): `npm run mcp`
- HTTP MCP (listens on a port): `npm run mcp:http`
- Smoke tests:
  - Stdio: `npm run test:mcp`
  - HTTP: `npm run test:mcp:http`

PM2 services (already set up during development):
- `token-ai-mcp-stdio`: `node mcp/server.mjs`
- `token-ai-mcp-http`: `node mcp/http-server.mjs`
- Manage: `pm2 status`, `pm2 logs <name> --lines 100`, `pm2 restart <name>`

## Endpoints and Transports

### Stdio
- Typical for local tools: MCP client spawns `node /abs/path/to/token-ai/mcp/server.mjs`
- No port or network; lifecycle bound to client process

### HTTP (Streamable HTTP)
- URL: `http://localhost:${TOKEN_AI_MCP_PORT:-3928}/mcp`
- Auth: Bearer token via `TOKEN_AI_MCP_TOKEN` or OAuth bearer (when OAuth enabled)
- CORS: `TOKEN_AI_MCP_CORS` (default `*`) and `Mcp-Session-Id` exposed
- Implementation: `mcp/http-server-oauth.mjs` using `StreamableHTTPServerTransport`

### HTTP (OAuth variant)

- Start: `npm run mcp:http:oauth`
- Metadata endpoints (when `TOKEN_AI_MCP_OAUTH=true`):
  - `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`
- Provider: Generic OIDC. Configure your own identity provider (Auth0/Okta/Google/Keycloak/etc.) via env vars below. GitHub is supported only if explicitly configured and is no longer the default.
- Client flow:
  1. ChatGPT (or another MCP client) performs OAuth Authorization Code + PKCE with your OIDC provider.
  2. Initialize: POST to `/mcp` with `Authorization: Bearer <token>`.
     - Server returns `Mcp-Session-Id` header.
  3. Subsequent POST/GET: include `Mcp-Session-Id: <id>`; Authorization may be omitted (session reuse).
  4. Optional: `MCP-Protocol-Version: 2025-06-18` header per spec.
- Backwards-compatible: stdio flow unchanged; `mcp/http-server.mjs` (bearer-only) can keep running in parallel.

#### Claude/ChatGPT Connector Setup

Connect Claude/ChatGPT directly to this MCP server:

- Direct: `Server URL: https://your.host/mcp`.
  - Env on the OAuth server:
    - `TOKEN_AI_MCP_OAUTH=true`
    - `TOKEN_AI_MCP_PUBLIC_URL=https://your.host/mcp`
    - OIDC provider config (choose one):
      - Auth0/Okta/Keycloak/etc.: set `TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT`, `TOKEN_AI_OIDC_TOKEN_ENDPOINT`, `TOKEN_AI_OIDC_USERINFO`, and optionally `TOKEN_AI_OIDC_ISSUER`, `TOKEN_AI_OIDC_JWKS_URI`, `TOKEN_AI_OIDC_SCOPES` (default `openid profile email`), `TOKEN_AI_OIDC_CLIENT_ID`, `TOKEN_AI_OIDC_IDENTITY_CLAIM` (e.g., `email`), `TOKEN_AI_OIDC_ALLOWED_USERS` (CSV allowlist, optional).
      - GitHub (legacy): set `TOKEN_AI_MCP_GITHUB_CLIENT_ID`/`TOKEN_AI_MCP_GITHUB_CLIENT_SECRET` only if using GitHub.
  - OAuth discovery is served at both:
    - `https://your.host/.well-known/oauth-authorization-server`
    - `https://your.host/.well-known/openid-configuration`
  - Callback accepted at `/callback` and `/mcp/callback`.

Notes:
- ChatGPT currently exposes only two canonical tools by design: `search` and `fetch`. We provide both with the exact shape it expects (content[0].type="text" with JSON string payloads).
- Do not point ChatGPT to `/mcp-proxy`.

Note: `/mcp-proxy` is designed for the browser UI (it requires a short‑lived `userToken` query param). ChatGPT cannot supply that param, so do not use `/mcp-proxy` as the ChatGPT Server URL.

Identity → wallet mapping
- With OAuth, the server maps an identity claim from your OIDC provider (default `sub`, configurable via `TOKEN_AI_OIDC_IDENTITY_CLAIM`, e.g., `email`) into `X-User-Token` so tools like `resolve_wallet` and `auth_info` work per user.
- If you prefer static mapping, set `TOKEN_AI_MCP_BEARER_MAP_JSON` or `TOKEN_AI_MCP_BEARER_MAP` on the MCP server.


## Environment Variables

- `TOKEN_AI_MCP_PORT` (default: `3928`): HTTP port
- `TOKEN_AI_MCP_TOKEN` (optional): Bearer token required if set
- `TOKEN_AI_MCP_CORS` (default: `*`): Allowed origin(s)
- `TOKEN_AI_MCP_OAUTH` (default: `false`): Enable OAuth mode (http-server-oauth)
- `TOKEN_AI_MCP_PUBLIC_URL`: Public base URL for `.well-known` + callback (e.g., `https://example.com/mcp`)
- `TOKEN_AI_DEMO_MODE` (default: `0`): When `1`, allows the server‑injected bearer from `/mcp-proxy` without contacting an external IdP. Intended for demo/browser UI flows.
- `MCP_USER_JWT_SECRET`: HS256 secret used by the UI server to mint short‑lived per‑user tokens (`/mcp-user-token`). Required for `/mcp-proxy`.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: For UI magic‑link login; used by `/auth/config` and `/mcp-user-token`.

OIDC provider (recommended for ChatGPT Connectors):
- `TOKEN_AI_OIDC_ISSUER` (optional): Issuer string for metadata
- `TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT`: OAuth authorization endpoint
- `TOKEN_AI_OIDC_TOKEN_ENDPOINT`: OAuth token endpoint
- `TOKEN_AI_OIDC_USERINFO`: OIDC userinfo endpoint (used for token validation)
- `TOKEN_AI_OIDC_REGISTRATION_ENDPOINT` (optional): Dynamic Client Registration endpoint (RFC 7591)
- `TOKEN_AI_OIDC_JWKS_URI` (optional): JWKS URI (for future JWT validation)
- `TOKEN_AI_OIDC_SCOPES` (default: `openid profile email`): Requested scopes
- `TOKEN_AI_OIDC_CLIENT_ID`: OAuth client ID registered with your IdP
- `TOKEN_AI_OIDC_IDENTITY_CLAIM` (default: `sub`): Claim to use as identity (e.g., `email`)
- `TOKEN_AI_OIDC_ALLOWED_USERS` (optional CSV): Allowlist of identities (matching the identity claim)

Legacy GitHub (only if explicitly configured):
- `TOKEN_AI_MCP_GITHUB_CLIENT_ID` / `TOKEN_AI_MCP_GITHUB_CLIENT_SECRET`
- `TOKEN_AI_MCP_GITHUB_ALLOWED_USERS` (optional CSV)

Dev/testing:
- `TOKEN_AI_MCP_OAUTH_ALLOW_ANY=1` to accept any Bearer token without calling an IdP (NOT for production). When `TOKEN_AI_DEMO_MODE=1`, allow‑any behavior is implied for the server‑injected bearer only; arbitrary public tokens are still denied.

OpenAI Responses API (critical):
- The MCP tool definition must include both the full `server_url` path and an `authorization` value on every request. Example curl:

```bash
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "o4-mini-deep-research",
    "input": [{"role":"user","content":[{"type":"input_text","text":"find latest DUEL analysis"}]}],
    "tools": [
      {
        "type": "mcp",
        "server_label": "clanka",
        "server_url": "https://your.host/mcp",
        "authorization": "'$TOKEN_AI_MCP_TOKEN'",
        "allowed_tools": ["search","fetch"],
        "require_approval": "never"
      }
    ]
  }'
```

Browser UI integration (served by token-ai/server.js):

Browser UI integration (served by token-ai/server.js):
- `GET /auth/config` → exposes Supabase URL and anon key to the browser
- `GET /mcp-user-token` → mints short‑lived per‑user JWT (uses Supabase session when available; falls back to `demo` when `TOKEN_AI_DEMO_MODE=1`)
- `ALL /mcp-proxy` → enforces `?userToken=…` and injects backend bearer to MCP; normalizes Accept and preserves `Mcp-Session-Id`.

- `TOKEN_AI_MAX_CONCURRENCY` (default: `3`): Max concurrent analyzer runs
- `TOKEN_AI_CHILD_MAX_MB` (default: `1024`): Memory cap for analyzer/subprocesses
- `TOKEN_AI_LOGS_PER_RUN_LIMIT` (default: `200`): Per‑run log ring buffer length

## Routing and Discovery

Public base: `https://<host>/mcp`
- GET/POST `/mcp` → Streamable HTTP transport
- `/mcp/*` → OAuth endpoints and resources (authorize, token, userinfo, callback, well‑known)
- Root discovery mirrors:
  - `/.well-known/oauth-authorization-server`
  - `/.well-known/openid-configuration`

Nginx tips
- `location = /mcp` → `proxy_pass http://127.0.0.1:3928/mcp`
- `location ^~ /mcp/` → `proxy_pass http://127.0.0.1:3928$request_uri`
- Expose/allow `Mcp-Session-Id` in CORS/headers; disable buffering for long streams

## Tools

All tools are registered in `mcp/common.mjs` using `@modelcontextprotocol/sdk`.

ChatGPT canonical
- `search(query: string)` → returns `content: [{ type: "text", text: "{\"results\":[{id,title,url}]}" }]`
- `fetch(id: string)` → returns `content: [{ type: "text", text: "{\"id\",\"title\",\"text\",\"url\",\"metadata\":{...}}" }]`

- `list_reports_page(limit?, cursor?)`:
  - Purpose: Paginate through all reports; returns opaque `nextCursor` for the next page
  - Input: `{ limit?: number, cursor?: string }` (default limit 24)
  - Output: `{ uris: string[], nextCursor?: string }`

- `list_resource_uris(limit?)`:
  - Purpose: Quickly browse recent report URIs (report:// scheme)
  - Input: `{ limit?: number }` (default 24)
  - Output: `{ uris: string[] }`

- `list_recent_analyses(limit?)`:
  - Purpose: Summarize recent saved analyses from `reports/ai-token-analyses/`
  - Output: `{ items: { mint, branchScore, riskScore, duration_ms, file, mtime }[] }`

- `get_report(filename?, mint?)`:
  - Purpose: Fetch one report by filename or by token mint (best recent match)
  - Output: `{ file, mtime, data }`

- `get_latest_analysis()`:
  - Purpose: Latest report JSON
  - Output: `{ file, mtime, data }`

- `read_report_uri(uri)`:
  - Purpose: Read one report via its `report://` URI
  - Input: `{ uri: string }`
  - Output: `{ file, mtime, data }`

- `run_agent(mint, flags?)`:
  - Purpose: Spawn `node index.js <mint> [flags...]`
  - Inputs (reasoning knobs supported): `reasoning_level?`, `reasoning_policy?`, `initial_reasoning?`, `refine_reasoning?`, `finalize_reasoning?`
  - Output: `{ pid, startedAt }` (de‑dups if same mint already running)

- `run_socials(mint, steps?, x_concurrency?)`:
  - Purpose: Spawn `node socials/orchestrator.js <mint> [--steps=…] [--x-concurrency=…]`
  - Output: `{ pid, startedAt }`

- `list_runs()`:
  - Purpose: List active child processes started by these tools
  - Output: `{ active: { pid, mint, kind, startedAt }[] }`

- `get_run_logs(pid, limit?)`:
  - Purpose: Tail recent logs for a PID (ring‑buffered)
  - Output: `{ pid, mint, logs: { stream, line, at }[] }`

- `kill_run(pid)`:
  - Purpose: Terminate a running child; SIGTERM then SIGKILL fallback
  - Output: `{ ok: boolean }`

### Trading Tools

- `list_wallet_token_balances(wallet_id, min_ui?, limit?)`:
  - Purpose: Enumerate wallet balances (native SOL and SPL token accounts) to plan sells.
  - Output: `{ items: [{ mint, ata, decimals, amount_ui, amount_raw }] }` sorted by `amount_ui`.
    - SOL appears with `mint=So1111…12` and `ata="native"`.

- `smart_buy(wallet_id, token_mint, sol_amount? | out_amount_ui?, use_exact_out?, input_mints?, slippages_bps?, priority_lamports?, max_price_impact_pct?)`:
  - Purpose: Robust buy helper with slippage ramp and optional ExactOut.
  - ExactIn: provide `sol_amount` (defaults `input_mints: [SOL]`, `slippages_bps: [100,200,300]`).
  - ExactOut: set `use_exact_out: true` and provide `out_amount_ui`.
  - Output: `{ success, tx_hash, tokens_bought_ui, in_mint, in_amount_ui, slippage_bps_used, price_impact, solscan_url }`.

- `smart_sell(wallet_id, token_mint, token_amount? | percent_of_balance?, outputs?, slippages_bps?, priority_lamports?)`:
  - Purpose: Robust sell helper; tries `outputs` (defaults `[SOL, USDC]`) and `slippages_bps` (defaults `[100,200,300]`).
  - Output: `{ success, tx_hash, out_mint, out_amount_ui, tokens_sold_ui, slippage_bps_used, solscan_url }`.

- `trade(action, wallet_id, token_mint, ...)`:
  - Purpose: Unified entrypoint wrapping smart_buy/smart_sell.
  - Buy: `action: 'buy'` with `sol_amount` (ExactIn) or `use_exact_out: true, out_amount_ui` (ExactOut). Optional `input_mints`, `slippages_bps`, `max_price_impact_pct`.
  - Sell: `action: 'sell'` with `token_amount` or `percent_of_balance`. Optional `outputs`, `slippages_bps`.
  - Output: `{ success, tx_hash, detail, solscan_url }`.

## Resources

- URI Templates:
  - `report://ai-token-analyses/{file}` (JSON reports, by filename)
  - `report://ai-token-analyses/by-mint/{mint}` (resolve most recent report for a mint)
- List: MCP `resources/list` returns recent reports as resource links
- Read: MCP `resources/read` returns `{ contents: [{ uri, mimeType: 'application/json', text }] }`
- Related tool: `list_resource_uris` returns the same URIs as plain strings for quick browse or LLM planning

## Using With MCP Clients

- Stdio‑mode clients (spawn the server): configure the command to `node /abs/path/to/token-ai/mcp/server.mjs`
- HTTP‑mode clients: point to `http://host:3928/mcp`, add `Authorization: Bearer <TOKEN_AI_MCP_TOKEN>` if set
- Capabilities: tools, resources, prompts (no prompts registered currently), logging

### Agent Reasoning Controls (MCP Quick Ref)

Tools that accept reasoning knobs: `run_agent`, `run_agent_quick`.

- Inputs (knobs):
  - `reasoning_level`: `low|medium|high`
  - `reasoning_policy`: `quick|balanced|thorough`
  - `initial_reasoning`, `refine_reasoning`, `finalize_reasoning`: per‑phase overrides
- Precedence: per‑phase > global (`reasoning_level`) > policy > dynamic/default.

Examples
- Balanced policy:
  - name: `run_agent`
  - args: `{ mint: "<MINT>", reasoning_policy: "balanced" }`
- Fast iteration:
  - name: `run_agent_quick`
  - args: `{ mint: "<MINT>", reasoning_level: "low" }`
- High finalize only:
  - name: `run_agent`
  - args: `{ mint: "<MINT>", initial_reasoning: "low", refine_reasoning: "low", finalize_reasoning: "high" }`

### CLI Usage (no Codex required)

Run trading tools via npm scripts that wrap the MCP stdio server, auto‑loading env from the monorepo `.env`.

- List balances
  - `npm run mcp:balances -- <WALLET_ID> --min-ui=0.000001 --limit=10`

- Buy (ExactIn)
  - `npm run mcp:buy -- <WALLET_ID> <MINT> --sol=0.0005 --slippage=150,250,300`

- Buy (ExactOut)
  - `npm run mcp:buy -- <WALLET_ID> <MINT> --exact-out --out=0.1`

- Sell (robust)
  - `npm run mcp:sell -- <WALLET_ID> <MINT> --pct=10 --outputs=So1111...,EPjF... --slippage=100,200,300 --max-impact=1.0`

- Unified trade
  - `npm run mcp:trade -- buy <WALLET_ID> <MINT> --sol=0.0003`
  - `npm run mcp:trade -- sell <WALLET_ID> <MINT> --pct=10`

### Trading Quick Start

- List balances for a wallet:
  - name: `list_wallet_token_balances`
  - args: `{ wallet_id: "<WALLET_ID>", min_ui: 0.000001, limit: 10 }`

- Buy (ExactIn):
  - name: `smart_buy`
  - args: `{ wallet_id: "<WALLET_ID>", token_mint: "<MINT>", sol_amount: 0.0005, slippages_bps: [150,250,300] }`

- Buy (ExactOut):
  - name: `smart_buy`
  - args: `{ wallet_id: "<WALLET_ID>", token_mint: "<MINT>", use_exact_out: true, out_amount_ui: 0.1 }`

- Sell (robust):
  - name: `smart_sell`
  - args: `{ wallet_id: "<WALLET_ID>", token_mint: "<MINT>", percent_of_balance: 10, outputs: ["So1111…12","EPjF…tZ8"], slippages_bps: [100,200,300] }`

- Unified trade:
  - name: `trade`
  - args: `{ action: "buy", wallet_id: "<WALLET_ID>", token_mint: "<MINT>", sol_amount: 0.0003 }`
  - name: `trade`
  - args: `{ action: "sell", wallet_id: "<WALLET_ID>", token_mint: "<MINT>", percent_of_balance: 10 }`

## Deep Research

Build research reports via search, fetch/crawl, notes, and report finalization.

### Tools

- `web_search(query, topN?, timeRange?)` → organic results
- `fetch_url(url, mode?)` → readability text, links, meta (or raw html)
- `fetch_url_rendered(url, wait_ms?, scroll_steps?, scroll_delay_ms?)` → headless-rendered extraction (Playwright)
- `smart_fetch(url, min_len?, rendered_wait_ms?, rendered_scroll_steps?, rendered_scroll_delay_ms?)` → fallback to rendered if static too short
- `crawl_site(root_url, max_pages?, depth?, same_origin?, delay_ms?)` → pages
- `crawl_urls(urls[], concurrency?, delay_ms?)` → pages
- `write_note(text, source_uri?, tags?)`, `list_notes(query?, limit?)`, `read_note(id)`, `delete_note(id)`
- `finalize_report(title, outline?, include_notes?, extra_context?)` → research://deep-research/{file}.json
- `run_agent_quick(mint)` → fast local analysis (web-search + ohlcv)
- `wait_for_report_by_mint(mint, timeout_sec?, poll_ms?)` → block until new ai-token-analyses report appears

### Example Flow

1) Search → Fetch/Crawl
   - `npm run mcp:search -- "solana jupiter aggregator" --topN=8`
   - `npm run mcp:fetch -- https://docs.jup.ag/`
   - `npm run mcp:crawl:site -- https://docs.jup.ag --max=6 --depth=1`

2) Capture Highlights as Notes
   - `npm run mcp:note:write -- "Jupiter supports ExactOut quoting." --source=https://docs.jup.ag/ --tags=jupiter,exactout`
   - `npm run mcp:note:list -- --query=jupiter --limit=10`

3) Optional: Trigger Local Quick Analysis for a Mint
   - `npm run mcp:run:quick -- <MINT>`
   - `npm run mcp:wait:mint -- <MINT> --timeout=600 --poll=1500`

4) Finalize Report
   - `npm run mcp:finalize -- "Deep Research: <Topic>" --outline=Overview|Risks --include=<noteId1>,<noteId2> --extra="Focus on sell routes."`

### Webhooks (Optional)

Enable push notifications from MCP research actions:
- Set `RESEARCH_WEBHOOK_URL` and optional `RESEARCH_WEBHOOK_TOKEN` in env.
- Events emitted: `analysis:run_started`, `analysis:report_ready`, `research:report_finalized`.

To ingest OpenAI Background Mode webhooks from the OpenAI platform:
- Configure your project webhook to `POST /openai/webhook`.
- Set `OPENAI_WEBHOOK_SECRET` (or `OPENAI_WEBHOOK_KEY`) in env.
- The server verifies signatures and broadcasts events to Live UI WS (subtype `openai_webhook`).

## Security Notes

- Always set `TOKEN_AI_MCP_TOKEN` before exposing HTTP MCP beyond localhost
- Consider proxy‑side auth and IP allowlists; set `TOKEN_AI_MCP_CORS` to a strict origin
- The server spawns local processes for `run_agent`/`run_socials`; do not expose publicly without controls
- Toggle run tools: set `TOKEN_AI_MCP_ENABLE_RUN_TOOLS=0` to hide run/kill tools (read‑only mode)

## Troubleshooting

- Tool schema errors: SDK validates inputs/outputs; messages like “Invalid structured content …” suggest a mismatch—open an issue with the tool name and payload
- Concurrency limit: If you see `concurrency_limit (N)`, reduce running jobs or increase `TOKEN_AI_MAX_CONCURRENCY`
- Memory cap: Child processes inherit `--max-old-space-size=${TOKEN_AI_CHILD_MAX_MB}`; raise if you see OOMs
- HTTP auth failures: Ensure `Authorization: Bearer <TOKEN_AI_MCP_TOKEN>` header is present if token is set
- SSE not used: HTTP GET `/mcp` SSE stream is optional; clients may operate without it

## Development

- Edit `mcp/common.mjs` to add or change tools/resources
- Run `npm run test:mcp` and `npm run test:mcp:http` to verify
- Restart PM2 services after changes:
  - `pm2 restart token-ai-mcp-stdio`
  - `pm2 restart token-ai-mcp-http`

## License

This project is part of the Token‑AI toolset; see the repo’s main license and guidelines.
- `run_agent_quick(mint, extra_flags?)`:
  - Purpose: Quick agent run (web-search + OHLCV fast path) for faster iterations
  - Inputs: `extra_flags?`, reasoning knobs (`reasoning_level?`, `reasoning_policy?`, `initial_reasoning?`, `refine_reasoning?`, `finalize_reasoning?`)
  - Output: `{ pid, startedAt }`

- `run_socials_step(mint, step)` and convenience wrappers `run_socials_market|website|telegram|x`:
  - Purpose: Run a single socials step to avoid the full orchestrate when not needed
  - Inputs: `step in [market, website, telegram, x]`, `x_concurrency?`
  - Output: `{ pid, startedAt, step }`
### Reasoning Controls (Agent)

- Global override: `reasoning_level=low|medium|high`
- Per‑phase: `initial_reasoning`, `refine_reasoning`, `finalize_reasoning`
- Policy: `reasoning_policy=quick|balanced|thorough`
- Precedence: per‑phase > global > policy > dynamic/default.
