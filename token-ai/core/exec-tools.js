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
import axios from 'axios';
// Lazy-load prisma only when needed to avoid dragging parent config/loggers in simple tool paths
let _prisma = null;
async function getPrisma(){
  if (_prisma) return _prisma;
  try {
    const mod = await import('../../config/prisma.js');
    _prisma = mod?.default || mod?.prisma || null;
  } catch {}
  return _prisma;
}
import { spawn } from 'child_process';
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

import { fetchBirdeyeOHLCVRange } from './ohlcv-util.js';
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
    // Prediction verification (relative)
    if (!hasTool('verify_relative_prediction')) {
      registerTool('verify_relative_prediction', async (args) => {
        try {
          const { tweet_id, window_minutes = 1440, claim = {}, targets = [], target_kind = 'mint', chain_id = 'solana' } = args;
          const chain = String(chain_id || 'solana').toLowerCase();
          if (!tweet_id) return { error: 'tweet_id is required' };
          const windowMin = Math.min(Math.max(Number(window_minutes)||1440, 60), 20160);

          const prisma = await getPrisma();
          const row = await prisma.twitter_tweets.findFirst({ where: { tweet_id } });
          if (!row) return { error: `Tweet ${tweet_id} not found` };
          const ts = row.tweet_timestamp || row.created_at;
          if (!ts) return { error: 'Tweet has no timestamp' };
          const tweetTs = Math.floor(new Date(ts).getTime()/1000);
          const now = Math.floor(Date.now()/1000);
          const endTs = Math.min(tweetTs + windowMin*60, now);
          const actualMin = Math.floor((endTs - tweetTs)/60);
          if (actualMin < 60) return { result: 'too_fresh', min_required_minutes: 60, current_minutes: actualMin };

          let mints = [];
          if (Array.isArray(targets) && targets.length) {
            if (String(target_kind||'mint').toLowerCase() === 'mint') {
              mints = targets.filter(Boolean);
            } else {
              const symArr = targets.filter(Boolean);
              const resolved = [];
              for (const sym of symArr) {
                try {
                  const url = 'https://api.dexscreener.com/latest/dex/search';
                  const sresp = await axios.get(url, { params: { q: sym }, timeout: 10000 });
                  const pairs = Array.isArray(sresp.data?.pairs) ? sresp.data.pairs : [];
                  const sol = pairs.filter(p => (p.chainId||'').toLowerCase() === chain);
                  const cand = new Map();
                  const push = (tok, role, p) => { if (!tok?.address) return; const k = tok.address.toLowerCase(); const rec = cand.get(k)||{addr:tok.address,sym:(tok.symbol||'').toUpperCase(),liq:0,ev:0,roles:new Set()}; const liq=Number(p.liquidity?.usd||0)||0; rec.liq += liq; rec.ev++; rec.roles.add(role); cand.set(k,rec); };
                  for (const p of sol) { const b = p.baseToken || p.base; const q = p.quoteToken || p.quote; if (b) push(b,'base',p); if (q) push(q,'quote',p); }
                  const target = (sym||'').toUpperCase();
                  const list = Array.from(cand.values()).map(c=>({ address:c.addr, sym:c.sym, score: (c.sym===target?1000: (c.sym.includes(target)?200:0)) + Math.log10(1+c.liq)*20 + (c.roles.has('base')?10:0) + c.ev*5 })).filter(x => x.sym!=='SOL' && x.sym!=='USDC' && x.sym!=='USDT').sort((a,b)=>b.score-a.score);
                  if (list.length) resolved.push(list[0].address);
                } catch {}
              }
              mints = resolved;
            }
          }
          if (!mints || mints.length < 2) return { error: 'Need at least two mint_addresses or resolvable symbols' };

          let interval = 1; if (actualMin > 360) interval = 5; if (actualMin > 2880) interval = 15;

          const rows = [];
          for (const mint of mints) {
            const data = await fetchBirdeyeOHLCVRange(mint, tweetTs, endTs, interval);
            if (!data || !Array.isArray(data.ohlcv) || data.ohlcv.length === 0) { rows.push({ mint, error: 'no_ohlcv' }); continue; }
            const o = data.ohlcv;
            const start = o[0].c; const end = o[o.length-1].c;
            const maxH = Math.max(...o.map(c=>c.h)); const minL = Math.min(...o.map(c=>c.l));
            const changePct = ((end - start)/start)*100;
            rows.push({ mint, interval_minutes: interval, price_start: start, price_end: end, return_pct: Number(changePct.toFixed(2)), max_price: maxH, min_price: minL, candles: o.length });
          }

          const valid = rows.filter(r => r.error == null);
          const ranked = valid.slice().sort((a,b)=> (b.return_pct - a.return_pct));

          const ctype = (claim.type||'outperform');
          const primaryIdx = Number.isInteger(args.primary_index) ? args.primary_index : (Number.isInteger(claim.primary_index) ? claim.primary_index : 0);
          const againstIdx = Number.isInteger(args.against_index) ? args.against_index : (Number.isInteger(claim.against_index) ? claim.against_index : (mints.length>1?1:0));
          let verdict = 'insufficient_data'; let accuracy = 0;
          if (valid.length >= 2) {
            const primaryMint = mints[primaryIdx] || mints[0];
            const primary = valid.find(v => v.mint === primaryMint) || ranked[0];
            const againstMint = mints[againstIdx] || mints[(primaryIdx+1)%mints.length];
            const against = valid.find(v => v.mint === againstMint) || ranked[1];
            if (primary && against) {
              const diff = primary.return_pct - against.return_pct;
              if (ctype === 'outperform') { verdict = diff >= 0 ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, diff + 50)); }
              else if (ctype === 'underperform') { verdict = diff <= 0 ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, -diff + 50)); }
              else if (ctype === 'spread_target') { const th = Number(args.threshold_pct ?? claim.threshold_pct ?? 0); verdict = diff >= th ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, 50 + (diff-th))); }
              else if (ctype === 'ratio_target') { verdict = 'UNSUPPORTED'; accuracy = 0; }
            }
          }

          let saved = false; let dbError = null;
          try {
            const prisma = await getPrisma();
            await prisma.tweet_prediction_scores.create({
              data: {
                tweet_id,
                token_address: mints[0],
                author_handle: row.author_handle || 'unknown',
                tweet_timestamp: row.tweet_timestamp || row.created_at,
                prediction_type: `relative_${ctype}`,
                prediction_text: `${ctype}:${mints.join(',')}`,
                minutes_checked: actualMin,
                price_before: null,
                price_after: null,
                price_change_pct: null,
                accuracy_score: Math.round(accuracy),
                verdict,
                metadata: { chain_id: chain, mints, returns: valid, ranked_mints: ranked.map(r=>({ mint:r.mint, return_pct:r.return_pct })), interval_minutes: interval, window_minutes: actualMin }
              }
            });
            saved = true;
          } catch (e) { dbError = e?.message || String(e); }

          return { tweet_id, chain_id: chain, window_minutes: actualMin, interval_minutes: interval, claim_type: ctype, mints, returns: rows, ranked, verdict, accuracy_score: Math.round(accuracy), saved_to_database: saved, ...(dbError && { db_error: dbError }) };
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
    // Twitter history from DB (no scraping)
    if (!hasTool('get_twitter_history')) {
      registerTool('get_twitter_history', async (args) => {
        try {
          if (!isBase58Mint(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
          const limit = Math.min(Math.max(Number(args.limit || 100), 1), 500);
          const include_replies = args.include_replies !== false;
          const include_retweets = args.include_retweets !== false;
          const include_deleted = args.include_deleted !== false;
          const include_snapshots = args.include_snapshots !== false;
          const snapshots_limit = Math.min(Math.max(Number(args.snapshots_limit || 20), 1), 200);
          let sinceTime = null;
          if (args.since_time) { const d = new Date(String(args.since_time)); if (!isNaN(d.getTime())) sinceTime = d; }
          if (!sinceTime && args.since_days) { const days = Number(args.since_days); if (Number.isFinite(days) && days > 0) sinceTime = new Date(Date.now() - days*86400_000); }

          const where = { token_address: args.mint_address };
          if (!include_replies) where.is_reply = false;
          if (!include_retweets) where.is_retweet = false;
          if (!include_deleted) where.deleted_at = null;
          if (args.author) where.author_handle = String(args.author);
          if (sinceTime) where.tweet_timestamp = { gte: sinceTime };

          const prisma = await getPrisma();
          const tweets = await prisma.twitter_tweets.findMany({ where, orderBy: { tweet_timestamp: 'desc' }, take: limit });
          let snapshots = [];
          if (include_snapshots) {
            const whereSnap = { token_address: args.mint_address };
            if (sinceTime) whereSnap.snapshot_time = { gte: sinceTime };
            try {
              const prisma = await getPrisma();
              snapshots = await prisma.twitter_snapshots.findMany({ where: whereSnap, orderBy: { snapshot_time: 'desc' }, take: snapshots_limit });
            } catch {
              const prisma = await getPrisma();
              snapshots = await prisma.twitter_snapshots.findMany({ where: { token_address: args.mint_address }, take: snapshots_limit });
            }
          }
          const safe = (obj) => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
          return { mint_address: args.mint_address, count: tweets.length, tweets: safe(tweets), snapshots: safe(snapshots) };
        } catch (e) {
          return { error: 'Failed to load twitter history', details: e?.message, mint_address: args.mint_address };
        }
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
          const apiUrl = process.env.API_BASE_URL || 'http://localhost:3004';
          const response = await fetch(`${apiUrl}/api/wallet-analysis/${args.wallet_address}`);
          if (!response.ok) throw new Error(`API returned ${response.status}: ${response.statusText}`);
          const data = await response.json();
          return { success: true, wallet_address: args.wallet_address, sol_balance: data.summary?.solBalance?.sol || 0, total_value_usd: data.portfolio?.totalValue || 0, tokens: data.tokens?.map(t => ({ symbol: t.symbol, name: t.name, mint: t.mint, balance: t.balance, value_usd: t.value, price: t.price, market_cap: t.marketCap, liquidity: t.realQuoteLiquidity })) || [], token_count: data.tokens?.length || 0 };
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
    // Foundation (DB/admin) — lazy to avoid pulling prisma/API paths unless called
    if (!hasTool('ensure_token_activated')) {
      registerLazyTool('ensure_token_activated', async () => async (args) => {
        try {
          const mint = String(args?.mint_address || args?.mint || '').trim();
          if (!isBase58Mint(mint)) return { error: 'Invalid mint address', mint_address: mint };
          const { ensure_token_activated } = await import('../socials/tools/foundation.js');
          return await ensure_token_activated(mint);
        } catch (e) { return { error: 'ensure_token_activated_failed', details: e?.message || String(e) }; }
      });
    }
    if (!hasTool('ensure_token_enriched')) {
      registerLazyTool('ensure_token_enriched', async () => async (args) => {
        try {
          const mint = String(args?.mint_address || args?.mint || '').trim();
          if (!isBase58Mint(mint)) return { error: 'Invalid mint address', mint_address: mint };
          const timeoutSec = Math.min(Math.max(Number(args?.timeout_sec ?? 30), 0), 180);
          const poll = args?.poll !== false;
          const { ensure_token_enriched } = await import('../socials/tools/foundation.js');
          return await ensure_token_enriched(mint, { timeoutSec, poll });
        } catch (e) { return { error: 'ensure_token_enriched_failed', details: e?.message || String(e) }; }
      });
    }
    if (!hasTool('get_token_links_from_db')) {
      registerLazyTool('get_token_links_from_db', async () => async (args) => {
        try {
          const mint = String(args?.mint_address || args?.mint || '').trim();
          if (!isBase58Mint(mint)) return { error: 'Invalid mint address', mint_address: mint };
          const { get_token_links_from_db } = await import('../socials/tools/foundation.js');
          return await get_token_links_from_db(mint);
        } catch (e) { return { error: 'get_token_links_from_db_failed', details: e?.message || String(e) }; }
      });
    }
  } catch {}

  // Register DB-backed tweet media extractor
  if (!hasTool('get_media_from_tweet')) {
    registerTool('get_media_from_tweet', async (args) => {
      try {
        const { tweet_id, include_metadata = true } = args;
        const prisma = await getPrisma();
        const tweetRow = await prisma.twitter_tweets.findFirst({ where: { tweet_id } });
        if (!tweetRow) return { error: `Tweet ${tweet_id} not found in database` };
        const t = canonicalTweetFromRow(tweetRow);
        const mediaData = t.media || {};
        const media = { photos: Array.isArray(mediaData.photos) ? mediaData.photos : [], videos: Array.isArray(mediaData.videos) ? mediaData.videos : [], cards: Array.isArray(mediaData.cards) ? mediaData.cards : [] };
        const hasMedia = media.photos.length > 0 || media.videos.length > 0 || media.cards.length > 0;
        if (!hasMedia) {
          return { tweet_id, message: 'No media found in this tweet', metadata: include_metadata ? { text: t.text, author: t.author, stats: t.counts, created_at: t.timestamp } : null };
        }
        const response = {
          tweet_id,
          media: {
            image_urls: media.photos.map(p => p.url).filter(Boolean),
            video_urls: media.videos.map(v => ({ url: v.url, poster: v.poster })).filter(v => v.url),
            card_previews: media.cards.map(c => ({ url: c.url, image: c.image })).filter(c => c.url)
          },
          media_count: { images: media.photos.length, videos: media.videos.length, cards: media.cards.length }
        };
        if (include_metadata) response.metadata = { text: t.text, author: t.author, stats: t.counts, created_at: t.timestamp, url: t.url };
        return response;
      } catch (e) { return { error: `Failed to get media from tweet: ${e.message}` }; }
    });
  }
  // Prediction history
  if (!hasTool('get_prediction_history')) {
    registerTool('get_prediction_history', async (args) => {
      try {
        const { token_address, author_handle, limit = 20, min_accuracy, prediction_type, order_by = 'created_at_desc' } = args;
        const where = {};
        if (token_address) where.token_address = token_address;
        if (author_handle) where.author_handle = author_handle;
        if (min_accuracy !== undefined) where.accuracy_score = { gte: min_accuracy };
        if (prediction_type) where.prediction_type = prediction_type;
        let orderBy;
        switch(order_by) {
          case 'accuracy_desc': orderBy = { accuracy_score: 'desc' }; break;
          case 'accuracy_asc': orderBy = { accuracy_score: 'asc' }; break;
          case 'created_at_asc': orderBy = { created_at: 'asc' }; break;
          default: orderBy = { created_at: 'desc' };
        }
        const prisma = await getPrisma();
        const predictions = await prisma.tweet_prediction_scores.findMany({ where, orderBy, take: limit });
        if (!predictions || predictions.length === 0) return { message: 'No prediction history found for the given criteria', count: 0, predictions: [] };
        let authorStats = null;
        if (author_handle) {
          const allAuthorPredictions = await prisma.tweet_prediction_scores.findMany({ where: { author_handle } });
          if (allAuthorPredictions.length > 0) {
            const accuracySum = allAuthorPredictions.reduce((sum, p) => sum + p.accuracy_score, 0);
            const avgAccuracy = accuracySum / allAuthorPredictions.length;
            const correctPredictions = allAuthorPredictions.filter(p => p.accuracy_score >= 50).length;
            const successRate = (correctPredictions / allAuthorPredictions.length) * 100;
            authorStats = { total_predictions: allAuthorPredictions.length, average_accuracy: avgAccuracy.toFixed(1), success_rate: successRate.toFixed(1), pump_predictions: allAuthorPredictions.filter(p => p.prediction_type === 'pump').length, dump_predictions: allAuthorPredictions.filter(p => p.prediction_type === 'dump').length, price_target_predictions: allAuthorPredictions.filter(p => p.prediction_type === 'target_price').length };
          }
        }
        const formattedPredictions = predictions.map(p => {
          const pcp = (p.price_change_pct == null) ? null : Number(p.price_change_pct);
          return { tweet_id: p.tweet_id, author: p.author_handle, prediction_type: p.prediction_type, prediction_text: p.prediction_text, accuracy_score: p.accuracy_score, verdict: p.verdict, price_change_pct: (pcp == null || Number.isNaN(pcp)) ? null : Number(pcp.toFixed(2)), minutes_checked: p.minutes_checked, tweet_timestamp: p.tweet_timestamp, verified_at: p.created_at, token_address: p.token_address };
        });
        return { count: predictions.length, predictions: formattedPredictions, ...(authorStats && { author_statistics: authorStats }) };
      } catch (e) { return { error: `Failed to retrieve prediction history: ${e.message}` }; }
    });
  }

  // Verify tweet prediction (single-token pump/dump/target)
  if (!hasTool('verify_tweet_prediction')) {
    registerTool('verify_tweet_prediction', async (args) => {
      try {
        const { tweet_id, minutes_after = 1440, prediction_type = 'auto_detect' } = args;
        const prisma = await getPrisma();
        const tweetRow = await prisma.twitter_tweets.findFirst({ where: { tweet_id } });
        if (!tweetRow) return { error: `Tweet ${tweet_id} not found in database` };

        const tw = canonicalTweetFromRow(tweetRow);
        if (!tw?.timestamp) return { error: 'Tweet missing timestamp for verification' };

        const mintAddress = (args.mint_address && String(args.mint_address)) || tw.token_address || null;
        if (!mintAddress) return { result: 'not_associated', message: 'No mint address associated with this tweet; pass mint_address to verify.', tweet_id };

        const tweetTimestamp = Math.floor(tw.timestamp.getTime() / 1000);
        const endTimestamp = tweetTimestamp + (minutes_after * 60);
        const nowTimestamp = Math.floor(Date.now() / 1000);
        const actualEndTime = Math.min(endTimestamp, nowTimestamp);
        const actualMinutes = Math.floor((actualEndTime - tweetTimestamp) / 60);
        if (actualMinutes < 60) return { tweet_id, result: 'too_fresh', min_required_minutes: 60, current_minutes: actualMinutes, message: 'Tweet is too recent to verify prediction reliably.' };

        const text = (tw.text || '').toLowerCase();
        let detectedClaim = null; let expectedDirection = null; let targetPrice = null;
        const claims = Array.isArray(args.claims) && args.claims.length ? args.claims : null;
        const single = (!claims && args.prediction_details) ? args.prediction_details : null;
        if (single) {
          if (single.direction === 'up') { expectedDirection = 'up'; detectedClaim = 'pump'; }
          if (single.direction === 'down') { expectedDirection = 'down'; detectedClaim = 'dump'; }
          if (typeof single.target_price === 'number') { targetPrice = Number(single.target_price); detectedClaim = `target $${targetPrice}`; }
        }
        if (!single && !claims) {
          if (prediction_type === 'auto_detect' || prediction_type === 'pump') {
            if (/(pump|moon|explode|fly|rocket|parabolic|10x|100x|send it|lfg)/i.test(text)) { detectedClaim = 'pump'; expectedDirection = 'up'; }
          }
          if (prediction_type === 'auto_detect' || prediction_type === 'dump') {
            if (/(dump|crash|tank|rug|collapse|plummet|die|dead|zero|rekt)/i.test(text)) { detectedClaim = 'dump'; expectedDirection = 'down'; }
          }
          if (prediction_type === 'auto_detect' || prediction_type === 'target_price') {
            const m = text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
            if (m) { targetPrice = Number(m[1]); detectedClaim = `target $${targetPrice}`; }
          }
        }

        const interval = actualMinutes <= 360 ? 1 : (actualMinutes <= 2880 ? 5 : 15);
        const data = await fetchBirdeyeOHLCVRange(mintAddress, tweetTimestamp, actualEndTime, interval);
        if (!data || !Array.isArray(data.ohlcv) || data.ohlcv.length === 0) return { error: 'No OHLCV data available', tweet_id, mint_address: mintAddress };
        const ohlcv = data.ohlcv;
        const startPrice = ohlcv[0].c; const endPrice = ohlcv[ohlcv.length - 1].c;
        const maxPrice = Math.max(...ohlcv.map(c => c.h)); const minPrice = Math.min(...ohlcv.map(c => c.l));
        const changePercent = ((endPrice - startPrice) / startPrice) * 100;
        const maxChangePercent = ((maxPrice - startPrice) / startPrice) * 100;
        const minChangePercent = ((minPrice - startPrice) / startPrice) * 100;

        let verdict = 'unknown'; let accuracy = 0;
        if (expectedDirection === 'up') { verdict = changePercent >= 0 ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, changePercent + 50)); }
        else if (expectedDirection === 'down') { verdict = changePercent <= 0 ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, -changePercent + 50)); }
        else if (targetPrice != null) { verdict = (maxPrice >= targetPrice) ? 'CORRECT' : 'WRONG'; const proximity = (maxPrice - targetPrice) / targetPrice; accuracy = Math.max(0, Math.min(100, 50 + proximity * 100)); }
        else { verdict = 'no_claim_detected'; accuracy = 0; }

        let savedToDb = false; let dbError = null;
        try {
          const prisma = await getPrisma();
          await prisma.tweet_prediction_scores.create({
            data: {
              tweet_id,
              token_address: mintAddress,
              author_handle: tw.author?.handle || tweetRow.author_handle || 'unknown',
              tweet_timestamp: tweetRow.tweet_timestamp || tw.timestamp,
              prediction_type: detectedClaim?.includes('target') ? 'target_price' : expectedDirection === 'up' ? 'pump' : 'dump',
              prediction_text: detectedClaim || (single ? (single.direction || (single.target_price ? `target $${single.target_price}` : null)) : null),
              target_price: targetPrice,
              minutes_checked: actualMinutes,
              price_before: startPrice,
              price_after: endPrice,
              price_change_pct: changePercent,
              volume_before: (ohlcv[0].v ?? null),
              volume_after: (ohlcv[ohlcv.length - 1].v ?? null),
              accuracy_score: Math.round(accuracy),
              verdict,
              metadata: { max_price: maxPrice, min_price: minPrice, max_change_pct: maxChangePercent, min_change_pct: minChangePercent, candles_analyzed: ohlcv.length }
            }
          });
          savedToDb = true;
        } catch (error) { console.error('Failed to save prediction score to database:', error); dbError = error.message; }

        return {
          tweet_id,
          tweet_text: (tw.text || '').substring(0,200),
          author: tw.author,
          claim_detected: detectedClaim,
          tweet_timestamp: tw.timestamp,
          verification_period: { minutes_checked: actualMinutes, end_time: new Date(actualEndTime * 1000).toISOString() },
          price_data: { price_at_tweet: startPrice, price_at_end: endPrice, max_price_in_period: maxPrice, min_price_in_period: minPrice, change_percent: Number(changePercent.toFixed(2)), max_change_percent: Number(maxChangePercent.toFixed(2)), min_change_percent: Number(minChangePercent.toFixed(2)) },
          accuracy_score: Math.round(accuracy),
          verdict,
          token_address: mintAddress,
          saved_to_database: savedToDb,
          ...(dbError && { db_error: dbError })
        };
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
