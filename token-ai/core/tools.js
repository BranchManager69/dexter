// token-ai/core/tools.js

/**
 * This file contains the tool definitions for the token-ai agent.
 * 
 * The buildResponsesTools function builds the tool list for the responses.
 *       analyze_token_socials tool      (always included).
 *       analyze_token_ohlcv_range tool  (if includeOHLCV is true).
 *       web_search_preview tool         (if includeWebSearch is true).
 *       code_interpreter tool           (if includeCodeInterpreter is true).
 * 
 * TODO: This file is decent, but each tool needs a lot of logical improvements.
 *       For example, the analyze_token_socials tool should be split into multiple tools.
 *                ... the analyze_token_ohlcv_range tool should be split into multiple tools.
 *       Many more tools need to be added.
 */

// Build Responses API tool list (custom + built-ins)
import { ENABLE_WEB_SEARCH, ENABLE_CODE_INTERPRETER } from '../settings.js';

export function buildResponsesTools({ includeWebSearch, includeCodeInterpreter, includeOHLCV }) {
  const tools = [
    {
      type: 'function',
      name: 'socials_orchestrate',
      description: 'Run modular socials orchestrator (market, website, telegram, X) with refresh-aware enrich. Returns merged report.',
      parameters: {
        type: 'object',
        properties: {
          mint_address: { type: 'string', description: 'Solana token mint address' },
          steps: { type: 'string', description: 'Comma list: market,website,telegram,x', default: 'market,website,telegram,x' },
          x_concurrency: { type: 'integer', minimum: 1, maximum: 2, default: 2 },
          collect_members: { type: 'boolean', description: 'If true, scrape X Community members (heavy). Default false.', default: false },
          max_members: { type: 'integer', minimum: 10, maximum: 1000, default: 50 }
        },
        required: ['mint_address','steps','x_concurrency','collect_members','max_members'],
        additionalProperties: false
      },
      strict: true,
    },
    {
      type: 'function',
      name: 'verify_relative_prediction',
      description: 'Verify comparative claims (e.g., X outperforms Y) by computing returns for multiple tokens over a window after a tweet. Accepts mint_addresses directly or resolves symbols via DexScreener.',
      parameters: {
        type: 'object',
        properties: {
          tweet_id: { type: 'string', description: 'Tweet ID anchoring the start time' },
          window_minutes: { type: 'integer', minimum: 60, maximum: 20160, default: 1440 },
          claim: {
            type: 'object',
            description: 'Comparative claim type',
            properties: {
              type: { type: 'string', enum: ['outperform','underperform','spread_target','ratio_target'], default: 'outperform' }
            },
            required: ['type'],
            additionalProperties: false
          },
          primary_index: { type: 'integer', minimum: 0, description: 'Index of primary token in mint_addresses/symbols (default 0)' },
          against_index: { type: 'integer', minimum: 0, description: 'Index of comparison token when a single comparator is intended' },
          threshold_pct: { type: 'number', description: 'Optional threshold for spread/ratio claims' },
          targets: { type: 'array', description: 'List of tokens by mint or symbol', items: { type: 'string' }, minItems: 2, maxItems: 5 },
          target_kind: { type: 'string', enum: ['mint','symbol'], description: 'How to interpret targets[]' },
          chain_id: { type: 'string', default: 'solana' }
        },
        required: ['tweet_id','window_minutes','claim','targets','target_kind','chain_id','primary_index','against_index','threshold_pct'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'dexscreener_pair_details',
      description: 'Fetch latest pair details from DexScreener by chain and pairId.',
      parameters: {
        type: 'object',
        properties: {
          chain_id: { type: 'string' },
          pair_id: { type: 'string' }
        },
        required: ['chain_id','pair_id'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'dexscreener_token_profiles',
      description: 'Fetch latest token profiles (metadata/links) from DexScreener.',
      parameters: {
        type: 'object',
        properties: {
          chain_id: { type: 'string' },
          token_addresses: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 }
        },
        required: ['chain_id','token_addresses'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'dexscreener_token_boosts_latest',
      description: 'Fetch latest token boosts (popularity) from DexScreener.',
      parameters: {
        type: 'object',
        properties: {
          chain_id: { type: 'string' },
          token_addresses: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 }
        },
        required: ['chain_id','token_addresses'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'dexscreener_token_boosts_top',
      description: 'Fetch top boosted tokens from DexScreener.',
      parameters: {
        type: 'object',
        properties: {
          chain_id: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        },
        required: ['chain_id','limit'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'dexscreener_search',
      description: 'Search DexScreener for tokens/pairs by free-text query (e.g., symbol, address, name). Returns raw search results; use resolve_symbol_to_mints for Solana-focused mint resolution.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text query: symbol, address, or name' },
          chain_id: { type: 'string', description: 'Optional chain filter (e.g., solana, ethereum, bsc)', default: '' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
        },
        required: ['query','limit','chain_id'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'resolve_symbol_to_mints',
      description: 'Resolve a symbol/ticker to likely Solana mint addresses using DexScreener search + optional enrichment (tokens/pairs). Returns a best_pick and ranked candidates with score breakdown and evidence.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Token symbol or query string (e.g., BONK, WIF)' },
          chain_id: { type: 'string', description: 'Target chain (default: solana)', default: 'solana' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          enrich: { type: 'boolean', description: 'If true, fetch token details via DexScreener tokens endpoint', default: true },
          pairs_enrich_limit: { type: 'integer', minimum: 0, maximum: 10, default: 3 },
          prefer_base: { type: 'boolean', description: 'Prefer/require base token role when resolving symbol', default: true },
          exclude_generics: { type: 'boolean', description: 'Exclude generic base/quote tokens like SOL/USDC/USDT', default: true }
        },
        required: ['symbol','chain_id','limit','enrich','pairs_enrich_limit','prefer_base','exclude_generics'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'dexscreener_tokens',
      description: 'Fetch token details from DexScreener tokens endpoint for a chain and list of token addresses.',
      parameters: {
        type: 'object',
        properties: {
          chain_id: { type: 'string', description: 'Chain ID (e.g., solana, ethereum, bsc)' },
          token_addresses: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 }
        },
        required: ['chain_id','token_addresses'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'dexscreener_token_pairs',
      description: 'Fetch DexScreener pairs for a specific token on a given chain.',
      parameters: {
        type: 'object',
        properties: {
          chain_id: { type: 'string' },
          token_address: { type: 'string' }
        },
        required: ['chain_id','token_address'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'get_twitter_history',
      description: 'Fetch tweets and optional profile snapshots from DB without scraping.',
      parameters: {
        type: 'object',
        properties: {
          mint_address: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          since_time: { type: 'string', description: 'ISO timestamp filter (tweets >= this time)' },
          since_days: { type: 'number', description: 'Alternative to since_time; e.g., 7 = last 7 days' },
          include_replies: { type: 'boolean', default: true },
          include_retweets: { type: 'boolean', default: true },
          include_deleted: { type: 'boolean', default: true },
          author: { type: 'string', description: 'Filter by author handle (e.g., @user)' },
          include_snapshots: { type: 'boolean', default: true },
          snapshots_limit: { type: 'integer', minimum: 1, maximum: 200, default: 20 }
        },
        required: ['mint_address','limit','since_time','since_days','include_replies','include_retweets','include_deleted','author','include_snapshots','snapshots_limit'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'get_agent_memory',
      description: 'Read-only access to per-token agent memory (scoped digest and selected fields). Never writes.',
      parameters: {
        type: 'object',
        properties: {
          mint_address: { type: 'string', description: 'Solana token mint address' },
          scope: { type: 'string', enum: ['general','comms','pros','cons','pros_cons','summary','market','full'], default: 'general' },
          max_chars: { type: 'integer', minimum: 100, maximum: 20000, default: 4000 }
        },
        required: ['mint_address','scope','max_chars'],
        additionalProperties: false
      },
      strict: true,
    },
    {
      type: 'function',
      name: 'ensure_token_activated',
      description: 'Ensure the token exists in DB by activating via admin API if missing.',
      parameters: {
        type: 'object',
        properties: { mint_address: { type: 'string' } },
        required: ['mint_address'], additionalProperties: false
      }, strict: true
    },
    {
      type: 'function',
      name: 'ensure_token_enriched',
      description: 'Trigger enrich and optionally short-poll DB for socials/websites presence.',
      parameters: {
        type: 'object',
        properties: {
          mint_address: { type: 'string' },
          timeout_sec: { type: 'integer', minimum: 1, maximum: 120, default: 30 },
          poll: { type: 'boolean', default: true }
        },
        required: ['mint_address','timeout_sec','poll'], additionalProperties: false
      }, strict: true
    },
    {
      type: 'function',
      name: 'get_token_links_from_db',
      description: 'Return current socials and websites recorded in DB for the token.',
      parameters: { type:'object', properties:{ mint_address:{type:'string'} }, required:['mint_address'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'extract_website_content',
      description: 'Render and extract a single website (meta, text, links, social links, addresses, screenshot).',
      parameters: { type:'object', properties:{ url:{type:'string'} }, required:['url'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'extract_websites_for_token',
      description: 'Extract multiple websites and return per-site results (see extract_website_content).',
      parameters: { type:'object', properties:{ urls:{type:'array', items:{type:'string'}} }, required:['urls'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'discover_official_links',
      description: 'Merge DB links + website-derived social links into a canonical set with sources.',
      parameters: {
        type:'object',
        properties:{ mint_address:{type:'string'}, urls:{type:'array', items:{type:'string'}} },
        required:['mint_address','urls'], additionalProperties:false
      }, strict:true
    },
    {
      type: 'function',
      name: 'get_twitter_profile',
      description: 'Fetch a Twitter/X profile summary given a URL (session required).',
      parameters: { type:'object', properties:{ twitter_url:{type:'string'} }, required:['twitter_url'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'get_twitter_recent_tweets',
      description: 'Fetch recent tweets for a Twitter/X profile URL.',
      parameters: { type:'object', properties:{ twitter_url:{type:'string'}, limit:{type:'integer',minimum:1,maximum:200,default:50}, include_replies:{type:'boolean',default:true} }, required:['twitter_url','limit','include_replies'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'get_twitter_community_meta',
      description: 'Fetch Twitter/X Community metadata (name, rules, member counts, private/public).',
      parameters: { type:'object', properties:{ twitter_url:{type:'string'} }, required:['twitter_url'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'get_twitter_community_posts',
      description: 'Fetch recent Twitter/X Community posts (lightweight, no members).',
      parameters: { type:'object', properties:{ twitter_url:{type:'string'}, limit:{type:'integer',minimum:1,maximum:100,default:10} }, required:['twitter_url','limit'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'get_twitter_community_members',
      description: 'HEAVY: Fetch admins/moderators/members for a Twitter/X Community (requires explicit enable).',
      parameters: { type:'object', properties:{ twitter_url:{type:'string'}, limit:{type:'integer',minimum:10,maximum:2000,default:200}, collect_members:{type:'boolean',default:false} }, required:['twitter_url','limit','collect_members'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'get_telegram_group_meta',
      description: 'Fetch Telegram group/channel metadata (Bot API).',
      parameters: { type:'object', properties:{ telegram_url:{type:'string'} }, required:['telegram_url'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'fetch_market_overview',
      description: 'Fetch quick market overview (DexScreener) for a token mint.',
      parameters: { type:'object', properties:{ mint_address:{type:'string'} }, required:['mint_address'], additionalProperties:false }, strict:true
    },
    {
      type: 'function',
      name: 'get_media_from_tweet',
      description: 'Get all media (images, videos, cards) from a specific tweet by its ID. Use this when you want to see the media attachments from a particular tweet you\'ve already read.',
      parameters: {
        type: 'object',
        properties: {
          tweet_id: { type: 'string', description: 'The tweet ID to get media from' },
          include_metadata: { type: 'boolean', description: 'Include tweet text, author, and engagement stats', default: true }
        },
        required: ['tweet_id', 'include_metadata'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'verify_tweet_prediction',
      description: 'Verify price predictions/claims made in a tweet by comparing to actual OHLCV data. Use this to fact-check claims like "will pump", "going to dump", or specific price targets. Optionally pass mint_address to assert association and prediction_details/claims to avoid brittle regex.',
      parameters: {
        type: 'object',
        properties: {
          tweet_id: { type: 'string', description: 'The tweet ID containing the prediction to verify' },
          minutes_after: { type: 'number', description: 'Minutes after tweet to check (default 1440 = 24h)', minimum: 5, maximum: 20160, default: 1440 },
          prediction_type: { 
            type: 'string', 
            enum: ['pump', 'dump', 'target_price', 'auto_detect'],
            description: 'Type of prediction to look for', 
            default: 'auto_detect' 
          },
          mint_address: { type: 'string', description: 'Explicit mint address for association (required in strict mode).' }
        },
        required: ['tweet_id', 'minutes_after', 'prediction_type', 'mint_address'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'get_prediction_history',
      description: 'Retrieve historical tweet prediction scores from database. Use to check author credibility or analyze prediction patterns.',
      parameters: {
        type: 'object',
        properties: {
          token_address: { type: 'string', description: 'Token address to filter by' }
        },
        required: ['token_address'],
        additionalProperties: false
      },
      strict: true
    },
    
    // Trading execution tools
    {
      type: 'function',
      name: 'execute_buy',
      description: 'Execute a token buy order using SOL from a managed wallet',
      parameters: {
        type: 'object',
        properties: {
          wallet_id: { type: 'string', description: 'Managed wallet UUID from database' },
          token_mint: { type: 'string', description: 'Token mint address to buy' },
          sol_amount: { type: 'number', description: 'Amount of SOL to spend', minimum: 0.001 },
          slippage_bps: { type: 'integer', description: 'Slippage tolerance in basis points', default: 100 }
        },
        // OpenAI Responses strict schema: include every property in required
        required: ['wallet_id', 'token_mint', 'sol_amount', 'slippage_bps'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'execute_sell',
      description: 'Execute a token sell order for SOL from a managed wallet. Note: when sell_all=true, token_amount is ignored by the executor. Pass token_amount: 0 to satisfy schema.',
      parameters: {
        type: 'object',
        properties: {
          wallet_id: { type: 'string', description: 'Managed wallet UUID from database' },
          token_mint: { type: 'string', description: 'Token mint address to sell' },
          token_amount: { type: 'number', description: 'Amount of tokens to sell (in UI units, not raw). Use 0 when sell_all=true.', minimum: 0 },
          sell_all: { type: 'boolean', description: 'If true, sell entire token balance', default: false },
          slippage_bps: { type: 'integer', description: 'Slippage tolerance in basis points', default: 100 }
        },
        // Include all properties to satisfy strict schema validation
        required: ['wallet_id', 'token_mint', 'token_amount', 'sell_all', 'slippage_bps'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'execute_sell_all',
      description: 'Sell the entire token balance for SOL from a managed wallet (reads on-chain balance; no token_amount needed).',
      parameters: {
        type: 'object',
        properties: {
          wallet_id: { type: 'string', description: 'Managed wallet UUID from database' },
          token_mint: { type: 'string', description: 'Token mint address to sell' },
          slippage_bps: { type: 'integer', description: 'Slippage tolerance in basis points', default: 100 }
        },
        required: ['wallet_id','token_mint','slippage_bps'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'execute_sell_partial',
      description: 'Sell a specific token_amount (UI units) for SOL from a managed wallet.',
      parameters: {
        type: 'object',
        properties: {
          wallet_id: { type: 'string', description: 'Managed wallet UUID from database' },
          token_mint: { type: 'string', description: 'Token mint address to sell' },
          token_amount: { type: 'number', description: 'Amount of tokens to sell (UI units)', minimum: 0.000000001 },
          slippage_bps: { type: 'integer', description: 'Slippage tolerance in basis points', default: 100 }
        },
        required: ['wallet_id','token_mint','token_amount','slippage_bps'],
        additionalProperties: false
      },
      strict: true
    },
    // --- Preview (dry-run) trading tools ---
    {
      type: 'function',
      name: 'execute_buy_preview',
      description: 'Preview a buy without sending a transaction. Returns expected tokens and price impact.',
      parameters: {
        type: 'object',
        properties: {
          token_mint: { type: 'string', description: 'Token mint address to buy' },
          sol_amount: { type: 'number', description: 'Amount of SOL to spend', minimum: 0.001 },
          slippage_bps: { type: 'integer', description: 'Slippage tolerance in basis points', default: 100 }
        },
        required: ['token_mint','sol_amount','slippage_bps'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'execute_sell_preview',
      description: 'Preview a sell without sending a transaction. Returns expected SOL and price impact.',
      parameters: {
        type: 'object',
        properties: {
          token_mint: { type: 'string', description: 'Token mint address to sell' },
          token_amount: { type: 'number', description: 'Amount of tokens to sell (UI units)', minimum: 0 },
          slippage_bps: { type: 'integer', description: 'Slippage tolerance in basis points', default: 100 }
        },
        required: ['token_mint','token_amount','slippage_bps'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'execute_sell_all_preview',
      description: 'Preview selling the entire token balance (reads balance; does not send).',
      parameters: {
        type: 'object',
        properties: {
          wallet_id: { type: 'string', description: 'Managed wallet UUID from database' },
          token_mint: { type: 'string', description: 'Token mint address to sell' },
          slippage_bps: { type: 'integer', description: 'Slippage tolerance in basis points', default: 100 }
        },
        required: ['wallet_id','token_mint','slippage_bps'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'get_wallet_balance',
      description: 'Get SOL and token balances for a managed wallet',
      parameters: {
        type: 'object',
        properties: {
          wallet_id: { type: 'string', description: 'Managed wallet UUID from database' },
          token_mint: { type: 'string', description: 'Optional: specific token to check balance for. Pass empty string to return SOL and general balances.' }
        },
        // Strict schema requires all properties; allow empty token_mint for general balance
        required: ['wallet_id','token_mint'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'list_managed_wallets',
      description: 'List all available managed wallets for trading',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Filter by label or public key (case-insensitive)' },
          limit: { type: 'integer', description: 'Max items to return (1-500)', minimum: 1, maximum: 500 },
          offset: { type: 'integer', description: 'Offset for pagination', minimum: 0 },
          include_admin: { type: 'boolean', description: 'Include admin/superadmin-owned wallets (default false unless env flag on)' }
        },
        required: ['search','limit','offset','include_admin'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'get_wallet_holdings',
      description: 'Get complete wallet holdings analysis including all tokens, values, and liquidity metrics. Use this to see ALL tokens in a wallet.',
      parameters: {
        type: 'object',
        properties: {
          wallet_address: { type: 'string', description: 'Wallet public key address to analyze' }
        },
        required: ['wallet_address'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'get_token_price',
      description: 'Get current token price via Jupiter quote API',
      parameters: {
        type: 'object',
        properties: {
          token_mint: { type: 'string', description: 'Token mint address' },
          amount_sol: { type: 'number', description: 'Amount of SOL to quote', default: 1.0 }
        },
        // Include all properties in required for strict schema
        required: ['token_mint','amount_sol'],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: 'function',
      name: 'get_transaction_status',
      description: 'Check the status of a transaction by hash',
      parameters: {
        type: 'object',
        properties: {
          tx_hash: { type: 'string', description: 'Transaction signature/hash to check' }
        },
        required: ['tx_hash'],
        additionalProperties: false
      },
      strict: true
    },
  ];
  if (includeOHLCV) {
    tools.push({
      type: 'function',
      name: 'analyze_token_ohlcv_range',
      description: 'Fetch fast OHLCV with explicit time range (epoch seconds). Prefer Birdeye v3 when available.',
      parameters: {
        type: 'object',
        properties: {
          mint_address: { type: 'string', description: 'Token mint address' },
          time_from: { type: 'integer', description: 'Start time (epoch seconds)' },
          time_to: { type: 'integer', description: 'End time (epoch seconds)' },
          interval_minutes: { type: 'number', minimum: 1, maximum: 60, default: 1 },
        },
        required: ['mint_address','time_from','time_to','interval_minutes'],
        additionalProperties: false
      },
      strict: true,
    });
  }
  if (includeWebSearch && ENABLE_WEB_SEARCH) {
    tools.push({ type: 'web_search' });
  }
  if (includeCodeInterpreter && ENABLE_CODE_INTERPRETER) {
    tools.push({ type: 'code_interpreter', container: { type: 'auto' } });
  }
  return tools;
}
