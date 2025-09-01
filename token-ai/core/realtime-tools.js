// Canonical Realtime tool registry for the on-site voice agent.
// Imported by server (/realtime/tools and /realtime/bootstrap) and used by the UI.

export function getRealtimeTools() {
  return [
    // Agent controls
    { type:'function', name:'run_agent', description:'Run the Token-AI analyzer for a Solana token mint', parameters:{ type:'object', properties:{ mint:{ type:'string', description:'Token mint address (base58)' } }, required:['mint'] } },
    { type:'function', name:'get_latest_analysis', description:'Fetch latest analysis summary', parameters:{ type:'object', properties:{} } },
    { type:'function', name:'voice_health', description:'Fetch realtime voice health summary', parameters:{ type:'object', properties:{ session:{ type:'string' } } } },
    { type:'function', name:'voice_debug_save', description:'Save current session voice logs to server', parameters:{ type:'object', properties:{ note:{ type:'string' }, session:{ type:'string' } } } },

    // Discovery and resolution
    { type:'function', name:'resolve_token', description:'Resolve a token by name/symbol to a Solana mint address', parameters:{ type:'object', properties:{ query:{ type:'string', description:'e.g., BONK, JUP, CLANKER' }, chain:{ type:'string', enum:['solana'], default:'solana' } }, required:['query'] } },
    { type:'function', name:'web_search', description:'Search the web and return relevant snippets', parameters:{ type:'object', properties:{ query:{ type:'string' } }, required:['query'] } },
    { type:'function', name:'fetch_url', description:'Fetch a URL and summarize content/metadata', parameters:{ type:'object', properties:{ url:{ type:'string' } }, required:['url'] } },
    { type:'function', name:'search_reports', description:'Search local analysis reports', parameters:{ type:'object', properties:{ query:{ type:'string' } }, required:['query'] } },
    { type:'function', name:'dexscreener_search', description:'Search DexScreener for tokens/pairs', parameters:{ type:'object', properties:{ query:{ type:'string' } }, required:['query'] } },
    { type:'function', name:'discover_official_links', description:'Discover official links for a token', parameters:{ type:'object', properties:{ mint:{ type:'string' } }, required:['mint'] } },
    { type:'function', name:'get_token_links_from_db', description:'Read cached official links from DB', parameters:{ type:'object', properties:{ mint:{ type:'string' } }, required:['mint'] } },

    // Market data tools
    { type:'function', name:'get_token_ohlcv', description:'Get OHLCV price data for a token. Always use resolve_token FIRST to get the mint address from a symbol/name.', parameters:{ type:'object', properties:{ mint:{ type:'string', description:'Token mint address (use resolve_token to get this)' }, hours:{ type:'integer', description:'Hours of history (1-336, default 6)', minimum:1, maximum:336 } }, required:['mint'] } },

    // Agent workflow helpers
    { type:'function', name:'wait_for_report_by_mint', description:'Wait until a new report for a mint appears', parameters:{ type:'object', properties:{ mint:{ type:'string' }, timeout_sec:{ type:'integer' }, poll_ms:{ type:'integer' } }, required:['mint'] } },
    { type:'function', name:'finalize_report', description:'Finalize a research report with title', parameters:{ type:'object', properties:{ title:{ type:'string' }, outline:{ type:'array', items:{ type:'string' } }, include_notes:{ type:'array', items:{ type:'string' } }, extra_context:{ type:'object' } }, required:['title'] } },

    // Wallets & aliases
    { type:'function', name:'list_managed_wallets', description:'List managed wallets', parameters:{ type:'object', properties:{ search:{ type:'string' }, limit:{ type:'integer' }, offset:{ type:'integer' }, include_admin:{ type:'boolean' } } } },
    { type:'function', name:'list_aliases', description:'List wallet aliases for current user', parameters:{ type:'object', properties:{} } },
    { type:'function', name:'add_wallet_alias', description:'Add or update a wallet alias', parameters:{ type:'object', properties:{ wallet_id:{ type:'string' }, alias:{ type:'string' } }, required:['wallet_id','alias'] } },
    { type:'function', name:'set_default_wallet', description:'Set default wallet by id/alias/hint', parameters:{ type:'object', properties:{ wallet_id:{ type:'string' }, alias:{ type:'string' }, wallet_alias:{ type:'string' }, wallet_hint:{ type:'string' }, wallet:{ type:'string' } } } },
    { type:'function', name:'list_wallet_token_balances', description:'List SPL balances for a wallet', parameters:{ type:'object', properties:{ wallet_id:{ type:'string' }, min_ui:{ type:'number' }, limit:{ type:'integer' } }, required:['wallet_id'] } },

    // Trade previews
    { type:'function', name:'execute_buy_preview', description:'Preview a buy', parameters:{ type:'object', properties:{ token_mint:{ type:'string' }, sol_amount:{ type:'number' }, slippage_bps:{ type:'integer' } }, required:['token_mint','sol_amount'] } },
    { type:'function', name:'execute_sell_preview', description:'Preview a sell', parameters:{ type:'object', properties:{ token_mint:{ type:'string' }, token_amount:{ type:'number' }, slippage_bps:{ type:'integer' } }, required:['token_mint','token_amount'] } },

    // Direct trade tools (execute when explicitly instructed)
    { type:'function', name:'execute_buy', description:'Execute a buy for a token', parameters:{ type:'object', properties:{ wallet_id:{ type:'string' }, token_mint:{ type:'string' }, sol_amount:{ type:'number' }, priority_lamports:{ type:'integer' }, slippage_bps:{ type:'integer' } }, required:['wallet_id','token_mint','sol_amount'] } },
    { type:'function', name:'execute_sell', description:'Execute a sell for a token', parameters:{ type:'object', properties:{ wallet_id:{ type:'string' }, token_mint:{ type:'string' }, token_amount:{ type:'number' }, output_mint:{ type:'string' }, priority_lamports:{ type:'integer' }, slippage_bps:{ type:'integer' } }, required:['wallet_id','token_mint','token_amount'] } },
    { type:'function', name:'execute_sell_all', description:'Sell entire token balance', parameters:{ type:'object', properties:{ wallet_id:{ type:'string' }, token_mint:{ type:'string' }, priority_lamports:{ type:'integer' }, slippage_bps:{ type:'integer' } }, required:['wallet_id','token_mint'] } },

    // Robust trade helpers
    { type:'function', name:'smart_buy', description:'Robust buy helper; tries routes/slippage', parameters:{ type:'object', properties:{ wallet_id:{ type:'string' }, token_mint:{ type:'string' }, sol_amount:{ type:'number' }, slippages_bps:{ type:'array', items:{ type:'integer' } }, max_price_impact_pct:{ type:'number' } }, required:['wallet_id','token_mint','sol_amount'] } },
    { type:'function', name:'smart_sell', description:'Robust sell helper; tries outputs/slippage', parameters:{ type:'object', properties:{ wallet_id:{ type:'string' }, token_mint:{ type:'string' }, token_amount:{ type:'number' }, percent_of_balance:{ type:'number' }, outputs:{ type:'array', items:{ type:'string' } }, slippages_bps:{ type:'array', items:{ type:'integer' } }, max_price_impact_pct:{ type:'number' } }, required:['wallet_id','token_mint'] } },
    { type:'function', name:'trade', description:'Unified trade (buy/sell) with flexible args', parameters:{ type:'object', properties:{ action:{ type:'string', enum:['buy','sell'] }, wallet_id:{ type:'string' }, token_mint:{ type:'string' }, sol_amount:{ type:'number' }, token_amount:{ type:'number' }, percent_of_balance:{ type:'number' }, outputs:{ type:'array', items:{ type:'string' } }, output_mint:{ type:'string' }, slippages_bps:{ type:'array', items:{ type:'integer' } }, max_price_impact_pct:{ type:'number' }, priority_lamports:{ type:'integer' } }, required:['action','wallet_id','token_mint'] } },
  ];
}
