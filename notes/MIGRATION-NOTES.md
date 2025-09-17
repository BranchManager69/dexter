MCP OAuth Wallet Linking – Migration Notes

Summary
- Added oauth_user_wallets table (Prisma) to bind OAuth identities → managed wallets.
- Added MCP tools to manage links: list_my_wallets, link_wallet_to_me, set_my_default_wallet, unlink_wallet_from_me.
- Trading tools now resolve wallet via (session override → OAuth link → bearer-map → env default).
- No switch to Supabase yet (least‑destructive path). Local Postgres was migrated.

Schema
- New model: oauth_user_wallets
  - id (uuid, pk)
  - provider (issuer string, e.g., https://dexter.cash/mcp)
  - subject (OIDC sub)
  - email (optional)
  - wallet_id (fk managed_wallets.id)
  - default_wallet (bool)
  - created_at, updated_at
  - Unique (provider, subject, wallet_id)
  - Index (provider, subject)

Code changes
- Wallet resolution:
  - resolveWalletIdOrNull added in alpha/dexter-mcp/tools/trading.mjs; used by all trading tools.
  - http-server-oauth now forwards x-user-issuer, x-user-sub, x-user-email when available.
  - list_managed_wallets filters to caller’s linked wallets unless admin or include_admin.
  - Admins: configured via ADMIN_EMAILS / ADMIN_OAUTH_SUBS / ADMIN_BEARERS.

New MCP tools
- list_my_wallets() → { wallets: [{ id, public_key, wallet_name, is_default }] }
- link_wallet_to_me(wallet_id, make_default?) → { ok }
- set_my_default_wallet(wallet_id) → { ok }
- unlink_wallet_from_me(wallet_id) → { ok }

Operations
- Backup made: ~/.env.dexter.backup.<timestamp>
- Migration run: npx prisma migrate dev -n add_oauth_user_wallets
- Services restarted when applicable: dexter-mcp, dexter-ui

Admin policy
- ADMIN_EMAILS: comma‑separated list of admin emails (current: include nrsander@gmail.com).
- ADMIN_OAUTH_SUBS / ADMIN_BEARERS: optional alternates when email isn’t available via OAuth.
- Non‑admins limited to 10 wallets (enforced on linking/generation entry points).

Next steps (optional)
- Supabase cutover:
  - Point DATABASE_URL_PROD to Supabase Postgres.
  - Export managed_wallets to Supabase (encrypted_private_key unchanged) and re-run prisma migrate.
  - Keep oauth_user_wallets in Supabase for shared identity with website.
- Add generate_wallet tool if desired now; it will mint a new keypair, AES‑GCM encrypt seed with WALLET_ENCRYPTION_KEY (v2_seed_unified), insert into managed_wallets, and link as default (respecting limits).

