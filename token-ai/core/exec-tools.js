// token-ai/core/exec-tools.js

/**
 * This file contains the tool executor for the token-ai agent.
 * 
 * The createToolExecutor function creates the tool executor.
 *   It contains the fetchBirdeyeOHLCVRange function. This should be moved to a separate file.
 * 
 * The executeTool function executes the tool.
 *   It contains the switch statement that executes the tool.
 *     TODO: This should be much more dynamic; perhaps a map of tool names to functions, etc.
 * 
 * Simple cache helpers:
 *   - ensureCacheDir: Ensures the cache directory exists.
 *   - cachePath: Gets the cache path for a given key.
 *   - withCache: Caches the result of a function call (if ttlMs > 0).
 */

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
// axios no longer used here; MCP handles network calls
// No longer using local DB or child processes from exec-tools
// Foundation utilities are heavy (db + config); lazy-load inside handlers when needed
import { ToolsAdapter } from './tools-adapter.mjs';
// Website/Twitter/Telegram/Market tools now proxied via MCP
import { loadAgentStateStore as loadAgentState } from '../agents/store.js';
import { buildScopedDigest } from '../agents/memory.js';
import { formatOrchestratorData } from './format-orchestrator.js';
// Lazy-load wallet utils to avoid dragging prisma/logger unless needed
async function getWalletUtils(){
  const mod = await import('../trade-manager/wallet-utils.js');
  return { loadWallet: mod.loadWallet, listManagedWallets: mod.listManagedWallets };
}
// Trading and RPC heavy utils now handled by MCP
import { registerTool, registerLazyTool, hasTool, getTool as getRegisteredTool } from './tools-registry.js';
import { isBase58Mint, isHttpUrl } from './validation.js';

// OHLCV handled via MCP; fast util no longer used here
import { executeSellInternal, getQuoteSafe } from '../trade-manager/exec-helpers.js';


/* Main tool executor */

// Create the tool executor.
export function createToolExecutor(config) {
  // Helper: post agent events directly (used for live sub-step updates)
  async function postAgentEvent(event, data){
    try {
      const url = process.env.TOKEN_AI_EVENTS_URL || '';
      if (!url) return;
      const headers = { 'content-type': 'application/json' };
      if (process.env.TOKEN_AI_EVENTS_TOKEN) headers['x-agent-token'] = process.env.TOKEN_AI_EVENTS_TOKEN;
      await fetch(url, { method: 'POST', headers, body: JSON.stringify({ event, data }) }).catch(()=>{});
    } catch {}
  }
  // Minimal MCP metrics summary (no-op but safe)
  const mcpStats = { totals: {}, tools: {} };
  function stat(name, kind, ms){
    try {
      const n = String(name||'unknown');
      const k = String(kind||'event');
      mcpStats.totals[k] = (mcpStats.totals[k]||0) + 1;
      const t = mcpStats.tools[n] = (mcpStats.tools[n] || { calls:0, errors:0, mcp_ok:0, mcp_fallback:0, time_ms:0 });
      if (k === 'mcp_ok') t.mcp_ok++; else if (k === 'mcp_fallback') t.mcp_fallback++; else if (k === 'error') t.errors++; else t.calls++;
      if (typeof ms === 'number' && Number.isFinite(ms)) t.time_ms += ms;
    } catch {}
  }

  const mcpEnabled = String(process.env.TOKEN_AI_ENABLE_MCP || '0') === '1';
  const toolsAdapter = mcpEnabled ? new ToolsAdapter({ enableMcp: true }) : null;

  const { PROJECT_ROOT, SKIP_OHLCV, CLI_OHLCV_INTERVAL, FAST_OHLCV_PROVIDER } = config;

  // Register migrated tools in global registry (idempotent). Bind to this executor's config.
  try {
    if (!hasTool('analyze_token_ohlcv_range')) {
      registerTool('analyze_token_ohlcv_range', async (args) => {
        if (SKIP_OHLCV) return { skipped: true, reason: 'OHLCV disabled for this run' };
        if (!isBase58Mint(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'analyze_token_ohlcv_range', arguments: {
          mint_address: args.mint_address,
          time_from: args.time_from,
          time_to: args.time_to,
          interval_minutes: args.interval_minutes ?? CLI_OHLCV_INTERVAL
        }});
        if (res.isError) return { error: 'ohlcv_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('extract_website_content')) {
      registerTool('extract_website_content', async (args) => {
        const url = String(args.url||'');
        if (!isHttpUrl(url)) return { error: 'Invalid URL', url };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'extract_website_content', arguments: { url } });
        if (res.isError) return { error: 'extract_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('extract_websites_for_token')) {
      registerTool('extract_websites_for_token', async (args) => {
        const urls = Array.isArray(args.urls) ? args.urls.filter(u=>isHttpUrl(u)) : [];
        if (!urls.length) return { error: 'No valid URLs' };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'extract_websites_for_token', arguments: { urls } });
        if (res.isError) return { error: 'extract_websites_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('discover_official_links')) {
      registerTool('discover_official_links', async (args) => {
        if (!isBase58Mint(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'discover_official_links', arguments: { mint_address: args.mint_address, urls: args.urls } });
        if (res.isError) return { error: 'discover_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('get_twitter_profile')) {
      registerTool('get_twitter_profile', async (args) => {
        const url = String(args.twitter_url||'');
        if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'get_twitter_profile', arguments: { twitter_url: url } });
        if (res.isError) return { error: 'twitter_profile_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('get_twitter_recent_tweets')) {
      registerTool('get_twitter_recent_tweets', async (args) => {
        const url = String(args.twitter_url||'');
        if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'get_twitter_recent_tweets', arguments: { twitter_url: url, limit: args.limit, include_replies: args.include_replies } });
        if (res.isError) return { error: 'twitter_recent_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    // Twitter Community (lazy)
    if (!hasTool('get_twitter_community_meta')) {
      registerTool('get_twitter_community_meta', async (args) => {
        const url = String(args.twitter_url||'');
        if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'get_twitter_community_meta', arguments: { twitter_url: url } });
        if (res.isError) return { error: 'twitter_community_meta_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('get_twitter_community_posts')) {
      registerTool('get_twitter_community_posts', async (args) => {
        const url = String(args.twitter_url||'');
        if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'get_twitter_community_posts', arguments: { twitter_url: url, limit: args.limit } });
        if (res.isError) return { error: 'twitter_community_posts_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('get_twitter_community_members')) {
      registerTool('get_twitter_community_members', async (args) => {
        const url = String(args.twitter_url||'');
        if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
        if (args.collect_members !== true) return { skipped: true, reason: 'collect_members flag not enabled' };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'get_twitter_community_members', arguments: { twitter_url: url, limit: args.limit } });
        if (res.isError) return { error: 'twitter_community_members_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    // DexScreener family
    if (!hasTool('dexscreener_search')) {
      registerTool('dexscreener_search', async (args) => {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'dexscreener_search', arguments: { query: args.query, chain_id: args.chain_id, limit: args.limit } });
        if (res.isError) return { error: 'dexscreener_search_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('dexscreener_tokens')) {
      registerTool('dexscreener_tokens', async (args) => {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'dexscreener_tokens', arguments: { chain_id: args.chain_id, token_addresses: args.token_addresses } });
        if (res.isError) return { error: 'dexscreener_tokens_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('dexscreener_token_pairs')) {
      registerTool('dexscreener_token_pairs', async (args) => {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'dexscreener_token_pairs', arguments: { chain_id: args.chain_id, token_address: args.token_address } });
        if (res.isError) return { error: 'dexscreener_token_pairs_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('dexscreener_pair_details')) {
      registerTool('dexscreener_pair_details', async (args) => {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'dexscreener_pair_details', arguments: { chain_id: args.chain_id, pair_id: args.pair_id } });
        if (res.isError) return { error: 'dexscreener_pair_details_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('dexscreener_token_profiles')) {
      registerTool('dexscreener_token_profiles', async (args) => {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'dexscreener_token_profiles', arguments: { chain_id: args.chain_id, token_addresses: args.token_addresses } });
        if (res.isError) return { error: 'dexscreener_token_profiles_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('dexscreener_token_boosts_latest')) {
      registerTool('dexscreener_token_boosts_latest', async (args) => {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'dexscreener_token_boosts_latest', arguments: { chain_id: args.chain_id, token_addresses: args.token_addresses } });
        if (res.isError) return { error: 'dexscreener_token_boosts_latest_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    if (!hasTool('dexscreener_token_boosts_top')) {
      registerTool('dexscreener_token_boosts_top', async (args) => {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'dexscreener_token_boosts_top', arguments: { chain_id: args.chain_id, limit: args.limit } });
        if (res.isError) return { error: 'dexscreener_token_boosts_top_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    // Resolve symbol to mints (Solana)
    if (!hasTool('resolve_symbol_to_mints')) {
      registerTool('resolve_symbol_to_mints', async (args) => {
        try {
          const symbol = String(args.symbol || '').trim();
          const chain = (String(args.chain_id || 'solana').trim().toLowerCase() || 'solana');
          const limit = Math.min(Math.max(Number(args.limit || 10), 1), 50);
          if (!symbol) return { error: 'Missing symbol' };
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const out = await toolsAdapter.resolveToken(symbol, { chain, limit });
          const results = Array.isArray(out?.results) ? out.results : [];
          const mapCandidate = (r)=>({
            address: r.address,
            symbol: r.symbol,
            name: r.name||null,
            roles: ['base'],
            liquidity_usd_sum: Number(r.liquidity_usd||0),
            score: Number(r.score||0),
            score_breakdown: r.score_breakdown || {},
            confidence: r.confidence || undefined,
            top_pair: r.top_pairs && r.top_pairs[0] ? {
              dexId: r.top_pairs[0].dex_id || null,
              pairAddress: r.top_pairs[0].pair_address || null,
              price_usd: r.top_pairs[0].price_usd || null,
              liquidity_usd: r.top_pairs[0].liquidity_usd || null,
              volume24h_usd: r.top_pairs[0].volume24h_usd || null,
              url: r.top_pairs[0].url || null,
            } : null,
            top_pairs: r.top_pairs || []
          });
          const candidatesEnriched = results.map(mapCandidate);
          const best_pick = candidatesEnriched[0] || null;
          return { query: symbol, chain_id: chain, used_endpoints: ['mcp_resolve'], best_pick, candidates: candidatesEnriched };
        } catch (e) { return { error: 'Failed to resolve symbol to mints', details: e?.message }; }
      });
    }
    // Prediction verification (relative) via MCP
    if (!hasTool('verify_relative_prediction')) {
      registerTool('verify_relative_prediction', async (args) => {
        try {
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'verify_relative_prediction', arguments: args || {} });
          if (res.isError) return { error: 'verify_relative_prediction_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: `Failed to verify relative prediction: ${e.message}` }; }
      });
    }
    // Telegram
    if (!hasTool('get_telegram_group_meta')) {
      registerTool('get_telegram_group_meta', async (args) => {
        const url = String(args.telegram_url||'');
        if (!/^https?:\/\/t\.me\//i.test(url) && !/^@?\w+$/i.test(url.split('/').pop())) return { error: 'Invalid Telegram URL', url };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'get_telegram_group_meta', arguments: { telegram_url: url } });
        if (res.isError) return { error: 'telegram_meta_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    // Market
    if (!hasTool('fetch_market_overview')) {
      registerTool('fetch_market_overview', async (args) => {
        if (!isBase58Mint(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'fetch_market_overview', arguments: { mint_address: args.mint_address } });
        if (res.isError) return { error: 'market_overview_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      });
    }
    // Twitter history via MCP (no scraping)
    if (!hasTool('get_twitter_history')) {
      registerTool('get_twitter_history', async (args) => {
        try {
          if (!isBase58Mint(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'get_twitter_history', arguments: args || {} });
          if (res.isError) return { error: 'get_twitter_history_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: 'Failed to load twitter history', details: e?.message, mint_address: args.mint_address }; }
      });
    }
    // Trading: wallets and balances
    if (!hasTool('list_managed_wallets')) {
      registerTool('list_managed_wallets', async (args) => {
        try {
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'list_managed_wallets', arguments: {
            search: args?.search,
            limit: args?.limit,
            offset: args?.offset,
            include_admin: args?.include_admin
          }});
          if (res.isError) return { error: 'list_wallets_failed', details: res?.content?.[0]?.text || null };
          const wallets = res.structuredContent?.wallets || [];
          return { success: true, wallets, count: wallets.length };
        } catch (e) { return { error: `Failed to list wallets: ${e.message}` }; }
      });
    }
    if (!hasTool('get_wallet_balance')) {
      registerTool('get_wallet_balance', async (args) => {
        try {
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'list_wallet_token_balances', arguments: {
            wallet_id: args.wallet_id,
            min_ui: 0,
            limit: 999
          }});
          if (res.isError) return { error: 'balance_failed', details: res?.content?.[0]?.text || null };
          const items = res.structuredContent?.items || [];
          const solRow = items.find(x => x.ata === 'native') || items.find(x => String(x.mint||'').toLowerCase().startsWith('so1111'));
          const out = { success: true, wallet_id: args.wallet_id || null, sol: solRow ? Number(solRow.amount_ui) : 0 };
          if (args.token_mint) {
            const row = items.find(x => String(x.mint) === String(args.token_mint));
            out.token = row ? { mint: row.mint, balance: Number(row.amount_ui), decimals: row.decimals } : { mint: args.token_mint, balance: 0, decimals: 9 };
          }
          return out;
        } catch (e) { return { error: `Failed to get wallet balance: ${e.message}` }; }
      });
    }
    if (!hasTool('get_wallet_holdings')) {
      registerTool('get_wallet_holdings', async (args) => {
        try {
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'get_wallet_holdings', arguments: { wallet_address: args.wallet_address } });
          if (res.isError) return { error: 'wallet_holdings_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: `Failed to get wallet holdings: ${e.message}` }; }
      });
    }
    if (!hasTool('get_token_price')) {
      registerTool('get_token_price', async (args) => {
        try {
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const sol = Number(args.amount_sol || 1.0);
          const res = await toolsAdapter.mcp.callTool({ name:'execute_buy_preview', arguments: { token_mint: args.token_mint, sol_amount: sol } });
          if (res.isError) return { error: 'price_failed', details: res?.content?.[0]?.text || null };
          const body = res.structuredContent || {};
          const tokens = Number(body.expected_tokens || 0);
          return { success: true, token_mint: args.token_mint, sol_amount: sol, token_amount: tokens, price_impact: body.price_impact ?? null };
        } catch (e) { return { error: `Failed to get token price: ${e.message}` }; }
      });
    }
    // Trading: execute
    if (!hasTool('execute_buy')) {
      registerTool('execute_buy', async (args) => {
        try {
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          // Use ToolsAdapter wrapper if present, else raw MCP tool
          if (typeof toolsAdapter.executeBuy === 'function') {
            return await toolsAdapter.executeBuy({ wallet_id: args.wallet_id, token_mint: args.token_mint, sol_amount: args.sol_amount, slippage_bps: args.slippage_bps || 100, priority_lamports: args.priority_lamports });
          }
          const res = await toolsAdapter.mcp.callTool({ name:'execute_buy', arguments: { wallet_id: args.wallet_id, token_mint: args.token_mint, sol_amount: args.sol_amount, slippage_bps: args.slippage_bps, priority_lamports: args.priority_lamports } });
          if (res.isError) return { error: 'buy_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: `Failed to execute buy: ${e.message}` }; }
      });
    }
    if (!hasTool('execute_sell')) {
      registerTool('execute_sell', async (args) => {
        try {
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'execute_sell', arguments: {
            wallet_id: args.wallet_id,
            token_mint: args.token_mint,
            token_amount: args.token_amount,
            slippage_bps: args.slippage_bps,
            priority_lamports: args.priority_lamports,
            output_mint: args.output_mint
          }});
          if (res.isError) return { error: 'sell_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: `Failed to execute sell: ${e.message}` }; }
      });
    }
    if (!hasTool('execute_sell_all')) {
      registerTool('execute_sell_all', async (args) => {
        try {
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'execute_sell_all', arguments: {
            wallet_id: args.wallet_id,
            token_mint: args.token_mint,
            slippage_bps: args.slippage_bps,
            priority_lamports: args.priority_lamports
          }});
          if (res.isError) return { error: 'sell_all_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: `Failed to execute sell_all: ${e.message}` }; }
      });
    }
    if (!hasTool('execute_sell_partial')) {
      registerTool('execute_sell_partial', async (args) => {
        // Alias to execute_sell (partial) on MCP
        return await (getRegisteredTool('execute_sell'))(args);
      });
    }
    if (!hasTool('get_transaction_status')) {
      registerTool('get_transaction_status', async (args) => {
        try {
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'get_transaction_status', arguments: { tx_hash: args.tx_hash } });
          if (res.isError) return { error: 'tx_status_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: `Failed to get transaction status: ${e.message}` }; }
      });
    }

    // MCP-first research + notes
    if (!hasTool('crawl_site')) {
      registerTool('crawl_site', async (args) => {
        try {
          if (mcpEnabled && toolsAdapter) {
            try {
              console.log(chalk.gray('    [mcp] crawl_site → trying MCP'));
              const t0 = Date.now();
              const res = await toolsAdapter.mcp.callTool({ name:'crawl_site', arguments: { root_url: args.root_url, max_pages: args.max_pages, same_origin: args.same_origin, depth: args.depth, delay_ms: args.delay_ms } });
              if (!res.isError) { stat('crawl_site','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
              stat('crawl_site','mcp_fallback');
            } catch (e) { stat('crawl_site','mcp_fallback'); return { error: `crawl_site_failed: ${e?.message||e}` }; }
          }
          return { error: 'crawl_site_not_available' };
        } catch (e) { return { error: `crawl_site_failed: ${e?.message||e}` }; }
      });
    }
    if (!hasTool('crawl_urls')) {
      registerTool('crawl_urls', async (args) => {
        try {
          if (mcpEnabled && toolsAdapter) {
            try {
              console.log(chalk.gray('    [mcp] crawl_urls → trying MCP'));
              const t0 = Date.now();
              const res = await toolsAdapter.mcp.callTool({ name:'crawl_urls', arguments: { urls: args.urls, concurrency: args.concurrency, delay_ms: args.delay_ms } });
              if (!res.isError) { stat('crawl_urls','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
              stat('crawl_urls','mcp_fallback');
            } catch (e) { stat('crawl_urls','mcp_fallback'); return { error: `crawl_urls_failed: ${e?.message||e}` }; }
          }
          return { error: 'crawl_urls_not_available' };
        } catch (e) { return { error: `crawl_urls_failed: ${e?.message||e}` }; }
      });
    }
    if (!hasTool('write_note')) {
      registerTool('write_note', async (args) => {
        try {
          if (mcpEnabled && toolsAdapter) {
            try {
              console.log(chalk.gray('    [mcp] write_note → trying MCP'));
              const t0 = Date.now();
              const res = await toolsAdapter.mcp.callTool({ name:'write_note', arguments: { text: args.text, source_uri: args.source_uri, tags: args.tags } });
              if (!res.isError) { stat('write_note','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
              stat('write_note','mcp_fallback');
            } catch (e) { stat('write_note','mcp_fallback'); return { error: `write_note_failed: ${e?.message||e}` }; }
          }
          return { error: 'write_note_not_available' };
        } catch (e) { return { error: `write_note_failed: ${e?.message||e}` }; }
      });
    }
    if (!hasTool('list_notes')) {
      registerTool('list_notes', async (args) => {
        try {
          if (mcpEnabled && toolsAdapter) {
            try {
              console.log(chalk.gray('    [mcp] list_notes → trying MCP'));
              const t0 = Date.now();
              const res = await toolsAdapter.mcp.callTool({ name:'list_notes', arguments: { query: args.query, limit: args.limit } });
              if (!res.isError) { stat('list_notes','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
              stat('list_notes','mcp_fallback');
            } catch (e) { stat('list_notes','mcp_fallback'); return { error: `list_notes_failed: ${e?.message||e}` }; }
          }
          return { error: 'list_notes_not_available' };
        } catch (e) { return { error: `list_notes_failed: ${e?.message||e}` }; }
      });
    }
    if (!hasTool('finalize_report')) {
      registerTool('finalize_report', async (args) => {
        try {
          if (mcpEnabled && toolsAdapter) {
            try {
              console.log(chalk.gray('    [mcp] finalize_report → trying MCP'));
              const t0 = Date.now();
              const res = await toolsAdapter.mcp.callTool({ name:'finalize_report', arguments: { title: args.title, outline: args.outline, include_notes: args.include_notes, extra_context: args.extra_context } });
              if (!res.isError) { stat('finalize_report','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
              stat('finalize_report','mcp_fallback');
            } catch (e) { stat('finalize_report','mcp_fallback'); return { error: `finalize_report_failed: ${e?.message||e}` }; }
          }
          return { error: 'finalize_report_not_available' };
        } catch (e) { return { error: `finalize_report_failed: ${e?.message||e}` }; }
      });
    }
    // Agent memory
    if (!hasTool('get_agent_memory')) {
      registerTool('get_agent_memory', async (args) => {
        try {
          if (!isBase58Mint(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
          const scope = (args.scope || 'general');
          const maxChars = Math.min(Math.max(Number(args.max_chars || 4000), 100), 20000);
          const state = await loadAgentState(args.mint_address);
          if (!state) return { error: 'No agent state for mint', mint_address: args.mint_address };
          const digest = buildMemoryDigestScoped(state, scope, maxChars);
          const selected = selectScopedMemory(state, scope);
          return { mint_address: args.mint_address, scope, interactions_count: state.interactions_count || 0, updated_at: state.updated_at || null, digest, memory: selected };
        } catch (e) { return { error: 'Failed to load agent memory', details: e?.message, mint_address: args.mint_address }; }
      });
    }
    // Orchestrator (market, website, telegram, x) via MCP
    if (!hasTool('socials_orchestrate')) {
      registerTool('socials_orchestrate', async (args) => {
        try {
          if (!isBase58Mint(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'socials_orchestrate', arguments: {
            mint_address: args.mint_address,
            steps: args.steps,
            x_concurrency: args.x_concurrency,
            collect_members: args.collect_members,
            max_members: args.max_members,
          }});
          if (res.isError) return { error: 'socials_orchestrate_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: 'Failed to orchestrate modular socials', details: e?.message, mint_address: args.mint_address }; }
      });
    }
    // Foundation (DB/admin) — via MCP
    if (!hasTool('ensure_token_activated')) {
      registerTool('ensure_token_activated', async (args) => {
        try {
          const mint = String(args?.mint_address || args?.mint || '').trim();
          if (!isBase58Mint(mint)) return { error: 'Invalid mint address', mint_address: mint };
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'ensure_token_activated', arguments: { mint_address: mint } });
          if (res.isError) return { error: 'ensure_token_activated_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: 'ensure_token_activated_failed', details: e?.message || String(e) }; }
      });
    }
    if (!hasTool('ensure_token_enriched')) {
      registerTool('ensure_token_enriched', async (args) => {
        try {
          const mint = String(args?.mint_address || args?.mint || '').trim();
          if (!isBase58Mint(mint)) return { error: 'Invalid mint address', mint_address: mint };
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const timeout_sec = Math.min(Math.max(Number(args?.timeout_sec ?? 30), 0), 180);
          const res = await toolsAdapter.mcp.callTool({ name:'ensure_token_enriched', arguments: { mint_address: mint, timeout_sec, poll: args?.poll !== false } });
          if (res.isError) return { error: 'ensure_token_enriched_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: 'ensure_token_enriched_failed', details: e?.message || String(e) }; }
      });
    }
    if (!hasTool('get_token_links_from_db')) {
      registerTool('get_token_links_from_db', async (args) => {
        try {
          const mint = String(args?.mint_address || args?.mint || '').trim();
          if (!isBase58Mint(mint)) return { error: 'Invalid mint address', mint_address: mint };
          if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
          const res = await toolsAdapter.mcp.callTool({ name:'get_token_links_from_db', arguments: { mint_address: mint } });
          if (res.isError) return { error: 'get_token_links_from_db_failed', details: res?.content?.[0]?.text || null };
          return res.structuredContent || res;
        } catch (e) { return { error: 'get_token_links_from_db_failed', details: e?.message || String(e) }; }
      });
    }
  } catch {}

  // Tweet media now via MCP
  if (!hasTool('get_media_from_tweet')) {
    registerTool('get_media_from_tweet', async (args) => {
      try {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'get_media_from_tweet', arguments: { tweet_id: args.tweet_id, include_metadata: args.include_metadata } });
        if (res.isError) return { error: 'get_media_from_tweet_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      } catch (e) { return { error: `Failed to get media from tweet: ${e.message}` }; }
    });
  }
  // Prediction history via MCP
  if (!hasTool('get_prediction_history')) {
    registerTool('get_prediction_history', async (args) => {
      try {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'get_prediction_history', arguments: args || {} });
        if (res.isError) return { error: 'get_prediction_history_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      } catch (e) { return { error: `Failed to retrieve prediction history: ${e.message}` }; }
    });
  }

  // Verify tweet prediction via MCP
  if (!hasTool('verify_tweet_prediction')) {
    registerTool('verify_tweet_prediction', async (args) => {
      try {
        if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
        const res = await toolsAdapter.mcp.callTool({ name:'verify_tweet_prediction', arguments: args || {} });
        if (res.isError) return { error: 'verify_tweet_prediction_failed', details: res?.content?.[0]?.text || null };
        return res.structuredContent || res;
      } catch (e) { return { error: `Failed to verify tweet prediction: ${e.message}` }; }
    });
  }

  // (getQuoteSafe is imported from trade-manager/exec-helpers.js)

  //
  // Preview (dry-run) trading helpers — do NOT send transactions
  //
  if (!hasTool('execute_buy_preview')) registerTool('execute_buy_preview', async (args) => {
    try {
      if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
      const res = await toolsAdapter.mcp.callTool({ name:'execute_buy_preview', arguments: {
        token_mint: args.token_mint,
        sol_amount: args.sol_amount,
        slippage_bps: args.slippage_bps
      }});
      if (res.isError) return { error: 'buy_preview_failed', details: res?.content?.[0]?.text || null };
      const body = res.structuredContent || {};
      return {
        preview: true,
        action: 'buy',
        token_mint: args.token_mint,
        sol_spend: Number(args.sol_amount),
        expected_tokens_ui: body.expected_tokens,
        price_impact: body.price_impact ?? null
      };
    } catch (e) { return { error: `buy_preview_failed: ${e?.message||e}` }; }
  });

  if (!hasTool('execute_sell_preview')) registerTool('execute_sell_preview', async (args) => {
    try {
      if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
      const res = await toolsAdapter.mcp.callTool({ name:'execute_sell_preview', arguments: {
        token_mint: args.token_mint,
        token_amount: args.token_amount,
        slippage_bps: args.slippage_bps,
        output_mint: args.output_mint
      }});
      if (res.isError) return { error: 'sell_preview_failed', details: res?.content?.[0]?.text || null };
      const body = res.structuredContent || {};
      return {
        preview: true,
        action: 'sell',
        token_mint: args.token_mint,
        tokens_sold: Number(args.token_amount),
        expected_sol_ui: body.expected_sol,
        price_impact: body.price_impact ?? null
      };
    } catch (e) { return { error: `sell_preview_failed: ${e?.message||e}` }; }
  });

  if (!hasTool('execute_sell_all_preview')) registerTool('execute_sell_all_preview', async (args) => {
    try {
      if (!(mcpEnabled && toolsAdapter)) return { error: 'mcp_disabled' };
      const res = await toolsAdapter.mcp.callTool({ name:'execute_sell_all_preview', arguments: {
        wallet_id: args.wallet_id,
        token_mint: args.token_mint,
        slippage_bps: args.slippage_bps
      }});
      if (res.isError) return { error: 'sell_all_preview_failed', details: res?.content?.[0]?.text || null };
      const body = res.structuredContent || {};
      return { preview: true, action: 'sell_all', token_mint: args.token_mint, tokens_sold_ui: body.tokens_sold_ui, expected_sol_ui: body.expected_sol_ui, price_impact: body.price_impact ?? null };
    } catch (e) { return { error: `sell_all_preview_failed: ${e?.message||e}` }; }
  });

  // Execute the tool via registry only
  return {
    getMcpStats() { try { return JSON.parse(JSON.stringify(mcpStats)); } catch { return { totals:{}, tools:{} }; } },
    async executeTool(toolName, args) {
      console.log(chalk.yellow(`  🔧 Executing tool: ${toolName}`), args);
      const globalHandler = getRegisteredTool(toolName);
      if (globalHandler) return await globalHandler(args);
      return { error: 'Unknown tool: ' + toolName };
    }
  };
}

// Helpers for scoped memory
function buildMemoryDigestScoped(state, scope, maxChars) { return buildScopedDigest(state, scope, maxChars); }

function selectScopedMemory(state, scope) {
  const m = state?.memory || {};
  switch (scope) {
    case 'comms':
      return {
        socials: m.socials || {},
        narrative: m.narrative || {},
        notes: m.notes || []
      };
    case 'pros_cons':
      return {
        last_scores: m.last_scores || {},
        pros: m.green_flags || [],
        cons: m.red_flags || []
      };
    case 'summary':
      return {
        token_type: m.token_type || null,
        notes: m.notes || [],
        citations: m.citations || []
      };
    case 'market':
      return m.market || null;
    case 'pros':
      return { pros: m.green_flags || [] };
    case 'cons':
      return { cons: m.red_flags || [] };
    case 'full':
      return m;
    case 'general':
    default:
      return {
        token_type: m.token_type || null,
        last_scores: m.last_scores || {},
        socials: m.socials || {},
        narrative: m.narrative || {},
        red_flags: m.red_flags || [],
        green_flags: m.green_flags || [],
        notes: m.notes || []
      };
  }
}
