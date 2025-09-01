# Token AI Socials (Beta)

Modular, script-first tooling for socials scraping and bot operations used by Token AI. This is the refactor path away from the monolithic `scripts/fetch-active-tokens-social.js`.

- Language/runtime: Node.js (ESM modules)
- Browser automation: Playwright
- Telegram user-bot: GramJS (MTProto)
- DB: Prisma client (uses project root config)

The original behemoth remains unchanged and runnable. This folder contains modular replacements you can use piecemeal.

---

## Agent Integration & REPORT_FILE Contract

- The orchestrator is the socials data collector. It writes a JSON report and prints a single line to stdout:
  `REPORT_FILE:/absolute/path/to/orchestrated-analysis-<timestamp>.json`.
- The GPT-5 Agent (`token-ai/index.js`) calls the orchestrator via a tool (`socials_orchestrate`), reads that REPORT_FILE path, loads the JSON, and uses it for reasoning/analysis. This keeps the agent↔socials interface stable regardless of how socials are gathered.

Artifacts and outputs:
- Orchestrator reports: `token-ai/socials/reports/orchestrated-analysis-*.json`
- Website screenshots: `token-ai/socials/reports/websites/<MINT>/`
- Agent reports (separate): `token-ai/reports/ai-token-analyses/gpt5-analysis-*.json`

### Which Command Should I Use?

- Modular socials (orchestrator):
  `npm run socials -- <MINT> [--steps=market,website,telegram,x] [--x-concurrency=1|2] [--collect-members] [--max-members=200]`
  (Alias: `npm run socials:orchestrate`)

- Legacy monolith (kept for compatibility):
  `npm run socials:legacy -- <MINT>`

- Full Agent (LLM + socials + OHLCV + DB persist of analysis):
  `npm run token-agent -- <MINT> --web-search --ohlcv --fast-ohlcv=birdeye`
  (Alias: `npm run socials:agent -- <MINT> [same flags]`)

Notes:
- The Agent already uses the orchestrator internally via the `socials_orchestrate` tool and expects the REPORT_FILE line.

---

## Directory Layout

```
token-ai/socials/
  README.md
  config.json.example         # Copy to config.json and fill to override env
  config.js                   # Config loader (config.json overrides .env)
  common.js                   # Shared constants (reports dir, twitter session path)

  fetch-beta-x.js             # X/Twitter entrypoint (reports in ./reports)

  tools/                      # Public tool-style modules
    foundation.js             # ensure_token_activated, ensure_token_enriched, get_token_links_from_db
    twitter.js                # get_twitter_profile, ..._recent_tweets, ..._community_*
    websites.js               # extract_website_content, extract_websites_for_token, find_social_links_in_site
    telegram.js               # Bot API helpers (meta only)
    telegram-advanced.js      # MTProto user helpers (join, messages placeholder)
    market.js                 # fetch_market_overview (DexScreener)
    persist.js                # persist_socials_snapshot, load_latest_socials_snapshot
    derivers.js               # summarize_* and compile_official_presence
    util.js                   # validate_base58_mint, rate_limited_gate, get_cached_artifact

  twitter/
    scrape.js                 # Low-level X scraper (Playwright)
    persist.js                # X persistence (snapshots, tweets, community)

  telegram/
    gramjs-client.js          # MTProto (GramJS) client, session, join, event subscription
    login.js                  # Interactive login CLI
    join.js                   # Join by @username / invite link CLI

  reports/                    # JSON outputs and website screenshots (created at runtime)
```

---

## Configuration & Secrets

Config precedence: `token-ai/socials/config.json` overrides project `.env`. If a key in config.json is blank, it falls back to `.env`.

- Example: `token-ai/socials/config.json.example` (copy to `config.json` and fill)

config.json keys:

```
{
  "telegram": {
    "api_id": "",
    "api_hash": "",
    "phone": "",
    "password": "",
    "session_path": "token-ai/socials/telegram/session.session",
    "client": {
      "device_model": "Google Pixel 6",     // real device
      "system_version": "Android 13",        // real OS version for Pixel 6
      "app_version": "10.12.2"               // plausible Telegram Android version
    },
    "proxy": {
      "url": "socks5://username:password@residential-proxy.example:1080"
      // Alternatively specify host/port/username/password/type instead of url
    }
  },
  "twitter": {
    "session_path": "token-ai/socials/twitter/session.json"
  }
}
```

.env keys (fallbacks if not in config.json):

```
# Telegram user session (MTProto)
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE=
TELEGRAM_PASSWORD=
TELEGRAM_SESSION_PATH=
TELEGRAM_DEVICE_MODEL=
TELEGRAM_SYSTEM_VERSION=
TELEGRAM_APP_VERSION=
TELEGRAM_PROXY_URL=
TELEGRAM_PROXY_HOST=
TELEGRAM_PROXY_PORT=
TELEGRAM_PROXY_USERNAME=
TELEGRAM_PROXY_PASSWORD=
TELEGRAM_PROXY_TYPE=

# X/Twitter session JSON used by Playwright context
TWITTER_SESSION_PATH=
```

Security tips:
- Do not commit real secrets. Check your VCS ignores for `token-ai/socials/telegram/session.session` and any config with secrets.
- You may set secrets only in `.env` and keep `config.json` for non-sensitive overrides if preferred.
- Residential/mobile proxies are strongly preferred over datacenter IPs for MTProto. Use SOCKS5 if available.

---

## Account Switching (current.json)

To avoid editing `.env` for every phone change, account switching is controlled via a small file `token-ai/socials/telegram/current.json`. This file overrides only the active phone and session path; everything else still comes from `config.json` or `.env`.

Precedence (Telegram):
- api_id/api_hash: `config.json` → `.env`
- phone: `current.json` → `config.json` → `.env`
- session_path: `current.json` → `config.json` → `.env`

CLI helpers:

- Set current phone (creates a per-phone session path by default):
  - `npm run telegram:use -- --phone=+1XXXXXXXXXX`
  - Optional: `--session=token-ai/socials/telegram/sessions/+1XXXXXXXXXX.session`
  - Optional: `--auto-session` to generate a timestamped session filename under `sessions/`.

- Login fresh (uses current.json):
  - `npm run telegram:login -- --reset=1`

- Restart daemon to pick up the change:
  - `pm2 restart tg-daemon --update-env`

- List saved sessions:
  - `npm run telegram:accounts`

Recommendation: Leave `telegram.phone` empty in `config.json` so it’s obvious switching is driven by `current.json`.

---

## X/Twitter: Usage

Entrypoint: `node token-ai/socials/fetch-beta-x.js <MINT> [flags]`

Flags / env:
- `--collect-members` or `SOCIAL_COLLECT_MEMBERS=1`: collect X Community members (admins/mods/members) [heavy]
- `--max-members=NUM` or `SOCIAL_MAX_MEMBERS=NUM`: cap member collection (default 50)
- `--debug` or `SOCIAL_DEBUG_SCREENSHOT=1`: extra screenshots/logs
- `--no-enrich-replies` or `SOCIAL_ENRICH_REPLIES=0`: skip reply enrichment
- `SOCIAL_SEARCH_MAX_SECS` (default 15): time per search query
- `SOCIAL_SEARCH_MAX_TWEETS` (default 60): tweet cap per search query
- `SOCIAL_MARK_DELETED=1`: mark previously seen tweets as deleted if missing this run

Output:
- Reports saved to `token-ai/socials/reports/token-analysis-*.json` (X-only run) with a machine-readable `REPORT_FILE:` path printed to stdout.

Notes:
- Requires a valid X session JSON (see `TWITTER_SESSION_PATH`). You can generate one using your existing session capture script (e.g., scripts/twitter/utils/twitter-login-and-save-session.cjs).

---

## Telegram: MTProto User-Bot

We use GramJS to authenticate a real user session and join groups/channels like a normal user. This enables access where the Bot API alone cannot operate.

1) Login once (creates reusable session):

```
npm run telegram:login
```

You’ll be prompted for the code Telegram sends to your device. If you have two-step verification, provide the password. The session is saved to `telegram.session_path`.

2) Join a group/channel:

```
npm run telegram:join -- t.me/YourGroup
npm run telegram:join -- @YourGroup
npm run telegram:join -- https://t.me/+InviteHash
```

Programmatic helpers:
- `join_telegram_group_user({ usernameOrInvite })` from `tools/telegram-advanced.js`
- Bot API metadata (no content): `get_telegram_group_meta(telegramUrl)` from `tools/telegram.js`

Planned additions:
- Fetch recent messages via MTProto (history)
- Optional handlers for common verification flows (inline button, simple phrase)
- Voice chat streaming (TGCalls or a Node-compatible library) [future]

---

## Websites: Extraction

- `tools/websites.js` provides `extract_website_content(url, opts)` and `extract_websites_for_token(urls)`
- Playwright-first render with axios/cheerio fallback
- Extracts: text, meta, links, social links, Solana addresses, and a screenshot
- Screenshots: `token-ai/socials/reports/websites` (auto-created)

---

## Market Data

- `tools/market.js`: `fetch_market_overview(mint)` via DexScreener (FDV, liquidity, vol, top pool)
- `analyze_token_ohlcv_range(...)`: placeholder for Birdeye/in-house OHLCV integration

---

## Persistence & Derivers

- `tools/persist.js`
  - `persist_socials_snapshot(token, snapshot)` → delegations to per-platform persistence and writes a JSON artifact `snapshot-<mint>-<ts>.json`
  - `load_latest_socials_snapshot(mint)` → returns the newest artifact object if present
- `tools/derivers.js`
  - `summarize_website_signal(site)`
  - `summarize_twitter_signal(profileAndTweets)`
  - `summarize_community_signal({ xCommunity, telegram, discord })`
  - `compile_official_presence({ dbLinks, discovered })`

---

## Foundation & Utilities

- `tools/foundation.js`
  - `ensure_token_activated(mint)` → calls admin API
  - `ensure_token_enriched(mint, { timeoutSec, poll })` → trigger enrich + optional poll
  - `get_token_links_from_db(mint)` → socials + websites from DB
- `tools/util.js`
  - `validate_base58_mint(mint)` → { valid, onCurve, normalized }
  - `rate_limited_gate({ retryAfterSec, reason })` → { defer, retryAt }
  - `get_cached_artifact({ tokenAddress, prefix, suffix })` → path to latest cached report

---

## Orchestrator (Parallel, Refresh-Aware)

Run all steps with a positional mint (no `--mint` required):

```
npm run socials:orchestrate -- <MINT> [--steps=market,website,telegram,x] [--x-concurrency=1]
```

Behavior:
- Activation/Enrich once per token up front.
- If token is already enriched: performs a quick refresh enrich (no blocking), then briefly polls for DB changes (default 5s total, 1s interval). If socials/websites changed, proceeds immediately; otherwise continues without delay.
- Steps run in parallel per token: market + website + telegram concurrently; X/Twitter in a controlled queue (default `--x-concurrency=1`) sharing a single session context.

Controls:
- Disable refresh: `--no-refresh-enrich` or env `SOCIALS_REFRESH_ENRICH=0`.
- Adjust short poll after refresh:
  - `SOCIALS_REFRESH_POLL_SECS` (default 5)
  - `SOCIALS_REFRESH_POLL_INTERVAL_MS` (default 1000)

Report fields (per token):
- `socials_change_summary`: { added[], removed[], modified[] } comparing DB socials pre/post refresh.
- `websites_change_summary`: same for token_websites.
- `discovered_official_links`: canonical socials merged from DB + website.

### Persistence Matrix (What is written to DB?)

Default stance: artifact-first collection with conservative DB writes.

- Persisted to DB (via Prisma):
  - Twitter/X: profile snapshots, tweets (upsert), X Community members/roles (when applicable). See `twitter/persist.js`.
  - Token lifecycle: activation/enrich calls ensure the token exists and may trigger enrich jobs.

- Not persisted by default (artifact-only):
  - Website extraction: text/meta/screenshots saved to disk and included in the orchestrator report; not stored in DB tables.
  - Telegram group meta: returned in the report; not stored by default.
  - Discovered official links: normalized links included in the report (`discovered_official_links`); not committed to `token_socials/token_websites` unless an explicit writer does so.

Why: Avoids polluting canonical tables with mis-detected links and makes the collector safe to run in many contexts. The Agent and other consumers can read the JSON artifact directly (via the REPORT_FILE contract).

Proposed (optional) switches for future work:
- `--persist-websites` (store lightweight website snapshot rows or submit via admin API)
- `--persist-telegram` (store TG meta when present)
- `--commit-official-links` (add discovered links to canonical tables with validation + source tagging)

---

## History (Tweets + Snapshots + Deltas)

Twitter history tool aggregates persisted tweets and optional profile snapshots:

```
npm run socials:history:twitter -- <MINT> [--limit=100] [--since-days=7|--since-time=ISO]
```

Defaults:
- Includes replies and retweets by default.
- Excludes deleted tweets by default (enable with `--include-deleted=1`).
- Includes latest snapshots by default (`--snapshots-limit=20`).

Flags:
- `--author=@handle` filter by author_handle
- `--include-deleted=1` include tweets with `deleted_at`
- `--snapshots-limit=N` number of snapshots to include (default 20)

Output fields:
- `tweets`: ordered by `tweet_timestamp desc`; BigInt fields (e.g., views) are serialized as strings.
- `snapshots`: latest profile snapshots (followers/following/tweet_count, etc.).
- `snapshot_summary`: oldest vs latest with deltas and per-hour rates.
- `snapshot_deltas`: pairwise adjacent deltas across the snapshot series.

Note on per-hour rates:
- For very short windows (< ~1 hour), per-hour can look exaggerated because deltas are small and time is tiny. Use `count`, `oldest`, and `latest` fields for context; rates stabilize as more snapshots accumulate.

---

## Minimal Examples

X profile (in your Node code):

```js
import { get_twitter_profile } from './tools/twitter.js';

const token = { address: '<MINT>', symbol: 'DEGEN' };
const profile = await get_twitter_profile({ token });
console.log(profile);
```

Website extraction:

```js
import { extract_website_content } from './tools/websites.js';

const site = await extract_website_content('https://example.com');
console.log(site.meta, site.socialLinks);
```

Telegram join (programmatic):

```js
import { join_telegram_group_user } from './tools/telegram-advanced.js';

await join_telegram_group_user({ usernameOrInvite: 't.me/YourGroup' });
```

---

## Troubleshooting

- X session not found: Ensure `twitter.session_path` exists (see README and config precedence).
- Telegram login fails: Check `TELEGRAM_API_ID/HASH/PHONE`, ensure code is correct; for 2FA set `TELEGRAM_PASSWORD` or enter when prompted.
- Prisma/DB errors: Confirm project DB config/env is loaded (tools use the root Prisma client).
- Playwright timeouts: Increase timeouts in `websites.js` or ensure network reachability.

---

## Roadmap

- Telegram history fetch + basic verification handlers
- Discord meta/messages (with bot and explicit server permission)
- OHLCV integration (Birdeye)
- Voice chat ingestion/streaming (TGCalls)

---

## Notes

- Keep secrets out of VCS. Do not commit real values into config files.
- The monolithic scraper remains unchanged for compatibility; these modules are drop-in replacements for specific tasks.
Optional: test connectivity and proxy before login

```
npm run telegram:test:connect
```

It prints your configured client fingerprint and whether MTProto connection succeeds using your proxy settings.
