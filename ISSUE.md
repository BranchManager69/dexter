# Dexter MCP OAuth Linking Failure – Investigation Summary

_Last updated: 2025-09-17 07:05 UTC_

## Mission Context
- **Project**: Dexter (Token-AI successor) – services split across `alpha/dexter-api`, `alpha/dexter-fe`, and `alpha/dexter-mcp`.
- **Objective**: Allow Claude/ChatGPT MCP connectors to authenticate via OAuth, obtain a stable identity (`issuer`, `sub`), and generate 6-character linking codes so users can bind their MCP identity to a Supabase/Dexter account through https://dexter.cash/link.

## Current Behaviour
- Connectors can connect and run `auth_info` (falls back to the environment wallet), but `generate_dexter_linking_code` and `check_dexter_account_link` always return `no_oauth_identity` → “Tool execution failed”.
- MCP logs show repeated session cache hits (`issuer=https://dexter.cash/mcp sub=user:…`) but no logging from inside the linking tool (meaning the tool is never reached, or the identity is stripped before the handler executes).
- When the tools fall back to the environment wallet, logs show `issuer=∅ subject=∅ bearer=∅`, which matches what the connectors display.

## What We’ve Confirmed
1. **OAuth handshake works**: `/authorize` issues a code, `/token` returns access + refresh tokens, `/userinfo` echoes `sub` (format `user:xxxxxxxxxxxx`).
2. **Session cache contains the subject**: every new connector session logs `[identity] headers sid=… issuer=https://dexter.cash/mcp sub=user:…` followed by cache hits.
3. **Manual reproduction**:
   - Ran PKCE flow by hand, obtained `access_token=atk_…` and `refresh_token=rtk_…`.
   - Immediately attempted to call `generate_dexter_linking_code` using the MCP client SDK against `https://dexter.cash/mcp`.
   - Server responded `HTTP 401 {"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid token or user not authorized"}}`.
   - Therefore, the failure happens on our side: after issuing the token, `validateTokenAndClaims` rejects it before any tool handler runs.
4. **Logging instrumentation**: added logs around `validateTokenAndClaims`. After the restart we see:
   - `[oauth] validate token start { token: '…' }`
   - `[oauth] token rejected { token: '…' }`
   indicating the access token is never recognized when the tool request arrives.

## Hypothesis
- The access token we mint is stored in process memory (`issuedTokens.set(accessToken, …)`), but subsequent tool requests either:
  - arrive without an `Authorization: Bearer …` header (e.g., connector or client dropped it), or
  - present a token that the server no longer knows about (process restart cleared `issuedTokens`, or we trimmed/changed the token before storing), or
  - `validateTokenAndClaims` is looking for a different identity claim (e.g., expects `email`, which `/userinfo` does not return).
- Because the MCP server rejects the token outright, the tool handler never executes, which is why the `[linking] missing identity` log never appears.

## Next Steps (Actionable)
1. **Trace `validateTokenAndClaims` end-to-end**:
   - Log the raw `Authorization` header and token value right before validation.
   - Log whether we find a matching entry in `issuedTokens` or rely on `/userinfo`.
   - Confirm that the token stored during `/token` handling is exactly what the client later presents.
2. **Ensure token persistence across requests**:
   - If PM2 restarts the MCP process, all in-memory tokens disappear. Decide whether to persist tokens (e.g., Redis) or document that long-lived tokens aren’t supported.
   - Short term: test again without restarting between `/token` and the tool call to rule out this issue.
3. **Verify `/userinfo` output**:
   - It currently returns `{ sub, scope }`. Claude/ChatGPT may expect `email` or other claims. Consider adding email if known, or mirror Clanka’s behaviour.
4. **Rerun manual tool call once validation is fixed**:
   - When `validateTokenAndClaims` accepts the token, call `generate_dexter_linking_code` again and capture the response/logs.
5. **Only after tokens are accepted** retest with Claude/ChatGPT to confirm the connectors receive a real linking code.

## File Pointers
- `alpha/dexter-mcp/http-server-oauth.mjs` – OAuth flow, token storage, identity injection.
- `alpha/dexter-mcp/tools/account-linking.mjs` – linking tools (expects issuer/sub via headers or `__issuer`/`__sub`).
- `alpha/dexter-mcp/tools/wallet-auth.mjs` – `auth_info`, `list_my_wallets`, wallet resolution.
- `alpha/dexter-fe/app/link/page.tsx` – user-facing linking UI.
- `alpha/dexter-api/src/routes/linking.ts` – REST endpoints consumed by the UI.

## TL;DR for the “Superfixer”
- OAuth tokens are being minted, but the MCP server rejects them on subsequent tool calls (`HTTP 401 Invalid token or user not authorized`).
- Until `validateTokenAndClaims` accepts the self-issued token and the tool handler actually runs, connectors will keep failing.
- Focus on debugging why access tokens are not recognized immediately after issuance (header propagation, token storage, `/userinfo` claim set, restarts).
