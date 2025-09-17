# [ARCHIVED] Dexter MCP OAuth Linking – Legacy Link-Code Notes

> **Note (2025-02-18):** The six-character linking workflow described below has been deleted from Dexter. MCP clients now rely solely on Supabase OAuth; `/api/link/*` endpoints, linking tools, and the `/link` UI no longer exist. This document remains for historical context only.

_Last updated: 2025-09-17 07:32 UTC (legacy reference)_

## Mission Context
- **Project**: Dexter (Token-AI successor) with API (`alpha/dexter-api`), Next.js UI (`alpha/dexter-fe`), and OAuth MCP server (`alpha/dexter-mcp`).
- **Goal**: Allow Claude/ChatGPT MCP connectors to authenticate via Dexter’s OAuth flow and successfully call `generate_dexter_linking_code`, so users can link their connector identity to a Supabase/Dexter account through https://dexter.cash/link.

## Current Behaviour
1. Connectors authenticate: `/authorize` → `/token` succeeds, and `/userinfo` reports `sub=user:…`.
2. MCP server stores the identity per session (`sessionIdentity.set`), confirmed by `[identity] hit cache … issuer=https://dexter.cash/mcp sub=user:…` in logs.
3. After the handshake, when the connector tries to call any tooling (e.g. `generate_dexter_linking_code`), the client-side SDK throws `McpError: MCP error -32603: keyValidator._parse is not a function`. As a result, the tool RPC never reaches the server and the connector shows “Tool execution failed”.
4. Server logs contain no `[mcp-tool start name=generate_dexter_linking_code …]` entries; only the handshake and cache hits are present. `auth_info` still falls back to the environment wallet (`issuer=∅ subject=∅`), which is why the connector thinks authentication is incomplete.
5. Manual CLI invocations using the MCP SDK reproduce the exact failure—even with freshly minted access tokens—confirming the issue is independent of Claude/ChatGPT behaviour.

## Root Cause Identified
- The linking tool definitions in `alpha/dexter-mcp/tools/account-linking.mjs` advertise Zod schemas in a way the MCP SDK does not understand (e.g. passing raw objects rather than `z.object`, which the SDK expects to compile to JSON schema). When the client reads the tool metadata (step 1 of `pm2 run mcp:prod`), it tries to parse these schemas and trips on `keyValidator._parse`, resulting in `McpError -32603`.
- Because the client fails during tool discovery, it never issues the actual `tools/call` RPC. The server waits for a request that never arrives, and the connector displays “Tool execution failed”.

## Earlier Issues (now addressed)
- OAuth tokens were previously rejected with `Invalid token or user not authorized` due to “Bearer undefined” headers. We added guards to reject empty tokens early and reuse the session cache to prevent that; logs now show `token accepted` instead of `token rejected`.

## Next Steps
1. **Fix tool schema declarations** in `alpha/dexter-mcp/tools/account-linking.mjs` (and any other tool modules) so the MCP client can parse them. Follow the approach used in the SDK examples: export proper JSON schemas or valid Zod objects (`z.object({ … })`) that compile cleanly.
2. After adjusting the schemas, restart `dexter-mcp` and rerun the CLI smoke test (`npm run mcp:prod`). Ensure `generate_dexter_linking_code` executes and returns a code instead of “keyValidator._parse …”.
3. Once the CLI path succeeds, test with Claude/ChatGPT again. With tool metadata parseable and tokens accepted, the connector should receive the linking code and the server logs should show `mcp-tool start name=generate_dexter_linking_code …`.
4. Finally, complete the linking flow on https://dexter.cash/link and confirm `account_links`/`linking_codes` tables populate as expected.

## File Pointers
- `alpha/dexter-mcp/tools/account-linking.mjs` – faulty tool schema definitions (current blockers).
- `alpha/dexter-mcp/http-server-oauth.mjs` – OAuth handshake, token validation, session identity caching.
- `alpha/dexter-mcp/tools/wallet-auth.mjs` – `auth_info`, wallet resolution (still falls back to env when identity missing).
- `alpha/dexter-api/src/routes/linking.ts` – API endpoints used by the `/link` UI (already functioning).
- `alpha/dexter-fe/app/link/page.tsx` – front-end coping with Supabase and linking codes.

## TL;DR for the “Superfixer”
- OAuth is fine; the bearer is accepted and the session knows who the user is.
- The linking tool never runs because its schema definition breaks the MCP client before any RPC is sent (`keyValidator._parse is not a function`).
- Fix the tool metadata so the client can parse it, then the linking code will execute and the rest of the flow (UI + Supabase) can proceed.
