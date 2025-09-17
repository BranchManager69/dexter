# Dexter MCP OAuth Linking Failure – Investigation Summary

## Mission Context
- **Project**: Dexter (Token-AI successor) – split into API (`alpha/dexter-api`), Next.js UI (`alpha/dexter-fe`), and MCP server (`alpha/dexter-mcp`).
- **Goal of current workstream**: Let Claude/ChatGPT MCP connectors authenticate via OAuth, obtain a per-user identity (`issuer`, `subject`), and generate 6-character linking codes so users can bind their MCP identity to a Supabase/Dexter account via https://dexter.cash/link.
- **Progress so far**:
  - Frontend `/link` page is live and talking to the API through same-origin rewrites (solves CSP).
  - API exposes `/auth/config`, `/api/link/*`, and `/api/identity/*` and reads env vars from the repo root.
  - MCP server is running from `alpha/dexter-mcp/http-server-oauth.mjs` under PM2, with OAuth endpoints `/authorize`, `/token`, `/userinfo`, etc.

## The Symptom We’re Chasing
- When a connector client (Claude or ChatGPT) calls `generate_dexter_linking_code`, the tool returns `no_oauth_identity` and the connector echoes “Tool execution failed”.
- `list_my_wallets` fails for the same reason. `auth_info` always “works” because it falls back to an environment wallet; therefore users see misleading success (“wallet_id resolved”) even though no OAuth subject is flowing through.

## What the Logs Reveal
1. **OAuth handshake does happen**:
   ```
   [oauth] authorize request query=?response_type=code...
   [oauth] token grant type=authorization_code
   ```
   We store the subject per session (`sessionIdentity.set()`), e.g. `issuer=https://dexter.cash/mcp sub=user:db9064f2a677`.

2. **On tool calls** we see repeated cache hits:
   ```
   [identity] hit cache sid=<guid> issuer=https://dexter.cash/mcp sub=user:...
   ```
   confirming the subject lives in the session map.

3. **But when `auth_info` runs** it reports:
   ```json
   { "source": "env", "wallet_id": "e92af215-d498-47aa-b448-e649752f874c", "session_id": "stdio", "issuer": "∅", "subject": "∅" }
   ```
   meaning the HTTP request that reached `wallet-auth.mjs`’s handler carried *no* `x-user-issuer`/`x-user-sub` headers and no `__issuer`/`__sub` payload.

4. We inserted instrumentation inside `generate_dexter_linking_code` to log when no identity arrives, expecting:
   ```
   [linking] missing identity { issuer: '', subject: '', args: {...}, sid: ..., headers: {...} }
   ```
   but that log never appears because the connector never delivers the tool invocation (it errors before the MCP handler runs).

## What Changed in the Repo
- UI: rewrites + relative API origin to pass CSP.
- API: new routes & env loading.
- MCP tooling (`account-linking.mjs`): added `getIdentity(args, extra)` to read identity from body (`__issuer`, `__sub`, `__email`) in addition to headers and log missing identity cases.
- MCP restarts performed after each code change.

## Confirmed Facts
- Supabase `.env` values exist only at repo root; all services load from there.
- OAuth auto-approval is in place (no consent UI); connectors get codes and tokens successfully.
- Session identity map is populated (`sessionIdentity` has `issuer/sub` per session ID).
- Tool arguments arriving from Claude do **not** include `__issuer` / `__sub`; at least they didn’t reach the handler files (no logs yet).
- Connectors probably short-circuit the call before hitting our HTTP endpoint when they detect missing identity, returning “Tool execution failed” client-side.

## Outstanding Unknowns
1. **Where the identity is dropped**: We see it in the session cache, but not in the request body/headers that reach the tool. Possibilities:
   - Claude never injects the subject into JSON—maybe it expects `userinfo` to supply certain claims we aren’t providing.
   - Our `injectIdentityIntoBody` call in `http-server-oauth.mjs` might not be triggered for subsequent POSTs if the connector bypasses it (e.g., client returns early).
2. **Connector behavior**: The “Tool execution failed” message may be happening before any HTTP request is made. Need to confirm by capturing a HAR or using `npm run mcp:prod` to simulate a call.
3. **Userinfo claims**: We currently return whatever `validateTokenAndClaims` gives us—ensure `sub`, `email`, etc., are present so connectors trust the identity.
4. **Linking flows**: Without a successful tool call, no linking code is written to `linking_codes` table—front-end link page can’t complete.

## Repro Steps (Claude)
1. Connect the Dexter MCP connector (auto authorizes).
2. Run `generate_dexter_linking_code` → Claude responds “Tool execution failed”; MCP log shows handshake + cache hits but **no** tool invocation lines.
3. Run `auth_info` → returns env wallet, logging `[mcp-tool] ok name=auth_info... structured=... issuer=∅ subject=∅ bearer=∅`.

Same behavior on ChatGPT connector (messages reference the same env wallet ID).

## Initial Hypotheses
- Claude/ChatGPT require the `/userinfo` response to contain specific fields or map the token to an email; if missing, they treat the session as unauthenticated and refuse tool calls.
- We may need to register the MCP client and use their documented OAuth flows rather than relying on “auto approve” built-in provider.
- Alternatively, connectors expect `x-user-id` (or similar) and we’re naming headers differently. Need to inspect official connector docs.

## Next Steps for a “Superfixer”
1. **Capture actual connector HTTP traffic** to confirm whether `generate_dexter_linking_code` ever hits the server (check access logs or run `npm run mcp:prod` to reproduce manually).
2. **Verify `/userinfo` output**: ensure it returns a JSON body with `sub`, `email`, and any provider-specific fields the connectors expect. Compare to their documentation/examples.
3. **Force identity injection**: inside `StreamableHTTPServerTransport.handleRequest`, log the raw body/headers for any POST to confirm whether `injectIdentityIntoBody` is executing.
4. **Adjust OAuth provider behavior** if needed (e.g., persist tokens, include id_token with desired claims, or change header names) so connectors pick up the subject.
5. Once identity flows correctly, re-test `generate_dexter_linking_code` and follow the linking cycle (code → `/link` page → `account_links` write) end-to-end.

## Key Files
- `alpha/dexter-mcp/http-server-oauth.mjs` – transport/OAuth logic, identity caching, request injection.
- `alpha/dexter-mcp/tools/account-linking.mjs` – linking tools (requires issuer/sub).
- `alpha/dexter-mcp/tools/wallet-auth.mjs` – `auth_info`, `list_my_wallets`, wallet resolution logic.
- `alpha/dexter-api/src/routes/linking.ts` and `identity.ts` – REST endpoints the UI relies on.
- `alpha/dexter-fe/app/link/page.tsx` – frontend linking UI.

## TL;DR for Superfixer
- Connectors **authenticate**, but when they call account-linking tools they never deliver the OAuth identity to the handler, so the tools bail with `no_oauth_identity`.
- Need to determine why the subject is lost between session init (where we have it) and tool invocation; most likely a mismatch with connector expectations (`userinfo`/claims or header names).
- Fix identity propagation so `generate_dexter_linking_code` reaches the DB, then verify the rest of the linking flow.
