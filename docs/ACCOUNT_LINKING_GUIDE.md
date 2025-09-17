# Dexter Account Linking System (Supabase OAuth)

This guide documents the **current** connector authentication flow. The old six-character link-code workflow has been removed; MCP clients now authenticate purely through Supabase OAuth delivered by the Dexter MCP server.

## 1. High-Level Flow

1. Claude/ChatGPT initiates OAuth with the Dexter MCP server.
2. `/api/connector/oauth/authorize` responds with the Dexter login URL.
3. The user signs in through the standard Supabase magic-link flow.
4. The connector exchanges the Supabase refresh token at `/api/connector/oauth/token` and receives a bearer.
5. Subsequent MCP calls send that bearer, which the API resolves to managed wallets via `/api/wallets/resolver`.

There are **no** linking codes, `/api/link/*` endpoints, or static `/link` UI involved anymore.

## 2. Testing Checklist

### 2.1 OAuth Handshake
- `npm run mcp:prod` (from repo root) to exercise the CLI smoke test.
- Confirm logs in `~/.pm2/logs/dexter-mcp-out.log` show `token accepted` and a session identity with `issuer` and `sub`.

### 2.2 Wallet Resolution
- Call the `auth_info` MCP tool; expect `source="resolver"` and a Supabase `user_id`.
- `list_my_wallets` should return the wallets from `/api/wallets/resolver`.

### 2.3 Web Header Login
- Visit any Next.js page and select **Sign in** in the header. A magic link should arrive; after confirmation the header shows the account email.

## 3. Database Snapshot

Only these tables remain involved in authentication:
- `managed_wallets`
- `oauth_user_wallets`

Legacy tables `account_links` and `linking_codes` were dropped in February 2025. Historical data, if any, should be archived off-database before deploying the migration.

## 4. Deployment Notes

1. Apply the Prisma migration `20250218_drop_account_link_tables` (see `prisma/migrations/`).
2. Restart services via PM2:
   ```bash
   pm2 restart dexter-api dexter-fe dexter-mcp
   pm2 save
   ```
3. Re-run `npm run mcp:prod` to confirm the OAuth flow is still healthy.

## 5. Troubleshooting

| Symptom | Check |
|---------|-------|
| Connector says “Tool execution failed” immediately | Inspect MCP logs for bearer validation errors. Ensure `/api/connector/oauth/token` received a valid Supabase refresh token. |
| `auth_info` reports `source="env"` | The connector bearer was missing or invalid; re-authenticate through the MCP authorize flow. |
| Header sign-in modal spins forever | Verify `/auth/config` is reachable (Next.js rewrite to API origin) and Supabase env vars are present. |
| Wallet tools show empty list | Confirm the Supabase user has entries in `oauth_user_wallets` after the connector signs in. |

## 6. Cleanup Reminders

- The `token-ai/server.js` legacy server no longer exposes `/link`; the static HTML was removed.
- Any scripts or docs referencing linking codes should be archived or updated. Search for `linking_code` or `/api/link/` to catch stragglers.

For historical reference, see Git history before commit `2025-02-18` to revisit the legacy code-based flow.
