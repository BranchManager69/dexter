# Token-AI Tools Documentation

## Overview

Token-AI implements two distinct tool systems:
1. **MCP Server Tools** - Infrastructure and process management tools exposed via Model Context Protocol
2. **Agent Tools** - Real-time analysis and trading tools used by the AI agent

## Tool Locations

- **MCP Server Tools**: `/token-ai/mcp/common.mjs` (lines 195-2300+)
- **Agent Tools**: `/token-ai/core/tools.js` (lines 21-600)

## MCP Server Tools (52 total)

### Run Management (11 tools)
*Conditional on `ENABLE_RUN_TOOLS` environment variable*

| Tool | Description |
|------|-------------|
| `run_agent` | Spawn the analyzer (index.js) for a token mint |
| `run_socials` | Run socials/orchestrator.js for a token mint |
| `run_socials_step` | Run a single socials step (market, website, telegram, or x) |
| `run_socials_market` | Run socials orchestrator market step only |
| `run_socials_website` | Run socials orchestrator website step only |
| `run_socials_telegram` | Run socials orchestrator telegram step only |
| `run_socials_x` | Run socials orchestrator X/Twitter step only |
| `run_agent_quick` | Spawn analyzer with quick flags (web-search, ohlcv) |
| `list_runs` | List active analyzer processes |
| `get_run_logs` | Fetch recent logs for a running process |
| `kill_run` | Terminate a running analyzer process by PID |

### Report Management (14 tools)

| Tool | Description |
|------|-------------|
| `list_recent_analyses` | Summarize recent analysis JSON files |
| `list_resource_uris` | Return report resource URIs for recent analyses |
| `get_latest_analysis` | Return the most recent analysis JSON |
| `get_report_head` | Return lightweight metadata for a report |
| `read_report_uri` | Read a report using its report:// URI |
| `list_reports_page` | Paginated report URIs with cursor support |
| `list_reports_for_mint` | List report files for a given mint |
| `resolve_report_id` | Resolve filename/uri/mint to report details |
| `search_reports` | Substring search over recent report JSON files |
| `get_report` | Fetch a specific analysis by filename or mint |
| `wait_for_report_by_mint` | Poll until a report for a mint appears |
| `list_jobs` | List active runs with latest report info |
| `get_analysis_status` | Return running status and latest report for a mint |

### Voice Debug (4 tools)

| Tool | Description |
|------|-------------|
| `voice_debug_get` | Fetch latest Realtime Voice debug lines |
| `voice_debug_clear` | Clear Realtime Voice debug buffer |
| `voice_debug_save` | Persist Realtime Voice debug logs to JSON |
| `voice_health` | Return Realtime Voice health summary |

### Deep Research (11 tools)

| Tool | Description |
|------|-------------|
| `web_search` | Search the web using Tavily API |
| `fetch_url` | Fetch web page with Readability extraction |
| `fetch_url_rendered` | Use headless browser to render and extract |
| `smart_fetch` | Try static fetch, fallback to rendered if needed |
| `crawl_site` | BFS crawl within a site |
| `crawl_urls` | Fetch and extract a list of URLs |
| `write_note` | Save a research note with tags |
| `list_notes` | List saved research notes |
| `read_note` | Read a saved note by ID |
| `delete_note` | Delete a saved note |
| `finalize_report` | Compose a Deep Research report from notes |
| `ingest_openai_webhook` | Create note from OpenAI webhook event |

### Trading Tools (12 tools)

| Tool | Description |
|------|-------------|
| `list_wallet_token_balances` | List SPL token balances for a managed wallet |
| `resolve_token` | Resolve token name/symbol to Solana mint addresses |
| `smart_sell` | Attempts multiple outputs and slippages to execute sell |
| `smart_buy` | Attempts multiple inputs and slippages to execute buy |
| `trade` | Unified buy/sell entrypoint with ExactIn/ExactOut support |
| `execute_buy_preview` | Preview buy without sending transaction |
| `execute_sell_preview` | Preview sell without sending transaction |
| `execute_buy` | Execute token buy order using SOL |
| `execute_sell` | Execute token sell order for SOL |
| `execute_sell_all` | Sell entire token balance |
| `execute_sell_all_preview` | Preview selling entire balance |
| `list_managed_wallets` | List available managed wallets |

## Agent Tools (44 base + 3 conditional)

### Socials & Analysis (17 tools)

| Tool | Description |
|------|-------------|
| `socials_orchestrate` | Run modular socials orchestrator with refresh-aware enrich |
| `get_twitter_history` | Fetch tweets and profile snapshots from DB |
| `get_twitter_profile` | Fetch Twitter/X profile summary |
| `get_twitter_recent_tweets` | Fetch recent tweets for a profile |
| `get_twitter_community_meta` | Fetch Twitter/X Community metadata |
| `get_twitter_community_posts` | Fetch recent Community posts |
| `get_twitter_community_members` | Fetch Community members (heavy operation) |
| `get_telegram_group_meta` | Fetch Telegram group/channel metadata |
| `extract_website_content` | Render and extract website content |
| `extract_websites_for_token` | Extract multiple websites |
| `discover_official_links` | Merge DB links + website-derived social links |
| `get_token_links_from_db` | Return current socials and websites from DB |
| `ensure_token_activated` | Ensure token exists in DB |
| `ensure_token_enriched` | Trigger enrichment and poll for socials |
| `get_agent_memory` | Read-only access to per-token agent memory |
| `get_media_from_tweet` | Get all media from a specific tweet |
| `fetch_market_overview` | Quick market overview from DexScreener |

### Market Data & DexScreener (11 tools)

| Tool | Description |
|------|-------------|
| `dexscreener_pair_details` | Fetch latest pair details by chain and pairId |
| `dexscreener_token_profiles` | Fetch token profiles (metadata/links) |
| `dexscreener_token_boosts_latest` | Fetch latest token boosts (popularity) |
| `dexscreener_token_boosts_top` | Fetch top boosted tokens |
| `dexscreener_search` | Free-text search for tokens/pairs |
| `dexscreener_tokens` | Fetch token details for addresses |
| `dexscreener_token_pairs` | Fetch pairs for a specific token |
| `resolve_symbol_to_mints` | Resolve symbol to Solana mint addresses |
| `get_token_price` | Get current token price via Jupiter |
| `verify_relative_prediction` | Verify comparative claims between tokens |
| `verify_tweet_prediction` | Verify price predictions in tweets |
| `get_prediction_history` | Retrieve historical prediction scores |

### Trading Execution (13 tools)

| Tool | Description |
|------|-------------|
| `execute_buy` | Execute token buy order using SOL |
| `execute_sell` | Execute token sell order for SOL |
| `execute_sell_all` | Sell entire token balance |
| `execute_sell_partial` | Sell specific token amount |
| `execute_buy_preview` | Preview buy without transaction |
| `execute_sell_preview` | Preview sell without transaction |
| `execute_sell_all_preview` | Preview selling entire balance |
| `get_wallet_balance` | Get SOL and token balances |
| `list_managed_wallets` | List all available managed wallets |
| `get_wallet_holdings` | Complete wallet holdings analysis |
| `get_transaction_status` | Check transaction status by hash |

### Conditional Tools (3 tools)

| Tool | Condition | Description |
|------|-----------|-------------|
| `analyze_token_ohlcv_range` | `includeOHLCV` | Fetch OHLCV data with explicit time range |
| `web_search` | `includeWebSearch && ENABLE_WEB_SEARCH` | Web search capability |
| `code_interpreter` | `includeCodeInterpreter && ENABLE_CODE_INTERPRETER` | Code execution in container |

## Tool Comparison

### Shared Functionality (~11 tools)
Both systems implement similar trading execution tools:
- Buy/sell execution and previews
- Wallet management
- Token resolution (different implementations)

### MCP-Unique Tools (34 tools)
- **Infrastructure**: Process spawning, monitoring, killing
- **Report Management**: Comprehensive report CRUD operations
- **Voice Debug**: Realtime Voice debugging
- **Deep Research**: Note-taking and report composition
- **Smart Trading**: Multi-attempt buy/sell strategies

### Agent-Unique Tools (33 tools)
- **Social Media**: Deep Twitter/X analysis
- **Telegram**: Group metadata extraction
- **Website Analysis**: Content extraction and link discovery
- **DexScreener Integration**: Comprehensive market data
- **Prediction Verification**: Tweet prediction analysis
- **Token Management**: DB activation and enrichment

## Usage Patterns

### MCP Server
- Accessed via MCP protocol by Claude or other AI assistants
- Focus on infrastructure and long-running operations
- Manages background processes and report generation
- Provides research and analysis tools

### Agent Tools
- Used directly by the token analysis agent
- Focus on real-time data gathering
- Heavy social media and market data integration
- Direct trading execution capabilities

## Environment Variables

### MCP Server
- `TOKEN_AI_MCP_ENABLE_RUN_TOOLS`: Enable/disable run management tools (default: 1)
- `TOKEN_AI_MAX_CONCURRENCY`: Maximum concurrent runs (default: 3)
- `TOKEN_AI_LOGS_PER_RUN_LIMIT`: Log lines per run (default: 200)
- `TOKEN_AI_CHILD_MAX_MB`: Child process memory limit (default: 1024)
- `TAVILY_API_KEY`: Required for web search
- `TOKEN_AI_UI_PORT`: UI server port (default: 3013)

### Agent Tools
- `ENABLE_WEB_SEARCH`: Enable web search tool
- `ENABLE_CODE_INTERPRETER`: Enable code interpreter tool

## Tool Statistics

| System | Base Tools | Conditional | Total |
|--------|------------|-------------|-------|
| MCP Server | 52 | 0 | 52 |
| Agent | 44 | 3 | 47 |
| **Combined Unique** | | | **~85** |

*Note: Approximately 11 tools have overlapping functionality between systems*