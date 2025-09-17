<div align="center">
  
# 🤖 Clanka AI <sup>ALPHA</sup>

### Autonomous Crypto Intelligence & Social Signal Analysis

[![Version](https://img.shields.io/badge/version-alpha-orange.svg)](https://github.com/BranchManager69/clanka-ai)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](#-status)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![AI Model](https://img.shields.io/badge/AI-BranchMAInager-purple.svg)](https://twitter.com/BranchManager69)
[![Blockchain](https://img.shields.io/badge/Blockchain-Solana-14C3D9.svg?logo=solana&logoColor=white)](https://solana.com)

<img src="https://via.placeholder.com/120x120/9333ea/ffffff?text=🤖+ALPHA" alt="Clanka AI Logo" width="120" height="120">

**Transform raw blockchain noise into actionable intelligence.**

[Features](#core-capabilities) • [Quick Start](#quick-start-commands) • [Status](#-status) • [Roadmap](#-roadmap) • [Documentation](#whats-inside) • [Contributing](#-contributing)

---

</div>

## Agent Flags (Quick Ref)

- Reasoning policy: `--reasoning-policy=quick|balanced|thorough`
  - quick: initial=low, refine=low, finalize=medium
  - balanced: initial=medium, refine=medium, finalize=medium
  - thorough: initial=high, refine=medium, finalize=high
- Global reasoning: `--reasoning-level=low|medium|high`
- Per‑phase: `--initial-reasoning=…`, `--refine-reasoning=…`, `--finalize-reasoning=…`
- OHLCV controls: `--ohlcv`, `--fast-ohlcv=birdeye`, `--hours=<N>`, `--interval=<N>`, `--force-ohlcv`
- Other: `--web-search`, `--parallel-tools`, `--auto-continue`

### Choose Your Profile (TL;DR)

- Quick: `--reasoning-policy=quick` (or `run_agent_quick` via MCP)
- Balanced (default): no flags needed; adjust per‑phase as required
- Thorough: `--reasoning-policy=thorough` (or set only `--finalize-reasoning=high`)

## Trading Quick Start (MCP)

Use MCP tools to buy/sell from managed wallets using explicit preview/execute flows.

- List balances for a wallet:
  - name: `list_wallet_token_balances`
  - args: `{ wallet_id: "<WALLET_ID>", min_ui: 0.000001, limit: 10 }`

- Preview buy:
  - name: `execute_buy_preview`
  - args: `{ token_mint: "<MINT>", sol_amount: 0.0005, slippage_bps: 150 }`

- Execute buy:
  - name: `execute_buy`
  - args: `{ wallet_id: "<WALLET_ID>", token_mint: "<MINT>", sol_amount: 0.0005, slippage_bps: 150 }`

- Preview sell:
  - name: `execute_sell_preview`
  - args: `{ token_mint: "<MINT>", token_amount: 0.1, slippage_bps: 200, output_mint: "So1111…12" }`

- Execute sell:
  - name: `execute_sell`
  - args: `{ wallet_id: "<WALLET_ID>", token_mint: "<MINT>", token_amount: 0.1, slippage_bps: 200, output_mint: "So1111…12" }`

See `mcp/README.md` → Trading Tools for full details.

## Deep Research Quick Start (MCP)

Use MCP tools to search, fetch/crawl, capture notes, run quick analyses, and finalize structured research reports.

- Search:
  - `npm run mcp:search -- "solana jupiter aggregator" --topN=8`
- Fetch:
  - `npm run mcp:fetch -- https://docs.jup.ag/`
- Crawl:
  - `npm run mcp:crawl:site -- https://docs.jup.ag --max=6 --depth=1`
- Notes:
  - `npm run mcp:note:write -- "Jupiter supports ExactOut quoting." --source=https://docs.jup.ag/ --tags=jupiter,exactout`
  - `npm run mcp:note:list -- --query=jupiter --limit=10`
- Run quick analysis + wait for report:
  - `npm run mcp:run:quick -- <MINT>`
  - `npm run mcp:wait:mint -- <MINT> --timeout=600 --poll=1500`
- Finalize report:
  - `npm run mcp:finalize -- "Deep Research: <Topic>" --outline=Overview|Risks --include=<noteId1>,<noteId2> --extra="Focus on sell routes."`

See `mcp/README.md` → Deep Research for full details.

## Reasoning Controls

Tune reasoning effort globally, per‑phase, or via policy for speed vs. quality.

- Global override (applies to all phases):
  - CLI: `--reasoning-level=low|medium|high`
  - Env: `TOKEN_AI_REASONING_LEVEL=low|medium|high`

- Per‑phase overrides (take precedence over global):
  - `--initial-reasoning=low|medium|high`
  - `--refine-reasoning=low|medium|high`
  - `--finalize-reasoning=low|medium|high`

- Policy (maps phases automatically; overridden by per‑phase/global):
  - `--reasoning-policy=quick|balanced|thorough`
  - quick: initial=low, refine=low, finalize=medium
  - balanced: initial=medium, refine=medium, finalize=medium
  - thorough: initial=high, refine=medium, finalize=high

- MCP parity (agent tools accept the same knobs):
  - `run_agent` / `run_agent_quick` support `reasoning_level`, `reasoning_policy`, `initial_reasoning`, `refine_reasoning`, `finalize_reasoning`.

Examples
- Fast iteration: `node index.js <MINT> --reasoning-policy=quick`
- Careful finalize only: `node index.js <MINT> --initial-reasoning=low --refine-reasoning=low --finalize-reasoning=high`
- MCP quick run: name `run_agent_quick`, args `{ mint, reasoning_level: "low" }`

## Trading CLI

Run trading tools without Codex using npm scripts that wrap the MCP stdio server. The CLI auto-loads env from the monorepo `.env` (RPC, DB, Logtail, etc.).

- List balances:
  - `npm run mcp:balances -- <WALLET_ID> --min-ui=0.000001 --limit=10`

- Buy (ExactIn):
  - `npm run mcp:buy -- <WALLET_ID> <MINT> --sol=0.0005 --slippage=150,250,300`

- Buy (ExactOut):
  - `npm run mcp:buy -- <WALLET_ID> <MINT> --exact-out --out=0.1`

- Sell (robust):
  - `npm run mcp:sell -- <WALLET_ID> <MINT> --pct=10 --outputs=So1111...,EPjF... --slippage=100,200,300 --max-impact=1.0`

- Unified trade:
  - `npm run mcp:trade -- buy <WALLET_ID> <MINT> --sol=0.0003`
  - `npm run mcp:trade -- sell <WALLET_ID> <MINT> --pct=10`

## Overview

> ⚠️ **Alpha Software**: Clanka AI is currently in alpha. While fully functional for production use, expect rapid changes, occasional bugs, and API updates. We're actively developing and improving the system based on real-world usage. Powered by BranchMAInager, a revolutionary crypto-focused AI model.

**Clanka AI** (formerly Token AI) is a comprehensive crypto token intelligence system that transforms raw blockchain data into actionable insights through automated social signal collection and AI-powered analysis. It autonomously researches tokens by orchestrating data gathering from multiple sources and generating structured intelligence reports.

### Core Capabilities

**Data Collection & Analysis:**
- **Twitter/X Scraping**: Fetches profiles, recent tweets, community posts, and member lists via Playwright browser automation
- **Telegram Intelligence**: Extracts group metadata, member counts, and activity metrics
- **Website Analysis**: Scrapes and analyzes official project websites with screenshot capture
- **Market Data**: Integrates DexScreener market metrics and Birdeye OHLCV candlestick data
- **Database Integration**: Persists analysis to `ai_token_analyses` table with per-token context in `agent_memory`

**AI-Powered Intelligence:**
- **BranchMAInager Engine**: Uses BranchMAInager, a revolutionary crypto-focused AI model by @BranchManager69
- **Structured Scoring**: Generates branchScore (0-100 quality metric) and riskScore assessments
- **Pattern Recognition**: Identifies red flags, green flags, and meme signals
- **Timeline Correlation**: Maps social activity bursts to price/volume movements

**Architecture & Integration:**
 - **Standalone Server**: Runs on port 3013 (configurable) with agent dashboard and real-time WebSocket events
 - **Realtime Voice (optional)**: Browser WebRTC voice chat via OpenAI Realtime with ephemeral tokens minted at `POST /realtime/sessions`
- **Tool-Based System**: Modular tools architecture with strict JSON schema enforcement
- **DegenDuel Integration**: Can activate tokens and trigger enrichment via admin API
- **Report Generation**: Outputs timestamped JSON reports and media artifacts to organized directories

Clanka AI is the analysis agent and modular socials pipeline used inside the DegenDuel monorepo. It lives under `token-ai/` here, and is also published as its own GitHub repo via git subtree.

---

## Architecture Overview

High‑level flow from UI/CLI → Agent → Tools → Reports. The finalize stage is pure and schema‑strict.

```
                           (optional direct)
  CLI Terminal -----------------------------> [ Agent CLI ]
  node index.js <MINT>                           token-ai/index.js
             |                                         |
             |                                         | emits HTTP events → POST /events
             |                                         v
[ Browser UI ]-- POST /run -----------------> [ Live UI Server ] -----------------------------.
agent-live.html        JSON { mint }             token-ai/server.js                           |
ws://host:port/ws                              - spawns agent child                           |
(subscribes to WS)                              - broadcasts WS events                         |
                                                - /ohlcv proxy (Birdeye)                      |
                                                - /recent-analyses, /latest-analysis          |
             ^                                         |                                      |
             | <====== WS: ai_session/runner events ===|======================================|
             |        status, tool_call, partial, metrics, final_json                         |
             |                                                                                 |
             |                                                                                 v
             |                                 [ Child: Agent CLI ]                        writes
             |                                 - loads memory (DB/FS)                      reports
             |                                 - builds prompts                             under:
             |                                 - executes tools via core/exec-tools.js      reports/
             |                                 - posts events                                ai-token-analyses/
             |                                           |                                    gpt5-analysis-*.json
             |                                           | tool_call: socials_orchestrate     latest-*.json
             |                                           v
             |                                 [ Tool Executor ] (core/exec-tools.js)
             |                                 - routes tool calls
             |                                 - spawns orchestrator child
             |                                           |
             |                                           v
             |                                 [ Socials Orchestrator ]
             |                                 token-ai/socials/orchestrator.js
             |                                 - steps: market, website, telegram, x
             |                                 - Playwright/APIs, persists JSON to socials/reports/
             |                                 - prints REPORT_FILE:/abs/path.json
             |                                           |
             |                                           v
             |                                 exec-tools reads report, normalizes links
             |                                 returns data to Agent
             |                                           |
             |                                           | tool_call: analyze_token_ohlcv_range
             |                                           v
             |                                 Birdeye v3 OHLCV (fast)  <----.
             |                                 - range + interval fetch        |  external APIs
             |                                 - summarized to memory          |  - DexScreener
             |                                                                  - Birdeye v3
             |                                                                  - X/Twitter
             |                                                                  - Telegram
             |                                           ^
             |                                           |
             |                                 Agent correlates socials + OHLCV
             |                                 may web_search in gather rounds
             |                                 then Finalize (pure) → JSON
             |                                           |
             |                                           v
             +------------------- UI shows timeline, metrics, streamed text, final scores
```

### Finalize Behavior (important)
- Pure synthesis: no tool calls during finalize; no `parallel_tool_calls`.
- Non‑stream strict JSON: finalize requests a single non‑stream response using `text.format: json_schema` to avoid malformed streaming JSON.
- Contextful repair: if parsing fails, one “draft → valid JSON” repair pass is run using the just‑produced draft text, not from scratch.
- Memory gating: agent memory updates only occur when the final JSON validates against the schema (top‑level and nested required fields).

---

## 🧠 Knowledge Architecture (Planned)

Clanka's institutional knowledge will be implemented through **contextual prompt injection** at critical decision points:

### Why Prompting Over Vector Stores
- **Precision**: Trenching wisdom needs to be applied at exactly the right moment in analysis
- **Consistency**: Pattern interpretations must be deterministic, not retrieval-dependent  
- **Speed**: No additional retrieval latency or infrastructure complexity
- **Control**: Direct visibility and versioning of all knowledge rules

### Implementation Structure
```
token-ai/
├── prompts/
│   ├── system.domain/   # Domain knowledge modules
│   │   ├── knowledge-base.md    # 🎯 Full aggregated wisdom (ALL patterns)
│   │   ├── market-pulse.md      # 📊 Current market conditions (Jan 26, 2025)
│   │   ├── market-landscape.md  # Pump.fun/PumpSwap/LetsBONK dynamics
│   │   ├── trenches-terminology.md # Natural lingo usage guide
│   │   ├── elder-wisdom.md      # Unwritten rules & intuition
│   │   ├── trenches.md          # Meme/microcap focus
│   │   ├── serious.md           # Institutional analysis
│   │   ├── pump-detection.md    # Pump pattern detection
│   │   ├── insider-patterns.md  # Wallet game detection
│   │   └── social-manipulation.md # Fake engagement detection
│   ├── system.voice/    # Output tone control
│   │   ├── trencher.md  # Degen speak
│   │   └── utility.md   # Professional tone
│   └── overrides/       # Section-specific customization
│       └── section.*.md files
```

**Usage**: `npm run socials:agent -- <MINT> --domain=knowledge-base --voice=trencher`

Each module injects specific expertise without overriding the model's reasoning ability - teaching it what to look for, not what to conclude.

---

## 🚦 Status

### Current State: **Alpha v0.3.0**

**Access**: Free during alpha (limited time)  
**Repository**: Private  
**Contact**: [@BranchManager69](https://twitter.com/BranchManager69) on X/Twitter

✅ **Working Features:**
- Full BranchMAInager powered token analysis with 80+ data points
- Twitter/X scraping with Playwright automation
- Telegram group metadata extraction (basic)
- Website content analysis with screenshots
- DexScreener & Birdeye market data integration
- Structured JSON output with risk scoring
- Real-time WebSocket dashboard
- PostgreSQL persistence layer

🔴 **Critical Issues:**
- **Context Loss**: ~50% of analyses lose context at final JSON generation despite successful data gathering
- **Tool Call Errors**: Frequent "unknown tool call" errors disrupting analysis pipeline
- **Telegram Limitations**: Accounts banned within 15 minutes of group joins (workarounds in progress)

⚠️ **In Development:**
- Interactive chat/Q&A functionality
- Enhanced Telegram support & anti-ban measures
- Standalone mode (no parent DB dependency)
- Additional tool integrations (extensive backlog)
- Fix for context loss at finalization step
- Resolution of tool call response handling

---

## 💰 Use Cases

Clanka AI provides deep intelligence for:

- **Trading Signal Generation**: Identify momentum shifts before they're obvious
- **Due Diligence**: Comprehensive analysis of team activity, community engagement, and red flags
- **Community Monitoring**: Track social sentiment, engagement patterns, and growth metrics
- **Market Opportunity Discovery**: Find undervalued tokens with growing social traction
- **Risk Assessment**: Evaluate project legitimacy through multi-source verification

---

## 🗺️ Roadmap

### Priority 1: Core Stability (🚨 Immediate)
- [ ] Fix context loss at finalization (50% failure rate)
- [ ] Resolve "unknown tool call" errors
- [ ] Stabilize tool response handling pipeline

### Priority 2: Telegram Enhancement (🔥 Q1 2025)
- [ ] Anti-ban measures for Telegram scraping
- [ ] Session rotation & proxy support
- [ ] Member list collection without detection
- [ ] Message history extraction
- [ ] Admin/influencer identification

### Priority 3: Institutional Knowledge Layer (🧠 Q1 2025)
- [ ] Domain-specific prompt templates for trenching patterns
- [ ] Contextual interpretation rules at each analysis stage
- [ ] Pattern recognition library (pump signatures, rug patterns, insider accumulation)
- [ ] Heuristic overlays for social signal interpretation
- [ ] Versioned knowledge modules for A/B testing

### Priority 4: Interactivity (🚧 Q1 2025)
- [ ] Interactive chat interface
- [ ] Follow-up questions on analysis
- [ ] Custom query parameters
- [ ] Real-time analysis updates
- [ ] User-defined alert conditions

### Priority 5: Tool Expansion (📅 Q1-Q2 2025)
- [ ] Enhanced Twitter metrics (engagement rates, bot detection)
- [ ] Discord server integration
- [ ] GitHub activity tracking
- [ ] On-chain holder analysis
- [ ] DEX trade pattern recognition

### Future Considerations (📅 Q2+ 2025)
- [ ] Standalone deployment mode
- [ ] Public API (paid tier)
- [ ] Multi-chain support
- [ ] Advanced caching layer
- [ ] White-label solutions

---

## 💻 Requirements

### System Requirements
- **OS**: Linux, macOS, or Windows with WSL2
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB for dependencies + data
- **Network**: Stable internet for API calls

### Dependencies Status
| Component | Required | Version | Status |
|-----------|----------|---------|--------|
| Node.js | Yes | ≥18.0.0 | Stable |
| PostgreSQL | Yes* | ≥14.0 | Stable |
| Playwright | Yes | Latest | Stable |
| OpenAI API | Yes | BranchMAInager | Beta |
| Birdeye API | Optional | v3 | Stable |

*PostgreSQL optional in upcoming standalone mode

---

## 🚀 Getting Started

### For Alpha Access
Contact [@BranchManager69](https://twitter.com/BranchManager69) on X/Twitter for access during the free alpha period.

### Quick Setup (Internal Use)
```bash
# From within parent monorepo
cd token-ai/

# Install dependencies if needed
npm install
npx playwright install

# Basic analysis (default prompts)
npm run socials:agent -- <MINT_ADDRESS> --web-search --ohlcv --fast-ohlcv=birdeye

# With trenching knowledge activated
npm run socials:agent -- <MINT_ADDRESS> --domain=trenches --voice=trencher

# With pump detection focus
npm run socials:agent -- <MINT_ADDRESS> --domain=pump-detection

# With full institutional knowledge
npm run socials:agent -- <MINT_ADDRESS> --domain=knowledge-base

# Via environment variables
TOKEN_AI_DOMAIN=insider-patterns npm run socials:agent -- <MINT_ADDRESS>
```

### Realtime Voice (Optional)
- Set `OPENAI_API_KEY` in `.env`.
- **PRODUCTION (PM2)**: `pm2 restart dexter-api dexter-fe && pm2 save`
- **DEVELOPMENT ONLY**: Start the UI: `node server.js --port 3013` and open `/agent-live.html`.
- Click the “Voice: Off” button to start a WebRTC session. The server mints a short‑lived token at `POST /realtime/sessions` and connects to OpenAI Realtime.
- For production, set `TOKEN_AI_EVENTS_TOKEN` and ensure your page includes `window.AGENT_TOKEN = '<same-token>'` (or a proxy injects header `x-agent-token`).

### Available Knowledge Modules
- **knowledge-base**: Full aggregated wisdom ⭐ (includes everything)
- **market-pulse**: Current market conditions (Aug 26, 2025 - BRUTAL PVP)
- **market-landscape**: Launchpad/AMM landscape (pump.fun dominance)
- **trenches-terminology**: Natural insider lingo usage
- **elder-wisdom**: Unwritten rules and veteran intuition
- **trenches**: Meme/microcap focus (original)
- **serious**: Institutional analysis (original)
- **pump-detection**: Identify orchestrated pumps
- **insider-patterns**: Detect wallet games
- **social-manipulation**: Spot fake engagement

### Dynamic Context (Auto-Injected)
Clanka now receives real-time context with every analysis:
- **Current date/time** (UTC)
- **SOL price** and 24h change
- **Market trend** (pump/dump/crab)

---

## 📊 Performance

### Benchmarks (Average)
| Operation | Time | Memory |
|-----------|------|--------|
| Single token analysis | 45-90s | 250MB |
| Social data collection | 15-30s | 150MB |
| Website extraction | 5-10s | 100MB |
| Full pipeline | 60-120s | 400MB |

### API Rate Limits
- OpenAI: 500 RPM (tier dependent)
- Birdeye: 300 requests/min
- DexScreener: No hard limit
- Twitter scraping: ~60 requests/min (with delays)

---

## What's Inside

- Agent CLI: `token-ai/index.js`
  - BranchMAInager via Responses API, multi-round tool use, strict JSON finalize.
  - Calls the modular socials orchestrator as a tool, plus OHLCV, DB tweet history, web search, etc.

- Socials Orchestrator: `token-ai/socials/orchestrator.js`
  - Gathers market (DexScreener), website (Playwright extract), Telegram meta, and Twitter/X (Playwright).
  - Emits a machine‑readable JSON and prints an integration marker: `REPORT_FILE:/abs/path.json`.

- Core Tooling: `token-ai/core/{tools,exec-tools,format,prompts}.js`
  - Tool definitions, executor, strict schema, and prompts.

- Reports
  - Agent outputs: `token-ai/reports/ai-token-analyses/*.json`
  - Orchestrator outputs: `token-ai/socials/reports/*.json` (+ website screenshots)

---

## Quick Start (Commands)

- Full Agent (recommended)
  - `npm run socials:agent -- <MINT> --web-search --ohlcv --fast-ohlcv=birdeye`
  - Alias for `node token-ai/index.js`.

- Modular Socials Only (orchestrator)
  - `npm run socials -- <MINT> [--steps=market,website,telegram,x] [--x-concurrency=1|2] [--collect-members] [--max-members=200]`
  - Alias: `npm run socials:orchestrate`.

- Legacy Monolith (kept for compatibility)
  - `npm run socials:legacy -- <MINT>`

Output locations:
- Agent: `token-ai/reports/ai-token-analyses/gpt5-analysis-<mint>-<ts>.json`
- Orchestrator: `token-ai/socials/reports/orchestrated-analysis-<ts>.json`

---

## PM2 Deployment (Dexter)

- Apps: `dexter-api` (API), `dexter-fe` (Next.js FE), `dexter-mcp` (MCP HTTP)
- Start: `pm2 start alpha/ecosystem.config.cjs --only dexter-api,dexter-fe,dexter-mcp`
- Stop: `pm2 stop dexter-api dexter-fe dexter-mcp`
- Restart: `pm2 restart dexter-api dexter-fe dexter-mcp && pm2 save`
- Status: `pm2 status`
- Logs: `pm2 logs <name>` (e.g., `pm2 logs dexter-mcp`)
- Nginx reload: `sudo nginx -t && sudo nginx -s reload`
- MCP connector setup: see `token-ai/mcp/README.md`

---

## Environment & Requirements

- OpenAI key: `OPENAI_API_KEY`
- Birdeye (fast OHLCV): `BIRDEYE_API_KEY`
- DB (Prisma): project‑level `.env` (Clanka imports `../../config/prisma.js`)
- Twitter/X session: `TWITTER_SESSION_PATH` (or `token-ai/socials/config.json`)
- Playwright runtime for website/X scraping

Notes:
- Clanka AI currently expects the parent repo's config; for standalone use, provide equivalent `.env` and Prisma config.

### MCP: Unified `/mcp` + Simplified Env

- Keep these env vars (recommended):
  - `TOKEN_AI_MCP_OAUTH=true` (OAuth endpoints enabled on the MCP server)
  - `TOKEN_AI_MCP_PUBLIC_URL=https://<your.host>/mcp` (issuer/authorize/token/userinfo base)
  - `TOKEN_AI_MCP_TOKEN=<server-bearer>` (backend bearer; injected by the proxy)
  - `TOKEN_AI_DEMO_MODE=1` (keeps a frictionless demo flow; see below)
  - `MCP_USER_JWT_SECRET=<random-64-hex>` (signs short‑lived per‑user tokens)
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (for magic‑link sign‑in in the UI)

- You can remove these (now defaulted):
  - `TOKEN_AI_MCP_OAUTH_ALLOW_ANY` (implied by `TOKEN_AI_DEMO_MODE=1`)
  - `TOKEN_AI_MCP_PROXY_FORWARD_AUTH` (defaults off; proxy injects server bearer)
  - `DEBUG_MCP_PROXY` (debug logging; default off)

- Endpoints (through Nginx):
  - `/mcp` → Streamable HTTP MCP (SSE/JSON)
  - `/mcp/*` → OAuth endpoints (authorize, token, userinfo, callback, well‑known)
  - `/.well-known/*` → OAuth metadata (issuer points to `https://<your.host>/mcp`)
  - UI helpers (browser UI only): `/auth/config` (Supabase public config), `/mcp-user-token` (mints short‑lived per‑user JWT), `/mcp-proxy` (requires `?userToken=…`, injects backend bearer)

- Demo mode behavior:
  - With `TOKEN_AI_DEMO_MODE=1`, the OAuth server accepts the server‑injected bearer from `/mcp-proxy` without calling an external IdP. Anonymous users still need a UI‑issued `userToken` to reach `/mcp-proxy`.
  - To fully lock down, set `TOKEN_AI_DEMO_MODE=0` (and keep `TOKEN_AI_MCP_OAUTH=true` with your real IdP configured).

- ChatGPT Custom Connector:
  - Set Server URL to `https://<your.host>/mcp`. The OAuth metadata is available at both `/.well-known/*` and `/mcp/.well-known/*`.
  - Do not use `/mcp-proxy` for ChatGPT; it is designed for the browser UI and requires a `userToken` query param.

Spec alignment (per MCP Auth guidance):
- OAuth 2.1 + PKCE: Supported by the OAuth server (`http-server-oauth.mjs`).
- Discovery (RFC 8414): Served at `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`.
- External IdP preferred: Configure `TOKEN_AI_OIDC_*` to advertise and use your IdP. Built‑in provider is for demos.
- DCR (RFC 7591): You may optionally set `TOKEN_AI_OIDC_REGISTRATION_ENDPOINT` to advertise registration; we don’t mint clients.

### Prerequisites (verified)
- Node.js 18+ and npm
- Playwright browsers installed: `npx playwright install`
- Valid OpenAI API key in `.env`
- Optional Birdeye key for fast OHLCV
- A valid X/Twitter session JSON at `TWITTER_SESSION_PATH` (Playwright storageState). This must be obtained by logging in via a separate, environment‑specific process; Clanka expects a logged‑in session file and will reuse it.

### Minimal .env example
```
OPENAI_API_KEY=sk-...
# Optional but recommended for fast OHLCV
BIRDEYE_API_KEY=...

# Playwright context (path to a logged‑in X session JSON)
TWITTER_SESSION_PATH=/absolute/path/to/twitter-session.json

# When using fast OHLCV
FAST_OHLCV_PROVIDER=birdeye
```

### Quick Start (Standalone‑friendly)
- Orchestrator only:
  - `npm run socials -- <MINT>`
  - Look for `REPORT_FILE:/abs/path.json` and open that file to inspect socials/website/market output.
- Agent minimal (uses orchestrator under the hood):
  - `npm run socials:agent -- <MINT> --ohlcv --fast-ohlcv=birdeye`
  - Check `token-ai/reports/ai-token-analyses/` for the strict JSON analysis.

---

## Agent Rounds (How it behaves)

- Recommended flow (headroom up to 20 by default):
  1. socials_orchestrate → continuation (tools enabled; no JSON yet)
  2. get_twitter_history + analyze_token_ohlcv_range → continuation
  3. finalize strict JSON (tools disabled)

- Extra rounds (4–5) are useful when the model needs:
  - Web verification (web_search) for claims / ambiguous proper nouns
  - Website deep‑dives or Telegram specifics
  - X Community member collection (explicit enable; heavy)
  - OHLCV window refinements (e.g., 1m vs 15m)

Implementation details (stability):
- Continuation turns (with outputs) allow tools and never request final JSON.
- Finalize turns produce strict JSON and never allow tools. This prevents call‑id churn and “No tool output found” errors.

Rounds configuration:
- Default max rounds: 20
- Override via CLI: `--max-rounds=<N>`
- Override via env: `TOKEN_AI_MAX_ROUNDS=<N>`

### Image Vision & Decoupled Continuation

- The agent now decouples images and tool outputs across two continuation steps to satisfy OpenAI API constraints:
  - Step 1: images‑only continuation (tools ON)
  - Step 2: outputs‑only continuation (tools ON)
  - Then finalize (tools OFF, strict JSON)
- Images are selected per‑tweet (photos + link‑card thumbnails) from the orchestrator artifacts and sent by default.
- Saving media to disk is on by default: `token-ai/socials/reports/twitter-media/<MINT>/`.
- Modes: `TOKEN_AI_IMAGE_MODE=url` (default, pbs.twimg.com) or `inline` (base64; larger payloads).
- Log evidence appears during runs, for example:
  - `📡 Continuation step 1/2: images-only ...`
  - `🖼️  Attaching 3 image(s) to model (mode=url)`
  - `📡 Continuation step 2/2: outputs-only ...`

Quick test command (shows the logs above):
- `npm run socials:agent -- <MINT> --max-rounds=3 --web-search --ohlcv --fast-ohlcv=birdeye`
  - Ensure orchestrator has fetched X posts with media for that mint.
  - Look for the image‑attachment log lines during the first continuation.

---

## OHLCV Policy (Birdeye v3)

- Intervals/windows: 1m ≤ 6h, 5m ≤ 48h, 15m ≤ 14d; ≤ 5000 candles.
- Fast path enabled when `FAST_OHLCV_PROVIDER=birdeye` and `BIRDEYE_API_KEY` present.
- Tool: `analyze_token_ohlcv_range` (explicit epoch seconds `time_from`, `time_to`, and `interval_minutes`).

---

## Web Search Policy (Verification/Context)

- Use to corroborate claims, check popularity/memetics, clarify proper nouns/slang.
- Not a primary discovery step for microcaps; keep queries focused; include citations.

---

## MCP‑Only Tools and Autonomous Trading

### Overview
Clanka AI now includes native, autonomous trading capabilities through integrated Jupiter DEX tools. The agent can execute real mainnet trades directly from its decision-making pipeline, transforming analysis into action.

### Trading Tools Available

The agent calls tools via a thin MCP proxy in `core/exec-tools.js`. All networking, DB, and subprocess work happens inside the MCP server. Trading and research run through MCP only.

### Core Trading Functions

1. **`list_managed_wallets`** - Returns all available trading wallets from the managed_wallets table
2. **`get_wallet_balance`** - Checks SOL and token balances for any managed wallet  
3. **`get_token_price`** - Fetches current token price via Jupiter quote API
4. **`execute_buy`** - Executes a token purchase using SOL
5. **`execute_sell`** - Sells tokens back to SOL (partial or full balance)
6. **`get_transaction_status`** - Verifies transaction confirmation status

### Research/Predictions/DB (via MCP)

- Websites: `extract_website_content`, `extract_websites_for_token`, `discover_official_links`
- Market data: `fetch_market_overview`, `analyze_token_ohlcv_range`
- Socials orchestrator: `socials_orchestrate`
- Twitter scraping: `get_twitter_profile`, `get_twitter_recent_tweets`, `get_twitter_community_meta`, `get_twitter_community_posts`, `get_twitter_community_members`
- Predictions & DB: `get_twitter_history`, `get_media_from_tweet`, `get_prediction_history`, `verify_tweet_prediction`, `verify_relative_prediction`, `ensure_token_activated`, `ensure_token_enriched`, `get_token_links_from_db`
- Wallet analysis: `get_wallet_holdings`

Structured errors returned by MCP (examples):
- `{ error: 'db_unavailable' }`
- `{ error: 'tweet_not_found', tweet_id }`
- `{ error: 'missing_birdeye_api_key' }`, `{ error: 'no_ohlcv_data' }`

### Technical Implementation

**Architecture (MCP‑only):**
```
Agent Decision Layer
        ↓
Tool Executor (core/exec-tools.js → MCP proxy)
        ↓
MCP Server (mcp/common.mjs)
  ├── tools/trading.mjs
  ├── tools/websites.mjs, tools/dexscreener.mjs, tools/ohlcv.mjs
  ├── tools/socials-data.mjs, tools/socials-orchestrate.mjs
  ├── tools/predictions.mjs, tools/foundation.mjs, tools/wallet-extra.mjs
        ↓
Solana / HTTP APIs / DB
```

**Security:**
- All private keys stored encrypted (AES-256-GCM) in PostgreSQL `managed_wallets` table
- Supports multiple encryption formats (v2_seed_unified, v2_seed_admin_raw, etc.)
- Automatic admin/superadmin wallet exclusion for safety
- Transaction signing happens in-memory, keys never logged

**Trade Execution Flow:**
1. Agent analyzes token via social signals & market data
2. Makes trading decision based on analysis
3. Calls `execute_buy` or `execute_sell` with parameters
4. Tool decrypts wallet, builds transaction via Jupiter
5. Signs and submits to Solana mainnet
6. Returns transaction hash and Solscan URL

### Example Tool Calls

```javascript
// Buy $10 worth of a token
await executeTool('execute_buy', {
  wallet_id: 'wallet-uuid',
  token_mint: '3qq54YqAKG3TcrwNHXFSpMCWoL8gmMuPceJ4FG9npump',
  sol_amount: 0.1,
  slippage_bps: 100  // 1% slippage
});

// Sell entire token balance
await executeTool('execute_sell', {
  wallet_id: 'wallet-uuid', 
  token_mint: '3qq54YqAKG3TcrwNHXFSpMCWoL8gmMuPceJ4FG9npump',
  sell_all: true,
  slippage_bps: 300  // 3% slippage
});
```

### Proven Results

Successfully tested on mainnet (2024-08-27):
- **Buy TX**: [bSyXpUAi9Uqb...](https://solscan.io/tx/bSyXpUAi9UqbFyzyo4uWjsSqY9C5kCETroniW19JQBmwJPsn3VxT7ySEeWhRexcFHN7x9tFiDY6TkAFpMXQURto) - Bought 188.96 CLANKER for 0.01 SOL
- **Sell TX**: [5uWu8iUCYsz7...](https://solscan.io/tx/5uWu8iUCYsz7U9KmMDchn22FekGVHz9emy49y2a81P5Gn8zDNLgZzPFzZQAzJmmWY4WKqLW55YAvqF2y1vv5V5f) - Sold 100 CLANKER for 0.0053 SOL

### Configuration Requirements

```env
# Required for OHLCV (predictions)
BIRDEYE_API_KEY=your_birdeye_key

# Required for trading
WALLET_ENCRYPTION_KEY=<64-char-hex-key>  # For wallet decryption
SOLANA_RPC_ENDPOINT=<helius-or-other>    # RPC for transactions

# Database must contain managed_wallets with:
# - encrypted_private_key (AES-256-GCM encrypted)
# - public_key (wallet address)
# - status='active'
```

### Agent Trading Strategy Integration

The trading tools are designed to be called by the agent after analysis. A typical flow:

1. Agent performs social/market analysis on a token
2. Identifies trading opportunity based on signals
3. Checks wallet balances
4. Executes trade with appropriate sizing
5. Monitors position and decides exit strategy
6. Returns results with transaction proof

This creates a complete autonomous trading loop where the agent's intelligence directly translates to on-chain actions.

---

## Structured Output (Strict JSON)

- Base fields: tokenType, branchScore, branchWhy, communicationAnalysis, currentStatus, projectSummary, riskScore, riskWhy, redFlags, greenFlags, explore, summary, memeSignals.
- Structured synthesis (added):
  - `signalsSnapshot`: compact 7d metrics
    - `tweetStats`: posts, uniqueAuthors, repliesPerPost, retweetsPerPost, memberDelta
    - `priceStats`: maxRallyPct, maxDrawdownPct, peakVolWindows[]
    - `topTags`: ["#tag(N)", "$TICKER(N)", …]
  - `activityPriceTimeline`: 3–5 windows correlating tweet bursts with price/volume
    - each entry: { window, tweets, ohlcv, leadLag }
  - `tweetEvidence` (optional): up to 3 tweet URLs that exemplify a key window

Why: surfaces timeline/lead‑lag synthesis without dumping raw tweet arrays (those stay in DB and orchestrator artifacts).

---

## Integration Contract (REPORT_FILE)

- Orchestrator prints `REPORT_FILE:/abs/path.json` to stdout.
- The Clanka Agent reads that path, loads JSON, and proceeds — keeping the agent↔socials interface stable.

---

## Troubleshooting

- “No tool output found …” or dropped outputs during finalize:
  - Finalize calls now disable tools and anchor to the response that produced the call_ids. Continuations (with outputs) allow tools; finalize does not. This eliminates call‑id churn.

- Multiple JSON blobs / parse failure:
  - Continuations must not request final JSON; finalize must be a clean, tools‑off turn. Clanka enforces this split.

- OHLCV zeros / NA:
  - Check Birdeye key and interval/window; sparse new tokens on 15m may yield few candles — try 1m (≤ 6h).

---

## Subtree: This Folder as Its Own Repo

This folder is synced as a git subtree to `BranchManager69/clanka-ai`.

- Push parent → token‑ai repo:
  - `npm run subtree:push`
- Pull token‑ai repo → parent folder:
  - `npm run subtree:pull`
- Details and auth tips: see `token-ai/SUBTREE.md`.

---

## Handy Paths

- Agent CLI: `token-ai/index.js`
- Orchestrator: `token-ai/socials/orchestrator.js`
- Core: `token-ai/core/{tools,exec-tools,format,prompts}.js`
- Agent reports: `token-ai/reports/ai-token-analyses/`
- Orchestrator reports: `token-ai/socials/reports/`

---

## TODO — Standalone Mode (No Parent DB)

Goal: Let anyone run Clanka without the parent repo or a Postgres instance.

Phase 1 (quick win)
- Env flag: `TOKEN_AI_DB=off` (or `TOKEN_AI_STANDALONE=1`) to gate all DB reads/writes.
- Orchestrator: artifact‑only when DB is off (still writes JSON + screenshots; skip DB persistence).
- Tools: return structured "no‑db/disabled" results instead of erroring; log that standalone is active.
- Agent: `get_twitter_history` fallback to orchestrator’s recent tweets from REPORT_FILE when DB is off.
- Docs: README section + .env.example entries for standalone mode.

Phase 2 (portable DB)
- Add Prisma schema limited to used tables and support SQLite (`DATABASE_URL=file:./tokenai.db`).
- Provide migration + quickstart to run with local SQLite or a user‑supplied Postgres.

Phase 3 (adapter shim)
- Introduce `token-ai/config/db.js` to abstract DB operations (no‑op | SQLite | parent Postgres).
- Make admin/enrich calls optional (no‑ops or manual inputs in standalone).

Open question
- Tokens table: for open‑source, either (a) seed minimal token rows on demand, or (b) accept token metadata via flags/artifacts.
