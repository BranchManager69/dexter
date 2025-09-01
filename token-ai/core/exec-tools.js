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
import { extract_website_content, extract_websites_for_token, find_social_links_in_site } from '../socials/tools/websites.js';
import { get_twitter_profile as tw_get_profile, get_twitter_recent_tweets as tw_get_tweets } from '../socials/tools/twitter.js';
import { get_telegram_group_meta as tg_get_meta } from '../socials/tools/telegram.js';
import { fetch_market_overview as ds_fetch_market } from '../socials/tools/market.js';
import { loadAgentStateStore as loadAgentState } from '../agents/store.js';
import { buildMemoryDigest, buildScopedDigest } from '../agents/memory.js';
import { formatOrchestratorData } from './format-orchestrator.js';
// Lazy-load wallet utils to avoid dragging prisma/logger unless needed
async function getWalletUtils(){
  const mod = await import('../trade-manager/wallet-utils.js');
  return { loadWallet: mod.loadWallet, listManagedWallets: mod.listManagedWallets };
}
import { getQuote, getSwapTransaction, deserializeTransaction, SOL_MINT, SOL_DECIMALS, formatTokenAmount } from '../trade-manager/jupiter-api.js';
import { Connection, PublicKey, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { registerTool, registerLazyTool, hasTool, getTool as getRegisteredTool } from './tools-registry.js';
import { isBase58Mint, isHttpUrl } from './validation.js';

/* Simple cache helpers */
import { ensureCacheDir, cachePath, withCache } from './cache.js';
// temp cache dir
const CACHE_DIR_DEFAULT = '/tmp/ai-token-cache'

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
  /**
   * Registry mapping tool name -> async handler(args)
   * This allows adding new tools without expanding the switch.
   */
  const toolHandlers = new Map();

  const mcpEnabled = String(process.env.TOKEN_AI_ENABLE_MCP || '0') === '1';
  const toolsAdapter = mcpEnabled ? new ToolsAdapter({ enableMcp: true }) : null;

  const {
    PROJECT_ROOT,
    CACHE_TTL_MIN,
    SKIP_OHLCV,
    CLI_OHLCV_INTERVAL,
    FAST_OHLCV_PROVIDER,
    CACHE_DIR = CACHE_DIR_DEFAULT,
  } = config;

  // Register migrated tools in global registry (idempotent). Bind to this executor's config.
  try {
    if (!hasTool('analyze_token_ohlcv_range')) {
      registerTool('analyze_token_ohlcv_range', async (args) => {
        if (SKIP_OHLCV) {
          console.log(chalk.yellow('    ⏭️  OHLCV tool is disabled; returning stub.'));
          return { skipped: true, reason: 'OHLCV disabled for this run' };
        }
        try {
          if (!isBase58Mint(args.mint_address)) {
            return { error: 'Invalid mint address', mint_address: args.mint_address };
          }
          const interval = Math.min(Math.max((CLI_OHLCV_INTERVAL ?? args.interval_minutes ?? 1), 1), 60);
          let tf = Number(args.time_from) || Math.floor((Date.now()/1000) - (6*3600));
          let tt = Number(args.time_to) || Math.floor(Date.now()/1000);
          ({ tf, tt } = normalizeWindowByInterval(tf, tt, interval));
          const MAX_CANDLES = 5000;
          const candlesRequested = Math.floor((tt - tf) / (interval * 60));
          if (candlesRequested > MAX_CANDLES) {
            const originalTf = tf; tf = tt - (MAX_CANDLES * interval * 60);
            console.log(chalk.yellow(`    Clamping OHLCV window: requested ${candlesRequested} candles; using last ${MAX_CANDLES} (${originalTf}→${tf}).`));
          }
          if (FAST_OHLCV_PROVIDER === 'birdeye' && process.env.BIRDEYE_API_KEY) {
            console.log(chalk.gray(`    Fetching Birdeye v3 OHLCV fast: range ${tf}..${tt} @ ${interval}m`));
            let data = await fetchBirdeyeOHLCVRange(args.mint_address, tf, tt, interval);
            if (data && data.ohlcv) {
              const count = data.ohlcv.length || 0;
              console.log(chalk.green(`    ✓ Birdeye OHLCV fast loaded with ${count} candles`));
              return { provider: 'birdeye', ...data };
            }
            const now = Math.floor(Date.now()/1000);
            let fallbackInterval = interval <= 1 ? 1 : (interval <= 5 ? 5 : 15);
            const { tf: fbFrom, tt: fbTo } = normalizeWindowByInterval(now - (14*24*3600), now, fallbackInterval);
            console.log(chalk.yellow(`    No data; retrying fallback window ${fbFrom}..${fbTo} @ ${fallbackInterval}m`));
            data = await fetchBirdeyeOHLCVRange(args.mint_address, fbFrom, fbTo, fallbackInterval);
            if (data && data.ohlcv && data.ohlcv.length) {
              console.log(chalk.green(`    ✓ Fallback OHLCV loaded with ${data.ohlcv.length} candles`));
              return { provider: 'birdeye', ...data };
            }
            console.log(chalk.yellow('    Birdeye returned no data for both primary and fallback windows.'));
            return { provider: 'birdeye', mint: args.mint_address, time_from: tf, time_to: tt, interval_minutes: interval, ohlcv: [], note: 'no_data_primary_and_fallback' };
          }
          return { error: 'Birdeye fast OHLCV unavailable (missing API key)', mint_address: args.mint_address };
        } catch (error) {
          return { error: 'Failed to fetch OHLCV range', details: error?.message, mint_address: args.mint_address };
        }
      });
    }
    if (!hasTool('extract_website_content')) {
      registerTool('extract_website_content', async (args) => {
        const url = String(args.url||'');
        if (!isHttpUrl(url)) return { error: 'Invalid URL', url };
        return await extract_website_content(url);
      });
    }
    if (!hasTool('extract_websites_for_token')) {
      registerTool('extract_websites_for_token', async (args) => {
        const urls = Array.isArray(args.urls) ? args.urls.filter(u=>isHttpUrl(u)) : [];
        if (!urls.length) return { error: 'No valid URLs' };
        return await extract_websites_for_token(urls);
      });
    }
    if (!hasTool('discover_official_links')) {
      registerTool('discover_official_links', async (args) => {
        if (!isBase58Mint(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
        const { get_token_links_from_db } = await import('../socials/tools/foundation.js');
        const db = await get_token_links_from_db(args.mint_address);
        const urls = (Array.isArray(args.urls) && args.urls.length) ? args.urls : (db.websites||[]).map(w=>w.url).filter(Boolean);
        const extracted = await extract_websites_for_token(urls);
        const discovered = [];
        for (const site of extracted) {
          if (site?.success) {
            const links = find_social_links_in_site(site);
            for (const l of links) discovered.push({ platform: l.type, url: l.url, source: 'site', site: site.url });
          }
        }
        const canon = [];
        const seen = new Set();
        for (const s of (db.socials||[])) { const k = `${s.type}|${s.url}`; if(!seen.has(k)){ seen.add(k); canon.push({ platform:s.type, url:s.url, source:'db' }); } }
        for (const d of discovered) { const k = `${d.platform}|${d.url}`; if(!seen.has(k)){ seen.add(k); canon.push(d); } }
        return { links: canon, websites_checked: urls };
      });
    }
    if (!hasTool('get_twitter_profile')) {
      registerTool('get_twitter_profile', async (args) => {
        const url = String(args.twitter_url||'');
        if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
        return await tw_get_profile({ twitterUrl: url, storageStatePath: process.env.TWITTER_SESSION_PATH });
      });
    }
    if (!hasTool('get_twitter_recent_tweets')) {
      registerTool('get_twitter_recent_tweets', async (args) => {
        const url = String(args.twitter_url||'');
        if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
        const limit = Math.min(Math.max(Number(args.limit||50), 1), 200);
        const include_replies = args.include_replies !== false;
        return await tw_get_tweets({ twitterUrl: url, storageStatePath: process.env.TWITTER_SESSION_PATH, limit, include_replies });
      });
    }
    // DexScreener family
    if (!hasTool('dexscreener_search')) {
      registerTool('dexscreener_search', async (args) => {
        try {
          const query = String(args.query || '').trim();
          const chain = String(args.chain_id || '').trim().toLowerCase();
          const limit = Math.min(Math.max(Number(args.limit || 10), 1), 50);
          if (!query) return { error: 'Missing query' };
          const url = 'https://api.dexscreener.com/latest/dex/search';
          let resp;
          try {
            resp = await axios.get(url, { params: { q: query }, timeout: 10000, headers: { 'User-Agent': 'token-ai/1.0' } });
          } catch (e) {
            if (e?.response?.status === 429) {
              await new Promise(r=>setTimeout(r, 700));
              resp = await axios.get(url, { params: { q: query }, timeout: 12000, headers: { 'User-Agent': 'token-ai/1.0' } });
            } else {
              throw e;
            }
          }
          const pairs = Array.isArray(resp.data?.pairs) ? resp.data.pairs : [];
          const filtered = chain ? pairs.filter(p => (p.chainId||'').toLowerCase() === chain) : pairs;
          return { query, chain_id: chain || null, count: Math.min(filtered.length, limit), results: filtered.slice(0, limit) };
        } catch (e) {
          return { error: 'DexScreener search failed', details: e?.message };
        }
      });
    }
    if (!hasTool('dexscreener_tokens')) {
      registerTool('dexscreener_tokens', async (args) => {
        try {
          const chain = String(args.chain_id || '').trim().toLowerCase();
          const addrs = Array.isArray(args.token_addresses) ? args.token_addresses.filter(Boolean) : [];
          if (!chain || addrs.length === 0) return { error: 'Missing chain_id or token_addresses' };
          const url = `https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chain)}/${addrs.map(encodeURIComponent).join(',')}`;
          const resp = await axios.get(url, { timeout: 12000 });
          return { chain_id: chain, token_addresses: addrs, raw: resp.data };
        } catch (e) {
          return { error: 'DexScreener tokens fetch failed', details: e?.message };
        }
      });
    }
    if (!hasTool('dexscreener_token_pairs')) {
      registerTool('dexscreener_token_pairs', async (args) => {
        try {
          const chain = String(args.chain_id || '').trim().toLowerCase();
          const addr = String(args.token_address || '').trim();
          if (!chain || !addr) return { error: 'Missing chain_id or token_address' };
          const url = `https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(chain)}/${encodeURIComponent(addr)}`;
          const resp = await axios.get(url, { timeout: 12000 });
          return { chain_id: chain, token_address: addr, raw: resp.data };
        } catch (e) {
          return { error: 'DexScreener token pairs fetch failed', details: e?.message };
        }
      });
    }
    if (!hasTool('dexscreener_pair_details')) {
      registerTool('dexscreener_pair_details', async (args) => {
        try {
          const chain = String(args.chain_id || '').trim().toLowerCase();
          const pairId = String(args.pair_id || '').trim();
          if (!chain || !pairId) return { error: 'Missing chain_id or pair_id' };
          const url = `https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chain)}/${encodeURIComponent(pairId)}`;
          const resp = await axios.get(url, { timeout: 12000 });
          return { chain_id: chain, pair_id: pairId, raw: resp.data };
        } catch (e) {
          return { error: 'DexScreener pair details fetch failed', details: e?.message };
        }
      });
    }
    if (!hasTool('dexscreener_token_profiles')) {
      registerTool('dexscreener_token_profiles', async (args) => {
        try {
          const chain = String(args.chain_id || '').trim().toLowerCase();
          const addrs = Array.isArray(args.token_addresses) ? args.token_addresses.filter(Boolean) : [];
          if (!chain || addrs.length === 0) return { error: 'Missing chain_id or token_addresses' };
          const url = `https://api.dexscreener.com/token-profiles/latest/v1`;
          const resp = await axios.get(url, { params: { chainId: chain, tokenAddresses: addrs.join(',') }, timeout: 15000 });
          return { chain_id: chain, token_addresses: addrs, raw: resp.data };
        } catch (e) {
          return { error: 'DexScreener token profiles fetch failed', details: e?.message };
        }
      });
    }
    if (!hasTool('dexscreener_token_boosts_latest')) {
      registerTool('dexscreener_token_boosts_latest', async (args) => {
        try {
          const chain = String(args.chain_id || '').trim().toLowerCase();
          const addrs = Array.isArray(args.token_addresses) ? args.token_addresses.filter(Boolean) : [];
          if (!chain || addrs.length === 0) return { error: 'Missing chain_id or token_addresses' };
          const url = `https://api.dexscreener.com/token-boosts/latest/v1`;
          const resp = await axios.get(url, { params: { chainId: chain, tokenAddresses: addrs.join(',') }, timeout: 15000 });
          return { chain_id: chain, token_addresses: addrs, raw: resp.data };
        } catch (e) {
          return { error: 'DexScreener token boosts latest failed', details: e?.message };
        }
      });
    }
    if (!hasTool('dexscreener_token_boosts_top')) {
      registerTool('dexscreener_token_boosts_top', async (args) => {
        try {
          const chain = String(args.chain_id || '').trim().toLowerCase();
          const limit = Math.min(Math.max(Number(args.limit || 20), 1), 100);
          const url = `https://api.dexscreener.com/token-boosts/top/v1`;
          const resp = await axios.get(url, { params: { chainId: chain || 'solana', limit }, timeout: 15000 });
          return { chain_id: chain || 'solana', limit, raw: resp.data };
        } catch (e) {
          return { error: 'DexScreener token boosts top failed', details: e?.message };
        }
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

  // Fetch OHLCV range from Birdeye.
  async function fetchBirdeyeOHLCVRange(mint, time_from, time_to, interval) {
    try {
      const key = process.env.BIRDEYE_API_KEY;
      if (!key) return null;

      // Calculate the interval.
      const type = interval <= 1 ? '1m' : (interval <= 5 ? '5m' : '15m');

      // Fetch OHLCV range from Birdeye.
      const url = `https://public-api.birdeye.so/defi/v3/ohlcv?address=${encodeURIComponent(mint)}&type=${encodeURIComponent(type)}&currency=native&time_from=${time_from}&time_to=${time_to}&ui_amount_mode=both&mode=range`;
      const resp = await fetch(url, { headers: { 'X-API-KEY': key, 'accept': 'application/json', 'x-chain': 'solana' }, timeout: 20000 });

      // If the response is not ok, return a stub.
      if (!resp.ok) {
        const text = await resp.text();
        console.log(chalk.yellow(`    Birdeye HTTP ${resp.status}: ${text.slice(0,200)}`));
        return null;
      } 
      // Parse response and extract data.
      const json = await resp.json();
      const items = json.data?.items || [];
      const ohlcv = items.map(it => ({ t: it.unix_time || it.time || 0, o: it.o, h: it.h, l: it.l, c: it.c, v: it.v, v_usd: it.v_usd })).filter(x => x.t && x.c != null);
      // Return OHLCV data.
      return { mint, time_from, time_to, interval_minutes: interval, ohlcv };
    } catch (e) {
      console.log(chalk.yellow(`    Birdeye fetch error: ${e?.message}`));
      return null;
    }
  }

  // Normalize window based on policy to avoid impractical ranges
  function normalizeWindowByInterval(tf, tt, interval) {
    const now = Math.floor(Date.now()/1000);
    if (!tt || tt > now) tt = now;
    if (!tf || tf >= tt) tf = tt - (6*3600);

    let maxSpan;
    if (interval <= 1) {
      maxSpan = 6 * 3600; // 6h @1m
    } else if (interval <= 5) {
      maxSpan = 48 * 3600; // 48h @5m
    } else {
      maxSpan = 14 * 24 * 3600; // 14d @15m
    }

    const span = tt - tf;
    if (span > maxSpan) {
      const newTf = tt - maxSpan;
      console.log(chalk.yellow(`    Normalizing OHLCV window: requested span ${Math.round(span/3600)}h; using ${Math.round(maxSpan/3600)}h based on interval ${interval}m`));
      tf = newTf;
    }
    return { tf, tt };
  }

  // Helper: execute sell (shared by execute_sell, execute_sell_all, execute_sell_partial)
  async function executeSellInternal(args) {
    try {
      const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
      const { loadWallet } = await getWalletUtils();
      const { wallet, keypair, publicKey } = await loadWallet(args.wallet_id);

      // Get token account and balance/decimals
      const tokenMint = new PublicKey(args.token_mint);
      const tokenAccount = await getAssociatedTokenAddress(tokenMint, publicKey);
      const account = await getAccount(connection, tokenAccount);
      const tokenInfo = await connection.getParsedAccountInfo(tokenMint);
      const decimals = tokenInfo.value?.data?.parsed?.info?.decimals || 9;

      // Determine amount to sell
      let amountToSell;
      if (args.sell_all) {
        amountToSell = account.amount; // BigInt raw units
      } else if (args.token_amount != null) {
        amountToSell = BigInt(Math.floor(Number(args.token_amount) * Math.pow(10, decimals)));
      } else {
        return { error: 'Must specify either token_amount or sell_all=true' };
      }

      // Get quote
      const quote = await getQuote({
        inputMint: args.token_mint,
        outputMint: SOL_MINT,
        amount: amountToSell.toString(),
        slippageBps: args.slippage_bps || 100
      });

      // Build swap
      const swapResponse = await getSwapTransaction({
        quoteResponse: quote,
        userPublicKey: publicKey,
        wrapAndUnwrapSol: true,
        priorityLamports: Number(process.env.PRIORITY_LAMPORTS)||10000
      });

      // Sign and send
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const serialized = transaction.serialize();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const signature = await connection.sendRawTransaction(serialized, { skipPreflight: false, maxRetries: 3 });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

      return {
        success: true,
        tx_hash: signature,
        wallet_id: wallet.id,
        wallet_address: wallet.public_key,
        action: 'sell',
        token_mint: args.token_mint,
        tokens_sold: formatTokenAmount(amountToSell, decimals),
        sol_received: formatTokenAmount(quote.outAmount, SOL_DECIMALS),
        price_impact: quote.priceImpactPct,
        solscan_url: `https://solscan.io/tx/${signature}`
      };
    } catch (e) {
      return { error: `Failed to execute sell: ${e.message}` };
    }
  }

  /**
   * Helper: Jupiter quote for a swap path.
   * @param {Object} p
   * @param {string} p.inputMint - base58 mint in
   * @param {string} p.outputMint - base58 mint out
   * @param {bigint|string|number} p.amount - raw units string or bigint
   * @param {number} p.slippageBps - slippage in bps
   */
  async function getQuoteSafe({ inputMint, outputMint, amount, slippageBps = 100 }){
    try {
      const quote = await getQuote({ inputMint, outputMint, amount: String(amount), slippageBps });
      return quote;
    } catch (e) {
      return { error: e?.message || 'quote_failed' };
    }
  }

  //
  // Preview (dry-run) trading helpers — do NOT send transactions
  //
  toolHandlers.set('execute_buy_preview', async (args) => {
    try {
      const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
      const tokenMint = new PublicKey(args.token_mint);
      // Determine decimals of target token
      const tokenInfo = await connection.getParsedAccountInfo(tokenMint);
      const decimals = tokenInfo.value?.data?.parsed?.info?.decimals || 9;
      const lamports = BigInt(Math.floor(Number(args.sol_amount) * Math.pow(10, SOL_DECIMALS)));
      const quote = await getQuoteSafe({ inputMint: SOL_MINT, outputMint: args.token_mint, amount: lamports, slippageBps: args.slippage_bps || 100 });
      if (quote?.error) return { error: quote.error };
      return {
        preview: true,
        action: 'buy',
        token_mint: args.token_mint,
        sol_spend: Number(args.sol_amount),
        expected_tokens_raw: quote.outAmount,
        expected_tokens_ui: formatTokenAmount(quote.outAmount, decimals),
        price_impact: quote.priceImpactPct ?? null
      };
    } catch (e) {
      return { error: `buy_preview_failed: ${e?.message||e}` };
    }
  });

  toolHandlers.set('execute_sell_preview', async (args) => {
    try {
      const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
      const tokenMint = new PublicKey(args.token_mint);
      const tokenInfo = await connection.getParsedAccountInfo(tokenMint);
      const decimals = tokenInfo.value?.data?.parsed?.info?.decimals || 9;
      const rawAmount = BigInt(Math.floor(Number(args.token_amount) * Math.pow(10, decimals)));
      const quote = await getQuoteSafe({ inputMint: args.token_mint, outputMint: SOL_MINT, amount: rawAmount, slippageBps: args.slippage_bps || 100 });
      if (quote?.error) return { error: quote.error };
      return {
        preview: true,
        action: 'sell',
        token_mint: args.token_mint,
        tokens_sold: Number(args.token_amount),
        expected_sol_raw: quote.outAmount,
        expected_sol_ui: formatTokenAmount(quote.outAmount, SOL_DECIMALS),
        price_impact: quote.priceImpactPct ?? null
      };
    } catch (e) {
      return { error: `sell_preview_failed: ${e?.message||e}` };
    }
  });

  toolHandlers.set('execute_sell_all_preview', async (args) => {
    try {
      const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
      const { loadWallet } = await getWalletUtils();
      const { keypair, publicKey } = await loadWallet(args.wallet_id);
      const tokenMint = new PublicKey(args.token_mint);
      const ata = await getAssociatedTokenAddress(tokenMint, publicKey);
      const account = await getAccount(connection, ata);
      const tokenInfo = await connection.getParsedAccountInfo(tokenMint);
      const decimals = tokenInfo.value?.data?.parsed?.info?.decimals || 9;
      const balanceRaw = account.amount; // BigInt
      if (balanceRaw <= 0n) return { preview: true, action: 'sell_all', token_mint: args.token_mint, tokens_sold: 0, expected_sol_ui: 0 };
      const quote = await getQuoteSafe({ inputMint: args.token_mint, outputMint: SOL_MINT, amount: balanceRaw, slippageBps: args.slippage_bps || 100 });
      if (quote?.error) return { error: quote.error };
      return {
        preview: true,
        action: 'sell_all',
        token_mint: args.token_mint,
        tokens_sold_ui: formatTokenAmount(balanceRaw, decimals),
        expected_sol_raw: quote.outAmount,
        expected_sol_ui: formatTokenAmount(quote.outAmount, SOL_DECIMALS),
        price_impact: quote.priceImpactPct ?? null
      };
    } catch (e) {
      return { error: `sell_all_preview_failed: ${e?.message||e}` };
    }
  });

  // Execute the tool.
  return {
    getMcpStats() { try { return JSON.parse(JSON.stringify(mcpStats)); } catch { return { totals:{}, tools:{} }; } },
    async executeTool(toolName, args) {
      console.log(chalk.yellow(`  🔧 Executing tool: ${toolName}`), args);

      // Canonicalizers and helpers (tweet rows, numbers, JSON)
      const toNumber = (v) => {
        if (typeof v === 'bigint') { try { return Number(v); } catch { return null; } }
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const parseMaybeJson = (val) => {
        if (!val) return null;
        if (typeof val === 'object') return val;
        try { return JSON.parse(String(val)); } catch { return null; }
      };
      const canonicalTweetFromRow = (row) => {
        if (!row) return null;
        const id = row.tweet_id || row.id || null;
        const text = row.tweet_text || row.text || null;
        const url = row.tweet_url || row.url || null;
        const ts = row.tweet_timestamp || row.created_at || row.timestamp || null;
        const timestamp = ts ? new Date(ts) : null;
        const author = {
          handle: row.author_handle || (row.author && row.author.handle) || null,
          name: row.author_name || (row.author && row.author.name) || null,
          verified: (row.author_verified ?? (row.author && row.author.verified)) || false,
        };
        const counts = {
          likes: toNumber(row.likes_count ?? row.likes) ?? 0,
          retweets: toNumber(row.retweets_count ?? row.retweets) ?? 0,
          replies: toNumber(row.replies_count ?? row.replies) ?? 0,
          views: toNumber(row.views_count ?? row.views)
        };
        const mediaRaw = row.media_urls ?? row.media ?? null;
        const media = parseMaybeJson(mediaRaw) || {};
        return { id, text, url, timestamp, author, counts, media, token_address: row.token_address || null };
      };

      // Look up global registry first (new pattern)
      const globalHandler = getRegisteredTool(toolName);
      if (globalHandler) return await globalHandler(args);
      // Tool to execute via local registry map (legacy new pattern)
      const handler = toolHandlers.get(toolName);
      if (handler) return await handler(args);

      // Fallback: switch (legacy pattern)
      // TODO: migrate more handlers to the registry map over time.
      switch (toolName) {
        // Foundation
        case 'ensure_token_activated': {
          const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
          if (!BASE58.test(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
          const { ensure_token_activated } = await import('../socials/tools/foundation.js');
          return await ensure_token_activated(args.mint_address);
        }
        case 'ensure_token_enriched': {
          const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
          if (!BASE58.test(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
          const timeoutSec = Math.min(Math.max(Number(args.timeout_sec||30), 1), 120);
          const poll = args.poll !== false;
          const { ensure_token_enriched } = await import('../socials/tools/foundation.js');
          return await ensure_token_enriched(args.mint_address, { timeoutSec, poll });
        }
        case 'get_token_links_from_db': {
          const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
          if (!BASE58.test(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
          const { get_token_links_from_db } = await import('../socials/tools/foundation.js');
          return await get_token_links_from_db(args.mint_address);
        }

        // Websites
        case 'extract_website_content': {
          const url = String(args.url||'');
          if (!/^https?:\/\//i.test(url)) return { error: 'Invalid URL', url };
          return await extract_website_content(url);
        }
        case 'extract_websites_for_token': {
          const urls = Array.isArray(args.urls) ? args.urls.filter(u=>/^https?:\/\//i.test(u)) : [];
          if (!urls.length) return { error: 'No valid URLs' };
          return await extract_websites_for_token(urls);
        }
        case 'discover_official_links': {
          const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
          if (!BASE58.test(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
          const db = await get_token_links_from_db(args.mint_address);
          const urls = (Array.isArray(args.urls) && args.urls.length) ? args.urls : (db.websites||[]).map(w=>w.url).filter(Boolean);
          const extracted = await extract_websites_for_token(urls);
          const discovered = [];
          for (const site of extracted) {
            if (site?.success) {
              const links = find_social_links_in_site(site);
              for (const l of links) discovered.push({ platform: l.type, url: l.url, source: 'site', site: site.url });
            }
          }
          const canon = [];
          const seen = new Set();
          for (const s of (db.socials||[])) { const k = `${s.type}|${s.url}`; if(!seen.has(k)){ seen.add(k); canon.push({ platform:s.type, url:s.url, source:'db' }); } }
          for (const d of discovered) { const k = `${d.platform}|${d.url}`; if(!seen.has(k)){ seen.add(k); canon.push(d); } }
          return { links: canon, websites_checked: urls };
        }

        // Twitter
        case 'get_twitter_profile': {
          const url = String(args.twitter_url||'');
          if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
          return await tw_get_profile({ twitterUrl: url, storageStatePath: process.env.TWITTER_SESSION_PATH });
        }
        case 'get_twitter_recent_tweets': {
          const url = String(args.twitter_url||'');
          if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
          const limit = Math.min(Math.max(Number(args.limit||50), 1), 200);
          const include_replies = args.include_replies !== false;
          return await tw_get_tweets({ twitterUrl: url, storageStatePath: process.env.TWITTER_SESSION_PATH, limit, include_replies });
        }
        case 'get_twitter_community_meta': {
          const url = String(args.twitter_url||'');
          if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
          return await (await import('../socials/tools/twitter.js')).get_twitter_community_meta({ twitterUrl: url, storageStatePath: process.env.TWITTER_SESSION_PATH });
        }
        case 'get_twitter_community_posts': {
          const url = String(args.twitter_url||'');
          if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
          const limit = Math.min(Math.max(Number(args.limit||10), 1), 100);
          return await (await import('../socials/tools/twitter.js')).get_twitter_community_posts({ twitterUrl: url, storageStatePath: process.env.TWITTER_SESSION_PATH, limit });
        }
        case 'get_twitter_community_members': {
          const url = String(args.twitter_url||'');
          if (!/^https?:\/\/(x\.com|twitter\.com)\//i.test(url)) return { error: 'Invalid Twitter URL', url };
          if (args.collect_members !== true) {
            return { skipped: true, reason: 'collect_members flag not enabled' };
          }
          const limit = Math.min(Math.max(Number(args.limit||200), 10), 2000);
          return await (await import('../socials/tools/twitter.js')).get_twitter_community_members({ twitterUrl: url, storageStatePath: process.env.TWITTER_SESSION_PATH, limit });
        }

        // Telegram
        case 'get_telegram_group_meta': {
          const url = String(args.telegram_url||'');
          if (!/^https?:\/\/t\.me\//i.test(url) && !/^@?\w+$/i.test(url.split('/').pop())) return { error: 'Invalid Telegram URL', url };
          return await tg_get_meta(url);
        }

        // Market
        case 'fetch_market_overview': {
          const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
          if (!BASE58.test(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
          return await ds_fetch_market(args.mint_address);
        }

        // DexScreener tools (no DB dependency)
        case 'dexscreener_search': {
          try {
            const query = String(args.query || '').trim();
            const chain = String(args.chain_id || '').trim().toLowerCase();
            const limit = Math.min(Math.max(Number(args.limit || 10), 1), 50);
            if (!query) return { error: 'Missing query' };
            const url = 'https://api.dexscreener.com/latest/dex/search';
            const resp = await axios.get(url, { params: { q: query }, timeout: 10000 });
            const pairs = Array.isArray(resp.data?.pairs) ? resp.data.pairs : [];
            const filtered = chain ? pairs.filter(p => (p.chainId||'').toLowerCase() === chain) : pairs;
            return { query, chain_id: chain || null, count: Math.min(filtered.length, limit), results: filtered.slice(0, limit) };
          } catch (e) {
            return { error: 'DexScreener search failed', details: e?.message };
          }
        }
        case 'dexscreener_tokens': {
          try {
            const chain = String(args.chain_id || '').trim().toLowerCase();
            const addrs = Array.isArray(args.token_addresses) ? args.token_addresses.filter(Boolean) : [];
            if (!chain || addrs.length === 0) return { error: 'Missing chain_id or token_addresses' };
            const url = `https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chain)}/${addrs.map(encodeURIComponent).join(',')}`;
            const resp = await axios.get(url, { timeout: 12000 });
            return { chain_id: chain, token_addresses: addrs, raw: resp.data };
          } catch (e) {
            return { error: 'DexScreener tokens fetch failed', details: e?.message };
          }
        }
        case 'dexscreener_token_pairs': {
          try {
            const chain = String(args.chain_id || '').trim().toLowerCase();
            const addr = String(args.token_address || '').trim();
            if (!chain || !addr) return { error: 'Missing chain_id or token_address' };
            const url = `https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(chain)}/${encodeURIComponent(addr)}`;
            const resp = await axios.get(url, { timeout: 12000 });
            return { chain_id: chain, token_address: addr, raw: resp.data };
          } catch (e) {
            return { error: 'DexScreener token pairs fetch failed', details: e?.message };
          }
        }
        case 'dexscreener_pair_details': {
          try {
            const chain = String(args.chain_id || '').trim().toLowerCase();
            const pairId = String(args.pair_id || '').trim();
            if (!chain || !pairId) return { error: 'Missing chain_id or pair_id' };
            const url = `https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chain)}/${encodeURIComponent(pairId)}`;
            const resp = await axios.get(url, { timeout: 12000 });
            return { chain_id: chain, pair_id: pairId, raw: resp.data };
          } catch (e) {
            return { error: 'DexScreener pair details fetch failed', details: e?.message };
          }
        }
        case 'dexscreener_token_profiles': {
          try {
            const chain = String(args.chain_id || '').trim().toLowerCase();
            const addrs = Array.isArray(args.token_addresses) ? args.token_addresses.filter(Boolean) : [];
            if (!chain || addrs.length === 0) return { error: 'Missing chain_id or token_addresses' };
            // Token profiles latest endpoint (GitBook openapi path)
            const url = `https://api.dexscreener.com/token-profiles/latest/v1`;
            const resp = await axios.get(url, { params: { chainId: chain, tokenAddresses: addrs.join(',') }, timeout: 15000 });
            return { chain_id: chain, token_addresses: addrs, raw: resp.data };
          } catch (e) {
            return { error: 'DexScreener token profiles fetch failed', details: e?.message };
          }
        }
        case 'dexscreener_token_boosts_latest': {
          try {
            const chain = String(args.chain_id || '').trim().toLowerCase();
            const addrs = Array.isArray(args.token_addresses) ? args.token_addresses.filter(Boolean) : [];
            if (!chain || addrs.length === 0) return { error: 'Missing chain_id or token_addresses' };
            const url = `https://api.dexscreener.com/token-boosts/latest/v1`;
            const resp = await axios.get(url, { params: { chainId: chain, tokenAddresses: addrs.join(',') }, timeout: 15000 });
            return { chain_id: chain, token_addresses: addrs, raw: resp.data };
          } catch (e) {
            return { error: 'DexScreener token boosts (latest) fetch failed', details: e?.message };
          }
        }
        case 'dexscreener_token_boosts_top': {
          try {
            const chain = String(args.chain_id || '').trim().toLowerCase();
            const limit = Math.min(Math.max(Number(args.limit || 20), 1), 100);
            if (!chain) return { error: 'Missing chain_id' };
            const url = `https://api.dexscreener.com/token-boosts/top/v1`;
            const resp = await axios.get(url, { params: { chainId: chain, limit }, timeout: 15000 });
            return { chain_id: chain, limit, raw: resp.data };
          } catch (e) {
            return { error: 'DexScreener token boosts (top) fetch failed', details: e?.message };
          }
        }

        case 'verify_relative_prediction': {
          try {
            const { tweet_id, window_minutes = 1440, claim = {}, targets = [], target_kind = 'mint', chain_id = 'solana' } = args;
            const chain = String(chain_id || 'solana').toLowerCase();
            if (!tweet_id) return { error: 'tweet_id is required' };
            const windowMin = Math.min(Math.max(Number(window_minutes)||1440, 60), 20160);

            // Resolve start time from DB tweet or bail if missing
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

            // Resolve mints from targets based on target_kind
            let mints = [];
            if (Array.isArray(targets) && targets.length) {
              if (String(target_kind||'mint').toLowerCase() === 'mint') {
                mints = targets.filter(Boolean);
              } else {
                const symArr = targets.filter(Boolean);
                // Resolve symbols → mints (best_pick only)
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
                    const list = Array.from(cand.values()).map(c=>({
                      address:c.addr, sym:c.sym, score: (c.sym===target?1000: (c.sym.includes(target)?200:0)) + Math.log10(1+c.liq)*20 + (c.roles.has('base')?10:0) + c.ev*5
                    })).filter(x => x.sym!=='SOL' && x.sym!=='USDC' && x.sym!=='USDT').sort((a,b)=>b.score-a.score);
                    if (list.length) resolved.push(list[0].address);
                  } catch {}
                }
                mints = resolved;
              }
            }
            if (!mints || mints.length < 2) return { error: 'Need at least two mint_addresses or resolvable symbols' };

            // Pick interval based on window
            let interval = 1; if (actualMin > 360) interval = 5; if (actualMin > 2880) interval = 15;

            // Fetch returns per mint
            const rows = [];
            for (const mint of mints) {
              const data = await fetchBirdeyeOHLCVRange(mint, tweetTs, endTs, interval);
              if (!data || !Array.isArray(data.ohlcv) || data.ohlcv.length === 0) {
                rows.push({ mint, error: 'no_ohlcv' }); continue;
              }
              const o = data.ohlcv;
              const start = o[0].c; const end = o[o.length-1].c;
              const maxH = Math.max(...o.map(c=>c.h)); const minL = Math.min(...o.map(c=>c.l));
              const changePct = ((end - start)/start)*100;
              rows.push({ mint, interval_minutes: interval, price_start: start, price_end: end, return_pct: Number(changePct.toFixed(2)), max_price: maxH, min_price: minL, candles: o.length });
            }

            // Rank by return desc
            const valid = rows.filter(r => r.error == null);
            const ranked = valid.slice().sort((a,b)=> (b.return_pct - a.return_pct));

            // Evaluate claim
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

            // Persist summary row
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
                  metadata: {
                    chain_id: chain,
                    mints,
                    returns: valid,
                    ranked_mints: ranked.map(r=>({ mint:r.mint, return_pct:r.return_pct })),
                    interval_minutes: interval,
                    window_minutes: actualMin
                  }
                }
              });
              saved = true;
            } catch (e) { dbError = e?.message || String(e); }

            return { tweet_id, chain_id: chain, window_minutes: actualMin, interval_minutes: interval, claim_type: ctype, mints, returns: rows, ranked, verdict, accuracy_score: Math.round(accuracy), saved_to_database: saved, ...(dbError && { db_error: dbError }) };
          } catch (e) { return { error: `Failed to verify relative prediction: ${e.message}` }; }
        }
        case 'resolve_symbol_to_mints': {
          try {
            const symbol = String(args.symbol || '').trim();
            const chain = (String(args.chain_id || 'solana').trim().toLowerCase() || 'solana');
            const limit = Math.min(Math.max(Number(args.limit || 10), 1), 50);
            const enrich = args.enrich !== false;
            const pairsLimit = Math.min(Math.max(Number(args.pairs_enrich_limit || 3), 0), 10);
            const preferBase = args.prefer_base !== false; // default true
            const excludeGenerics = args.exclude_generics !== false; // default true
            if (!symbol) return { error: 'Missing symbol' };

            // Try MCP resolver first (hybrid), then fall back to native logic
            if (mcpEnabled && toolsAdapter) {
              try {
                const out = await toolsAdapter.resolveToken(symbol, { chain, limit });
                const results = Array.isArray(out?.results) ? out.results : [];
                if (results.length) {
                  const total = results.reduce((s,r)=> s + (Number(r.score||0)), 0) || results.length;
                  const mapCandidate = (r)=>({
                    address: r.address,
                    symbol: r.symbol,
                    name: r.name||null,
                    roles: ['base'],
                    liquidity_usd_sum: Number(r.liquidity_usd||0),
                    score: Number(r.score||0),
                    score_breakdown: r.score_breakdown || {},
                    confidence: total ? Number(((r.score||1)/total).toFixed(4)) : (1/results.length),
                    top_pair: {
                      dexId: r.dex_id || null,
                      pairAddress: r.pair_address || null,
                      price_usd: (r.price_usd!=null) ? Number(r.price_usd) : null,
                      liquidity_usd: (r.liquidity_usd!=null) ? Number(r.liquidity_usd) : null,
                      volume24h_usd: (r.volume_24h!=null) ? Number(r.volume_24h) : null,
                      url: r.url || null,
                    },
                    top_pairs: []
                  });
                  const candidatesEnriched = results.map(mapCandidate);
                  const best = candidatesEnriched[0] || null;
                  return {
                    query: symbol,
                    chain_id: chain,
                    prefer_base: preferBase,
                    exclude_generics: excludeGenerics,
                    used_endpoints: ['mcp:resolve_token'],
                    best_pick: best,
                    candidates: candidatesEnriched,
                    enrichment: null,
                    pairs_enrichment: {}
                  };
                }
              } catch {}
            }

            // Step 1: search
            const url = 'https://api.dexscreener.com/latest/dex/search';
            const resp = await axios.get(url, { params: { q: symbol }, timeout: 10000 });
            const pairs = Array.isArray(resp.data?.pairs) ? resp.data.pairs : [];
            const matches = pairs.filter(p => (p.chainId||'').toLowerCase() === chain);

            // Step 2: extract candidate tokens (base + quote), prefer base tokens matching symbol
            const candidatesMap = new Map();
            const pushCandidate = (tok, evidence) => {
              if (!tok || !tok.address) return;
              const addr = tok.address;
              const key = addr.toLowerCase();
              const sym = (tok.symbol || '').toUpperCase();
              const name = tok.name || null;
              const arr = candidatesMap.get(key) || { address: addr, symbol: sym, name, evidences: [], score: 0 };
              arr.evidences.push(evidence);
              candidatesMap.set(key, arr);
            };
            for (const p of matches) {
              const base = p.baseToken || p.base || null;
              const quote = p.quoteToken || p.quote || null;
              const liq = Number(p.liquidity?.usd || p.liquidityUSD || 0) || 0;
              if (base) pushCandidate(base, { role: 'base', pairAddress: p.pairAddress || p.pair, liquidity_usd: liq, dexId: p.dexId || null, pair: p });
              if (quote) pushCandidate(quote, { role: 'quote', pairAddress: p.pairAddress || p.pair, liquidity_usd: liq, dexId: p.dexId || null, pair: p });
            }

            // Step 3: score & rank
            const targetSym = symbol.toUpperCase();
            const GENERIC_ADDR_SOL = 'so11111111111111111111111111111111111111112'.toLowerCase();
            const GENERIC_SYMS = new Set(['SOL','USDC','USDT']);
            let candidates = Array.from(candidatesMap.values()).map(c => {
              const roles = new Set(c.evidences.map(e => e.role));
              const exact = c.symbol === targetSym ? 1 : 0;
              const partial = (!exact && c.symbol && c.symbol.includes(targetSym)) ? 0.5 : 0;
              const liqSum = c.evidences.reduce((s, e) => s + (Number(e.liquidity_usd||0)), 0);
              const evCount = c.evidences.length;
              const baseRole = roles.has('base') ? 1 : 0;
              const liquidityScore = Math.log10(1 + liqSum) * 20;
              const evidenceScore = evCount * 5;
              const baseScore = baseRole ? 10 : 0;
              const score = exact * 1000 + partial * 200 + liquidityScore + evidenceScore + baseScore;
              const pairs_sample = c.evidences.slice(0, 3).map(e => ({ dexId: e.dexId, pairAddress: e.pairAddress, liquidity_usd: e.liquidity_usd }));
              return { ...c, score, score_breakdown: { exact, partial, liquidity_score: liquidityScore, evidence_count: evCount, base_role: baseRole }, liquidity_usd_sum: liqSum, roles: Array.from(roles), pairs_sample };
            });

            if (excludeGenerics) {
              candidates = candidates.filter(c => c.address.toLowerCase() !== GENERIC_ADDR_SOL && !GENERIC_SYMS.has(c.symbol));
            }
            if (preferBase) {
              candidates = candidates.filter(c => (c.roles||[]).includes('base'));
            }
            candidates = candidates.sort((a,b) => b.score - a.score).slice(0, limit);

            // Step 4 (optional): enrich token details
            let enrichment = null;
            let pairsEnrichment = {};
            const usedEndpoints = ['search'];
            if (enrich && candidates.length) {
              const addrs = candidates.map(c => c.address);
              try {
                const url2 = `https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chain)}/${addrs.map(encodeURIComponent).join(',')}`;
                const resp2 = await axios.get(url2, { timeout: 12000 });
                enrichment = resp2.data || null;
                usedEndpoints.push('tokens');
              } catch {}
              // Optionally enrich top K with token-pairs
              if (pairsLimit > 0) {
                const topK = candidates.slice(0, Math.min(pairsLimit, candidates.length));
                for (const c of topK) {
                  try {
                    const url3 = `https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(chain)}/${encodeURIComponent(c.address)}`;
                    const resp3 = await axios.get(url3, { timeout: 12000 });
                    pairsEnrichment[c.address] = resp3.data || null;
                    usedEndpoints.push('token-pairs');
                  } catch {}
                }
              }
            }

            // Build per-candidate confidence and enrich with top pairs
            const totalScore = candidates.reduce((s,c)=>s + (Number(c.score)||0), 0) || 0;
            const tokensArr = Array.isArray(enrichment) ? enrichment : (Array.isArray(enrichment?.pairs) ? enrichment.pairs : []);
            const findTopPairFor = (addr) => {
              if (!Array.isArray(tokensArr)) return null;
              // tokens/v1 returns an array of pair objects; pick first where baseToken.address matches
              const it = tokensArr.find(x => x?.baseToken?.address === addr);
              if (!it) return null;
              const vol24 = (it.volume && (it.volume.h24 ?? it.volume24h)) ?? null;
              return {
                dexId: it.dexId || null,
                pairAddress: it.pairAddress || null,
                price_usd: (it.priceUsd != null) ? Number(it.priceUsd) : null,
                liquidity_usd: it.liquidity?.usd ?? null,
                volume24h_usd: vol24 ?? null,
                url: it.url || null
              };
            };
            const buildTopPairs = (addr) => {
              const pe = pairsEnrichment && pairsEnrichment[addr];
              const arr = Array.isArray(pe?.pairs) ? pe.pairs.slice() : [];
              arr.sort((a,b) => ((b?.liquidity?.usd||0) - (a?.liquidity?.usd||0)));
              return arr.slice(0, 5).map(p => ({
                dexId: p.dexId || null,
                pairAddress: p.pairAddress || null,
                price_usd: (p.priceUsd != null) ? Number(p.priceUsd) : null,
                liquidity_usd: p.liquidity?.usd ?? null,
                volume24h_usd: (p.volume && (p.volume.h24 ?? p.volume24h)) ?? null,
                url: p.url || null
              }));
            };

            const candidatesEnriched = candidates.map(c => {
              const confidence = totalScore > 0 ? Number((c.score / totalScore).toFixed(4)) : 1;
              return {
                ...c,
                confidence,
                top_pair: findTopPairFor(c.address),
                top_pairs: buildTopPairs(c.address)
              };
            });

            // Best pick with reasons + confidence
            const best = candidatesEnriched[0] || null;
            const reasons = best ? [
              best.score_breakdown?.exact ? 'exact symbol match' : null,
              best.score_breakdown?.liquidity_score ? 'highest aggregated liquidity among candidates' : null,
              (best.score_breakdown?.evidence_count >= 2) ? `multiple pair evidences (${best.score_breakdown.evidence_count})` : null,
              (best.roles||[]).includes('base') ? 'appears as base token in pairs' : null
            ].filter(Boolean) : [];
            const best_pick = best ? { address: best.address, symbol: best.symbol, name: best.name, roles: best.roles, liquidity_usd_sum: best.liquidity_usd_sum, score: best.score, score_breakdown: best.score_breakdown, reasons, confidence: best.confidence, top_pair: best.top_pair, top_pairs: best.top_pairs } : null;

            return { query: symbol, chain_id: chain, prefer_base: preferBase, exclude_generics: excludeGenerics, used_endpoints: Array.from(new Set(usedEndpoints)), best_pick: best_pick, candidates: candidatesEnriched, enrichment, pairs_enrichment: pairsEnrichment };
          } catch (e) {
            return { error: 'Failed to resolve symbol to mints', details: e?.message };
          }
        }

        case 'verify_tweet_prediction': {
          try {
            const { tweet_id, minutes_after = 1440, prediction_type = 'auto_detect' } = args;
            const prisma = await getPrisma();
            const tweetRow = await prisma.twitter_tweets.findFirst({ where: { tweet_id } });
            if (!tweetRow) return { error: `Tweet ${tweet_id} not found in database` };

            const tw = canonicalTweetFromRow(tweetRow);
            if (!tw?.timestamp) return { error: 'Tweet missing timestamp for verification' };

            // Resolve mint association: explicit param > row.token_address
            const mintAddress = (args.mint_address && String(args.mint_address)) || tw.token_address || null;
            if (!mintAddress) {
              return { result: 'not_associated', message: 'No mint address associated with this tweet; pass mint_address to verify.', tweet_id };
            }

            const tweetTimestamp = Math.floor(tw.timestamp.getTime() / 1000);
            const endTimestamp = tweetTimestamp + (minutes_after * 60);
            const nowTimestamp = Math.floor(Date.now() / 1000);
            const actualEndTime = Math.min(endTimestamp, nowTimestamp);
            const actualMinutes = Math.floor((actualEndTime - tweetTimestamp) / 60);
            if (actualMinutes < 60) {
              return { tweet_id, result: 'too_fresh', min_required_minutes: 60, current_minutes: actualMinutes, message: 'Tweet is too recent to verify prediction reliably.' };
            }

            const text = (tw.text || '').toLowerCase();
            let detectedClaim = null;
            let expectedDirection = null;
            let targetPrice = null;

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
                if (/(dump|crash|tank|rug|collapse|plummet|die|dead|rekt|0|zero)/i.test(text)) { detectedClaim = 'dump'; expectedDirection = 'down'; }
              }
              if (prediction_type === 'auto_detect' || prediction_type === 'target_price') {
                const priceMatch = text.match(/\$?([\d.]+)\s*(target|pt|price target)/i) || text.match(/(target|pt)[:=\s]+\$?([\d.]+)/i);
                if (priceMatch) { targetPrice = parseFloat(priceMatch[1] || priceMatch[2]); detectedClaim = `target $${targetPrice}`; }
              }
            }
            if (!claims && !single && !detectedClaim && !expectedDirection && !targetPrice) {
              return { tweet_id, result: 'no_clear_prediction', text: (tw.text||'').substring(0,200), message: 'No clear price prediction found in tweet' };
            }

            let interval = 1;
            if (actualMinutes > 360) interval = 5;
            if (actualMinutes > 2880) interval = 15;
            const ohlcvResult = await fetchBirdeyeOHLCVRange(mintAddress, tweetTimestamp, actualEndTime, interval);
            if (!ohlcvResult || !ohlcvResult.ohlcv || ohlcvResult.ohlcv.length === 0) {
              return { tweet_id, error: 'Could not fetch OHLCV data for verification period' };
            }

            const ohlcv = ohlcvResult.ohlcv;
            const startPrice = ohlcv[0].c;
            const endPrice = ohlcv[ohlcv.length - 1].c;
            const maxPrice = Math.max(...ohlcv.map(c => c.h));
            const minPrice = Math.min(...ohlcv.map(c => c.l));
            const changePercent = ((endPrice - startPrice) / startPrice) * 100;
            const maxChangePercent = ((maxPrice - startPrice) / startPrice) * 100;
            const minChangePercent = ((minPrice - startPrice) / startPrice) * 100;

            let accuracy = 0;
            let verdict = '';
            if (expectedDirection === 'up') {
              if (changePercent > 5) { accuracy = Math.min(100, changePercent * 10); verdict = `CORRECT - Predicted pump and price increased ${changePercent.toFixed(1)}%`; }
              else if (changePercent > 0) { accuracy = 25; verdict = `WEAK CORRECT - Predicted pump, minor increase ${changePercent.toFixed(1)}%`; }
              else { accuracy = 0; verdict = `WRONG - Predicted pump but price decreased ${changePercent.toFixed(1)}%`; }
            } else if (expectedDirection === 'down') {
              if (changePercent < -5) { accuracy = Math.min(100, Math.abs(changePercent) * 10); verdict = `CORRECT - Predicted dump and price decreased ${changePercent.toFixed(1)}%`; }
              else if (changePercent < 0) { accuracy = 25; verdict = `WEAK CORRECT - Predicted dump, minor decrease ${changePercent.toFixed(1)}%`; }
              else { accuracy = 0; verdict = `WRONG - Predicted dump but price increased ${changePercent.toFixed(1)}%`; }
            } else if (targetPrice) {
              const targetDiff = Math.abs(endPrice - targetPrice);
              const targetPercent = (targetDiff / targetPrice) * 100;
              if (targetPercent < 5) { accuracy = 100 - targetPercent * 20; verdict = `CLOSE - Target $${targetPrice}, actual $${endPrice.toFixed(6)}`; }
              else { accuracy = Math.max(0, 100 - targetPercent * 2); verdict = `MISSED - Target $${targetPrice}, actual $${endPrice.toFixed(6)}`; }
            }

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
            } catch (error) {
              console.error('Failed to save prediction score to database:', error);
              dbError = error.message;
            }

            return {
              tweet_id,
              tweet_text: (tw.text || '').substring(0,200),
              author: tw.author,
              claim_detected: detectedClaim,
              tweet_timestamp: tw.timestamp,
              verification_period: { minutes_checked: actualMinutes, end_time: new Date(actualEndTime * 1000).toISOString() },
              price_data: {
                price_at_tweet: startPrice,
                price_at_end: endPrice,
                max_price_in_period: maxPrice,
                min_price_in_period: minPrice,
                change_percent: Number(changePercent.toFixed(2)),
                max_change_percent: Number(maxChangePercent.toFixed(2)),
                min_change_percent: Number(minChangePercent.toFixed(2))
              },
              accuracy_score: Math.round(accuracy),
              verdict,
              token_address: mintAddress,
              saved_to_database: savedToDb,
              ...(dbError && { db_error: dbError })
            };
          } catch (e) {
            return { error: `Failed to verify tweet prediction: ${e.message}` };
          }
        }

        case 'get_media_from_tweet': {
          try {
            const { tweet_id, include_metadata = true } = args;
            
            // Query the database directly for the tweet
            const prisma = await getPrisma();
            const tweetRow = await prisma.twitter_tweets.findFirst({ where: { tweet_id } });
            if (!tweetRow) {
              return { error: `Tweet ${tweet_id} not found in database` };
            }
            const t = canonicalTweetFromRow(tweetRow);
            const mediaData = t.media || {};
            
            // Extract all media from the parsed data
            const media = {
              photos: Array.isArray(mediaData.photos) ? mediaData.photos : [],
              videos: Array.isArray(mediaData.videos) ? mediaData.videos : [],
              cards: Array.isArray(mediaData.cards) ? mediaData.cards : []
            };
            
            // Check if any media exists
            const hasMedia = media.photos.length > 0 || media.videos.length > 0 || media.cards.length > 0;
            if (!hasMedia) {
              return { 
                tweet_id,
                message: 'No media found in this tweet',
                metadata: include_metadata ? {
                  text: t.text,
                  author: t.author,
                  stats: t.counts,
                  created_at: t.timestamp
                } : null
              };
            }
            
            // Prepare the response
            const response = {
              tweet_id,
              media: {
                image_urls: media.photos.map(p => p.url).filter(Boolean),
                video_urls: media.videos.map(v => ({ url: v.url, poster: v.poster })).filter(v => v.url),
                card_previews: media.cards.map(c => ({ url: c.url, image: c.image })).filter(c => c.url)
              },
              media_count: {
                images: media.photos.length,
                videos: media.videos.length,
                cards: media.cards.length
              }
            };
            
            // Add metadata if requested
            if (include_metadata) {
              response.metadata = {
                text: t.text,
                author: t.author,
                stats: t.counts,
                created_at: t.timestamp,
                url: t.url
              };
            }
            
            return response;
            
          } catch (e) {
            return { error: `Failed to get media from tweet: ${e.message}` };
          }
        }

        // Twitter history from DB (no scraping)
        case 'get_twitter_history': {
          try {
            const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
            if (!BASE58.test(args.mint_address)) return { error: 'Invalid mint address', mint_address: args.mint_address };
            const limit = Math.min(Math.max(Number(args.limit || 100), 1), 500);
            const include_replies = args.include_replies !== false; // default include
            const include_retweets = args.include_retweets !== false; // default include
            const include_deleted = args.include_deleted !== false; // default include
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
            const tweets = await prisma.twitter_tweets.findMany({
              where,
              orderBy: { tweet_timestamp: 'desc' },
              take: limit,
            });
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
            // Convert BigInt to string for safety
            const safe = (obj) => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
            return { mint_address: args.mint_address, count: tweets.length, tweets: safe(tweets), snapshots: safe(snapshots) };
          } catch (e) {
            return { error: 'Failed to load twitter history', details: e?.message, mint_address: args.mint_address };
          }
        }

        case 'get_agent_memory':
          try {
            const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
            if (!BASE58.test(args.mint_address)) {
              return { error: 'Invalid mint address', mint_address: args.mint_address };
            }
            const scope = (args.scope || 'general');
            const maxChars = Math.min(Math.max(Number(args.max_chars || 4000), 100), 20000);
            const state = await loadAgentState(args.mint_address);
            if (!state) return { error: 'No agent state for mint', mint_address: args.mint_address };
            const digest = buildMemoryDigestScoped(state, scope, maxChars);
            const selected = selectScopedMemory(state, scope);
            return {
              mint_address: args.mint_address,
              scope,
              interactions_count: state.interactions_count || 0,
              updated_at: state.updated_at || null,
              digest,
              memory: selected
            };
          } catch (e) {
            return { error: 'Failed to load agent memory', details: e?.message, mint_address: args.mint_address };
          }

        // Modular socials orchestrator (preferred)
        case 'socials_orchestrate':
          try {
            // Validate mint
            const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
            if (!BASE58.test(args.mint_address)) {
              return { error: 'Invalid mint address', mint_address: args.mint_address };
            }

            // Default macro excludes Telegram; it can still be explicitly requested via --steps
            const steps = String(args.steps || 'market,website,x');
            const xConc = Math.min(Math.max(Number(args.x_concurrency || 2), 1), 2);
            const collectMembers = args.collect_members === true ? '1' : '0';
            const maxMembers = Math.min(Math.max(Number(args.max_members || 50), 10), 1000);

            const traces = [];
            const output = await new Promise((resolve, reject) => {
              const child = spawn(process.execPath, [path.join(PROJECT_ROOT, 'token-ai', 'socials', 'orchestrator.js'), args.mint_address, `--steps=${steps}`, `--x-concurrency=${xConc}`, `--collect-members=${collectMembers}`, `--max-members=${maxMembers}`], {
                cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe']
              });
              let stdout = '';
              let stderr = '';
              child.stdout.on('data', (d) => { const s=d.toString(); stdout += s; try { process.stdout.write(s); } catch {}; try {
                // Extract structured trace lines: [trace] {json}
                for (const line of s.split(/\r?\n/)) {
                  const m = line.match(/^\[trace\]\s+(\{.*\})$/);
                  if (m) {
                    try {
                      const j = JSON.parse(m[1]);
                      traces.push(j);
                      // Forward live step signals to UI
                      const step = String(j?.step||'');
                      const status = String(j?.status||'');
                      if (step && status === 'start') {
                        postAgentEvent('process:step_start', { mint: args.mint_address, step, at: new Date().toISOString() });
                      } else if (step && status === 'end') {
                        const ms = (typeof j?.ms==='number') ? j.ms : undefined;
                        postAgentEvent('process:step_end', { mint: args.mint_address, step, ok: !!j?.ok, ...(ms!=null?{ elapsed_ms: ms }:{}), at: new Date().toISOString() });
                      } else if (step && status === 'skip') {
                        postAgentEvent('process:step_end', { mint: args.mint_address, step, ok: false, skipped: true, at: new Date().toISOString() });
                      }
                    } catch {}
                  }
                }
              } catch {} });
              child.stderr.on('data', (d) => { const s=d.toString(); stderr += s; try { process.stderr.write(s); } catch {} });
              child.on('close', (code) => { if (code === 0) resolve(stdout); else reject(new Error(`orchestrator exited ${code}: ${stderr.slice(0,200)}`)); });
              child.on('error', (e) => reject(e));
            });

            const m = output.match(/REPORT_FILE:(.+)$/m);
            if (!m) return { error: 'No report file marker found', raw_output: output.substring(0, 1000) };
            const reportPath = m[1].trim();
            const json = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            const data = Array.isArray(json) ? (json.find(r => r?.address === args.mint_address) || json[0]) : json;

            // Normalizer: expose consistent websites[] and official_links[] regardless of source
            const norm = (() => {
              try {
                const seenSite = new Set();
                const websites = [];
                const pushSite = (url, label) => {
                  if (!url || typeof url !== 'string') return;
                  const key = url.trim().toLowerCase();
                  if (!/^https?:\/\//i.test(url)) return;
                  if (seenSite.has(key)) return;
                  seenSite.add(key);
                  websites.push(label ? { url, label } : { url });
                };
                // DB websites
                (data.websites_from_db || []).forEach(w => pushSite(w.url, w.label));
                // Socials typed as website
                (data.socials_from_db || []).forEach(s => { if ((s.type||'').toLowerCase()==='website') pushSite(s.url, 'website'); });
                // Extracted website payload primary URL
                if (data.website && typeof data.website.url === 'string') pushSite(data.website.url, data.website.title || 'site');

                // Build official links from DB socials + discovered_official_links
                const seenLink = new Set();
                const official_links = [];
                const pushLink = (platform, url, source) => {
                  if (!url || typeof url !== 'string') return;
                  if (!/^https?:\/\//i.test(url)) return;
                  const k = `${(platform||'').toLowerCase()}|${url.trim().toLowerCase()}`;
                  if (seenLink.has(k)) return;
                  seenLink.add(k);
                  official_links.push({ platform: (platform||'').toLowerCase(), url, source });
                };
                (data.socials_from_db || []).forEach(s => pushLink(s.type, s.url, 'db'));
                (data.discovered_official_links || []).forEach(l => pushLink(l.platform || l.type, l.url, l.source || 'discovered'));

                return { websites, official_links };
              } catch { return { websites: [], official_links: [] }; }
            })();

            // Derive per-step timings from traces
            const stepTimings = (() => {
              const acc = {};
              const starts = {};
              for (const t of traces) {
                const step = String(t?.step||'');
                const status = String(t?.status||'');
                const ts = Date.parse(t?.ts || '') || null;
                if (!step) continue;
                if (status === 'start' && ts) { starts[step] = ts; }
                if (status === 'end') {
                  const t0 = starts[step] || null; const t1 = ts || null;
                  const ms = (t0 && t1) ? Math.max(0, t1 - t0) : (typeof t?.ms==='number'? t.ms : null);
                  acc[step] = { ms: ms!=null?ms:null, ok: !!t?.ok };
                }
                if (status === 'skip') { acc[step] = { ms: 0, ok: false, skipped: true, reason: t?.reason||null }; }
              }
              return acc;
            })();

            // Add formatted text summary for better AI comprehension
            const formattedSummary = formatOrchestratorData(data);
            
            return { 
              report_path: reportPath, 
              formatted_summary: formattedSummary,
              ...data, 
              step_timings: stepTimings,
              ...norm 
            };
          } catch (e) {
            return { error: 'Failed to orchestrate modular socials', details: e?.message, mint_address: args.mint_address };
          }

        // Fetch OHLCV range from Birdeye.
        case 'analyze_token_ohlcv_range':
          // If the OHLCV tool is disabled, return a stub.
          if (SKIP_OHLCV) {
            console.log(chalk.yellow('    ⏭️  OHLCV tool is disabled; returning stub.'));
            return { skipped: true, reason: 'OHLCV disabled for this run' };
          }

          // Fetch OHLCV range from Birdeye.
          try {
            // Validate mint (Base58 32..44)
            const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
            if (!BASE58.test(args.mint_address)) {
              return { error: 'Invalid mint address', mint_address: args.mint_address };
            }
            // Calculate the interval.
            const interval = Math.min(Math.max((CLI_OHLCV_INTERVAL ?? args.interval_minutes ?? 1), 1), 60);

            // Calculate the time range.
            let tf = Number(args.time_from) || Math.floor((Date.now()/1000) - (6*3600));
            let tt = Number(args.time_to) || Math.floor(Date.now()/1000);
            ({ tf, tt } = normalizeWindowByInterval(tf, tt, interval));

            // Provider-side practicality: clamp excessively large requests
            const MAX_CANDLES = 5000; // safety cap for provider
            const candlesRequested = Math.floor((tt - tf) / (interval * 60));
            if (candlesRequested > MAX_CANDLES) {
              const originalTf = tf;
              tf = tt - (MAX_CANDLES * interval * 60);
              console.log(chalk.yellow(`    Clamping OHLCV window: requested ${candlesRequested} candles; using last ${MAX_CANDLES} (${originalTf}→${tf}).`));
            }

            // Fetch OHLCV range from Birdeye.
            if (FAST_OHLCV_PROVIDER === 'birdeye' && process.env.BIRDEYE_API_KEY) {
              console.log(chalk.gray(`    Fetching Birdeye v3 OHLCV fast: range ${tf}..${tt} @ ${interval}m`));

              // Fetch OHLCV range from Birdeye.
              let data = await fetchBirdeyeOHLCVRange(args.mint_address, tf, tt, interval);

              // If the data is valid, return the data and cache it.
              if (data && data.ohlcv) {
                const count = data.ohlcv.length || 0;
                console.log(chalk.green(`    ✓ Birdeye OHLCV fast loaded with ${count} candles`));
                return { provider: 'birdeye', ...data };
              }

              // Fallback 1: try a narrower, recent window tuned to interval
              const now = Math.floor(Date.now()/1000);
              let fallbackInterval = interval <= 1 ? 1 : (interval <= 5 ? 5 : 15);
              const { tf: fbFrom, tt: fbTo } = normalizeWindowByInterval(now - (14*24*3600), now, fallbackInterval);
              console.log(chalk.yellow(`    No data; retrying fallback window ${fbFrom}..${fbTo} @ ${fallbackInterval}m`));
              data = await fetchBirdeyeOHLCVRange(args.mint_address, fbFrom, fbTo, fallbackInterval);
              if (data && data.ohlcv && data.ohlcv.length) {
                console.log(chalk.green(`    ✓ Fallback OHLCV loaded with ${data.ohlcv.length} candles`));
                return { provider: 'birdeye', ...data };
              }

              // Final: return stub with context
              console.log(chalk.yellow('    Birdeye returned no data for both primary and fallback windows.'));
              return { provider: 'birdeye', mint: args.mint_address, time_from: tf, time_to: tt, interval_minutes: interval, ohlcv: [], note: 'no_data_primary_and_fallback' };
            }

            // If the data is invalid, return an error.
            return { error: 'Birdeye fast OHLCV unavailable (missing API key)', mint_address: args.mint_address };
          } catch (error) {
            return { error: 'Failed to fetch OHLCV range', details: error?.message, mint_address: args.mint_address };
          }

        case 'get_prediction_history': {
          try {
            const { 
              token_address, 
              author_handle, 
              limit = 20, 
              min_accuracy,
              prediction_type,
              order_by = 'created_at_desc' 
            } = args;
            
            // Build where clause
            const where = {};
            if (token_address) where.token_address = token_address;
            if (author_handle) where.author_handle = author_handle;
            if (min_accuracy !== undefined) where.accuracy_score = { gte: min_accuracy };
            if (prediction_type) where.prediction_type = prediction_type;
            
            // Build order clause
            let orderBy;
            switch(order_by) {
              case 'accuracy_desc': 
                orderBy = { accuracy_score: 'desc' };
                break;
              case 'accuracy_asc': 
                orderBy = { accuracy_score: 'asc' };
                break;
              case 'created_at_asc': 
                orderBy = { created_at: 'asc' };
                break;
              default: 
                orderBy = { created_at: 'desc' };
            }
            
            // Query database
            const prisma = await getPrisma();
            const predictions = await prisma.tweet_prediction_scores.findMany({
              where,
              orderBy,
              take: limit
            });
            
            if (!predictions || predictions.length === 0) {
              return {
                message: 'No prediction history found for the given criteria',
                count: 0,
                predictions: []
              };
            }
            
            // Calculate author stats if author_handle provided
            let authorStats = null;
            if (author_handle) {
              const prisma = await getPrisma();
              const allAuthorPredictions = await prisma.tweet_prediction_scores.findMany({
                where: { author_handle }
              });
              
              if (allAuthorPredictions.length > 0) {
                const accuracySum = allAuthorPredictions.reduce((sum, p) => sum + p.accuracy_score, 0);
                const avgAccuracy = accuracySum / allAuthorPredictions.length;
                
                const correctPredictions = allAuthorPredictions.filter(p => p.accuracy_score >= 50).length;
                const successRate = (correctPredictions / allAuthorPredictions.length) * 100;
                
                authorStats = {
                  total_predictions: allAuthorPredictions.length,
                  average_accuracy: avgAccuracy.toFixed(1),
                  success_rate: successRate.toFixed(1),
                  pump_predictions: allAuthorPredictions.filter(p => p.prediction_type === 'pump').length,
                  dump_predictions: allAuthorPredictions.filter(p => p.prediction_type === 'dump').length,
                  price_target_predictions: allAuthorPredictions.filter(p => p.prediction_type === 'target_price').length
                };
              }
            }
            
            // Format predictions (null/number-safe)
            const formattedPredictions = predictions.map(p => {
              const pcp = (p.price_change_pct == null) ? null : Number(p.price_change_pct);
              return {
                tweet_id: p.tweet_id,
                author: p.author_handle,
                prediction_type: p.prediction_type,
                prediction_text: p.prediction_text,
                accuracy_score: p.accuracy_score,
                verdict: p.verdict,
                price_change_pct: (pcp == null || Number.isNaN(pcp)) ? null : Number(pcp.toFixed(2)),
                minutes_checked: p.minutes_checked,
                tweet_timestamp: p.tweet_timestamp,
                verified_at: p.created_at,
                token_address: p.token_address
              };
            });
            
            return {
              count: predictions.length,
              predictions: formattedPredictions,
              ...(authorStats && { author_statistics: authorStats })
            };
            
          } catch (e) {
            return { error: `Failed to retrieve prediction history: ${e.message}` };
          }
        }

        // Trading execution tools
        case 'list_managed_wallets': {
          try {
            const { listManagedWallets } = await getWalletUtils();
            const wallets = await listManagedWallets({
              includeAdmin: args?.include_admin,
              search: args?.search,
              limit: args?.limit,
              offset: args?.offset
            });
            // Enforce server-side filtering/pagination defensively in case downstream ignores args
            let filtered = wallets;
            if (args?.search) {
              const q = String(args.search).toLowerCase();
              filtered = filtered.filter(w => (
                (w.wallet_name ? String(w.wallet_name).toLowerCase() : '').includes(q) ||
                (w.public_key ? String(w.public_key).toLowerCase() : '').includes(q)
              ));
            }
            const offset = Math.max(0, Number(args?.offset) || 0);
            const limit = Math.max(1, Math.min(500, Number(args?.limit) || 100));
            const paged = filtered.slice(offset, offset + limit);
            return { success: true, wallets: paged, count: paged.length };
          } catch (e) {
            return { error: `Failed to list wallets: ${e.message}` };
          }
        }

        case 'get_wallet_balance': {
          try {
            const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
            const { loadWallet } = await getWalletUtils();
            const { wallet, publicKey } = await loadWallet(args.wallet_id);
            
            // Get SOL balance
            const solBalance = await connection.getBalance(publicKey);
            const balances = {
              wallet_id: wallet.id,
              address: wallet.public_key,
              sol: solBalance / LAMPORTS_PER_SOL
            };

            // Get specific token balance if requested
            if (args.token_mint) {
              const tokenMint = new PublicKey(args.token_mint);
              const tokenAccount = await getAssociatedTokenAddress(tokenMint, publicKey);
              try {
                const account = await getAccount(connection, tokenAccount);
                const tokenInfo = await connection.getParsedAccountInfo(tokenMint);
                const decimals = tokenInfo.value?.data?.parsed?.info?.decimals || 9;
                balances.token = {
                  mint: args.token_mint,
                  balance: Number(account.amount) / Math.pow(10, decimals),
                  decimals
                };
              } catch {
                balances.token = { mint: args.token_mint, balance: 0, decimals: 9 };
              }
            }

            return { success: true, ...balances };
          } catch (e) {
            return { error: `Failed to get wallet balance: ${e.message}` };
          }
        }

        case 'get_wallet_holdings': {
          try {
            // Use the DegenDuel API endpoint for comprehensive wallet analysis
            const apiUrl = process.env.API_BASE_URL || 'http://localhost:3004';
            const response = await fetch(`${apiUrl}/api/wallet-analysis/${args.wallet_address}`);
            
            if (!response.ok) {
              throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Format the response for the AI
            return {
              success: true,
              wallet_address: args.wallet_address,
              sol_balance: data.summary?.solBalance?.sol || 0,
              total_value_usd: data.portfolio?.totalValue || 0,
              tokens: data.tokens?.map(t => ({
                symbol: t.symbol,
                name: t.name,
                mint: t.mint,
                balance: t.balance,
                value_usd: t.value,
                price: t.price,
                market_cap: t.marketCap,
                liquidity: t.realQuoteLiquidity
              })) || [],
              token_count: data.tokens?.length || 0
            };
          } catch (e) {
            return { error: `Failed to get wallet holdings: ${e.message}` };
          }
        }
        
        case 'get_token_price': {
          try {
            const amount = Math.floor((args.amount_sol || 1.0) * LAMPORTS_PER_SOL);
            const quote = await getQuote({
              inputMint: SOL_MINT,
              outputMint: args.token_mint,
              amount,
              slippageBps: 100
            });

            return {
              success: true,
              token_mint: args.token_mint,
              sol_amount: args.amount_sol || 1.0,
              token_amount: formatTokenAmount(quote.outAmount, quote.outputDecimals || 9),
              price_impact: quote.priceImpactPct,
              route_plan: quote.routePlan
            };
          } catch (e) {
            return { error: `Failed to get token price: ${e.message}` };
          }
        }

        case 'execute_buy': {
          try {
            // Try MCP path first if enabled, then fall back to native execution
            if (mcpEnabled && toolsAdapter) {
              try {
                console.log(chalk.gray('    [mcp] execute_buy → trying MCP'));
                const mcpRes = await toolsAdapter.executeBuy({
                  wallet_id: args.wallet_id,
                  token_mint: args.token_mint,
                  sol_amount: args.sol_amount,
                  slippage_bps: args.slippage_bps || 100,
                  priority_lamports: args.priority_lamports,
                });
                if (mcpRes && mcpRes.success) { console.log(chalk.gray('    [mcp] execute_buy OK')); return mcpRes; }
                console.log(chalk.yellow('    [mcp] execute_buy returned non-success, falling back'));
              } catch (e) { console.log(chalk.yellow('    [mcp] execute_buy error, falling back:'), e?.message || e); }
            }
            const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
            const { loadWallet } = await getWalletUtils();
            const { wallet, keypair, publicKey } = await loadWallet(args.wallet_id);
            
            // Get quote
            const amount = Math.floor(args.sol_amount * LAMPORTS_PER_SOL);
            const quote = await getQuote({
              inputMint: SOL_MINT,
              outputMint: args.token_mint,
              amount,
              slippageBps: args.slippage_bps || 100
            });

            // Get swap transaction
            const swapResponse = await getSwapTransaction({
              quoteResponse: quote,
              userPublicKey: publicKey,
              wrapAndUnwrapSol: true,
              priorityLamports: Number(process.env.PRIORITY_LAMPORTS)||10000
            });

            // Sign and send transaction
            const transaction = deserializeTransaction(swapResponse.swapTransaction);
            transaction.sign([keypair]);
            const serialized = transaction.serialize();
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            const signature = await connection.sendRawTransaction(serialized, { skipPreflight: false, maxRetries: 3 });
            await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

            return {
              success: true,
              tx_hash: signature,
              wallet_id: wallet.id,
              wallet_address: wallet.public_key,
              action: 'buy',
              token_mint: args.token_mint,
              sol_spent: args.sol_amount,
              tokens_received: formatTokenAmount(quote.outAmount, quote.outputDecimals || 9),
              price_impact: quote.priceImpactPct,
              solscan_url: `https://solscan.io/tx/${signature}`
            };
          } catch (e) {
            return { error: `Failed to execute buy: ${e.message}` };
          }
        }

        case 'smart_buy': {
          try {
            if (mcpEnabled && toolsAdapter) {
              try {
                console.log(chalk.gray('    [mcp] smart_buy → trying MCP'));
                const res = await toolsAdapter.mcp.callTool({ name: 'smart_buy', arguments: {
                  wallet_id: args.wallet_id,
                  token_mint: args.token_mint,
                  sol_amount: args.sol_amount,
                  out_amount_ui: args.out_amount_ui,
                  use_exact_out: args.use_exact_out,
                  input_mints: args.input_mints,
                  slippages_bps: args.slippages_bps,
                  priority_lamports: args.priority_lamports,
                  max_price_impact_pct: args.max_price_impact_pct,
                }});
                if (!res.isError && res.structuredContent?.success) { console.log(chalk.gray('    [mcp] smart_buy OK')); return res.structuredContent; }
                console.log(chalk.yellow('    [mcp] smart_buy non-success, falling back'));
              } catch (e) { console.log(chalk.yellow('    [mcp] smart_buy error, falling back:'), e?.message || e); }
            }
            // Fallback: simple ExactIn using execute_buy path
            if (args.use_exact_out && args.out_amount_ui) {
              // Attempt basic ExactOut via native Jupiter
              const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
              const { loadWallet } = await getWalletUtils();
              const { wallet, keypair, publicKey } = await loadWallet(args.wallet_id);
              const mintPk = new PublicKey(args.token_mint);
              const tokenInfo = await connection.getParsedAccountInfo(mintPk);
              const decimals = tokenInfo.value?.data?.parsed?.info?.decimals || 9;
              const rawOut = BigInt(Math.floor(Number(args.out_amount_ui) * Math.pow(10, decimals)));
              const quote = await getQuote({ inputMint: SOL_MINT, outputMint: args.token_mint, amount: String(rawOut), slippageBps: args.slippages_bps?.[0] || args.slippage_bps || 100, swapMode: 'ExactOut' });
              const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: Number(process.env.PRIORITY_LAMPORTS)||10000 });
              const tx = deserializeTransaction(swapResponse.swapTransaction);
              tx.sign([keypair]);
              const serialized = tx.serialize();
              const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
              const sig = await connection.sendRawTransaction(serialized, { skipPreflight: false, maxRetries: 3 });
              await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
              return { success: true, tx_hash: sig, wallet_id: wallet.id, wallet_address: wallet.public_key, action: 'buy', token_mint: args.token_mint, tokens_bought_ui: formatTokenAmount(quote.outAmount, decimals), in_mint: SOL_MINT, in_amount_ui: formatTokenAmount(quote.inAmount, SOL_DECIMALS), slippage_bps_used: quote.slippageBps ?? (args.slippages_bps?.[0] || 100), price_impact: quote.priceImpactPct, solscan_url: `https://solscan.io/tx/${sig}` };
            } else {
              // ExactIn → use execute_buy fallback
              return await this.executeTool('execute_buy', { wallet_id: args.wallet_id, token_mint: args.token_mint, sol_amount: args.sol_amount, slippage_bps: args.slippages_bps?.[0] || args.slippage_bps || 100 });
            }
          } catch (e) {
            return { error: `smart_buy_failed: ${e?.message||e}` };
          }
        }

        case 'smart_sell': {
          try {
            if (mcpEnabled && toolsAdapter) {
              try {
                console.log(chalk.gray('    [mcp] smart_sell → trying MCP'));
                const res = await toolsAdapter.mcp.callTool({ name: 'smart_sell', arguments: {
                  wallet_id: args.wallet_id,
                  token_mint: args.token_mint,
                  token_amount: args.token_amount,
                  percent_of_balance: args.percent_of_balance,
                  outputs: args.outputs,
                  slippages_bps: args.slippages_bps,
                  priority_lamports: args.priority_lamports,
                  max_price_impact_pct: args.max_price_impact_pct,
                }});
                if (!res.isError && res.structuredContent?.success) { console.log(chalk.gray('    [mcp] smart_sell OK')); return res.structuredContent; }
                console.log(chalk.yellow('    [mcp] smart_sell non-success, falling back'));
              } catch (e) { console.log(chalk.yellow('    [mcp] smart_sell error, falling back:'), e?.message || e); }
            }
            // Fallback: use executeSellInternal with first output or SOL
            const outMint = Array.isArray(args.outputs) && args.outputs.length ? args.outputs[0] : SOL_MINT;
            const slippage = Array.isArray(args.slippages_bps) && args.slippages_bps.length ? args.slippages_bps[0] : (args.slippage_bps || 100);
            const a = { wallet_id: args.wallet_id, token_mint: args.token_mint, token_amount: args.token_amount, slippage_bps: slippage, output_mint: outMint };
            return await executeSellInternal(a);
          } catch (e) {
            return { error: `smart_sell_failed: ${e?.message||e}` };
          }
        }

        // =============================
        // MCP-first research + crawl + notes
        // =============================
        case 'crawl_site': {
          try {
            if (mcpEnabled && toolsAdapter) {
              try {
                console.log(chalk.gray('    [mcp] crawl_site → trying MCP'));
                const t0 = Date.now();
                const res = await toolsAdapter.mcp.callTool({ name:'crawl_site', arguments: {
                  root_url: args.root_url,
                  max_pages: args.max_pages,
                  same_origin: args.same_origin,
                  depth: args.depth,
                  delay_ms: args.delay_ms,
                }});
                if (!res.isError) { stat('crawl_site','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
                stat('crawl_site','mcp_fallback');
              } catch (e) { stat('crawl_site','mcp_fallback'); return { error: `crawl_site_failed: ${e?.message||e}` }; }
            }
            return { error: 'crawl_site_not_available' };
          } catch (e) { return { error: `crawl_site_failed: ${e?.message||e}` }; }
        }

        case 'crawl_urls': {
          try {
            if (mcpEnabled && toolsAdapter) {
              try {
                console.log(chalk.gray('    [mcp] crawl_urls → trying MCP'));
                const t0 = Date.now();
                const res = await toolsAdapter.mcp.callTool({ name:'crawl_urls', arguments: {
                  urls: args.urls,
                  concurrency: args.concurrency,
                  delay_ms: args.delay_ms,
                }});
                if (!res.isError) { stat('crawl_urls','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
                stat('crawl_urls','mcp_fallback');
              } catch (e) { stat('crawl_urls','mcp_fallback'); return { error: `crawl_urls_failed: ${e?.message||e}` }; }
            }
            return { error: 'crawl_urls_not_available' };
          } catch (e) { return { error: `crawl_urls_failed: ${e?.message||e}` }; }
        }

        case 'write_note': {
          try {
            if (mcpEnabled && toolsAdapter) {
              try {
                console.log(chalk.gray('    [mcp] write_note → trying MCP'));
                const t0 = Date.now();
                const res = await toolsAdapter.mcp.callTool({ name:'write_note', arguments: {
                  text: args.text,
                  source_uri: args.source_uri,
                  tags: args.tags,
                }});
                if (!res.isError) { stat('write_note','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
                stat('write_note','mcp_fallback');
              } catch (e) { stat('write_note','mcp_fallback'); return { error: `write_note_failed: ${e?.message||e}` }; }
            }
            return { error: 'write_note_not_available' };
          } catch (e) { return { error: `write_note_failed: ${e?.message||e}` }; }
        }

        case 'list_notes': {
          try {
            if (mcpEnabled && toolsAdapter) {
              try {
                console.log(chalk.gray('    [mcp] list_notes → trying MCP'));
                const t0 = Date.now();
                const res = await toolsAdapter.mcp.callTool({ name:'list_notes', arguments: {
                  query: args.query,
                  limit: args.limit,
                }});
                if (!res.isError) { stat('list_notes','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
                stat('list_notes','mcp_fallback');
              } catch (e) { stat('list_notes','mcp_fallback'); return { error: `list_notes_failed: ${e?.message||e}` }; }
            }
            return { error: 'list_notes_not_available' };
          } catch (e) { return { error: `list_notes_failed: ${e?.message||e}` }; }
        }

        case 'finalize_report': {
          try {
            if (mcpEnabled && toolsAdapter) {
              try {
                console.log(chalk.gray('    [mcp] finalize_report → trying MCP'));
                const t0 = Date.now();
                const res = await toolsAdapter.mcp.callTool({ name:'finalize_report', arguments: {
                  title: args.title,
                  outline: args.outline,
                  include_notes: args.include_notes,
                  extra_context: args.extra_context,
                }});
                if (!res.isError) { stat('finalize_report','mcp_ok', Date.now()-t0); return res.structuredContent || res; }
                stat('finalize_report','mcp_fallback');
              } catch (e) { stat('finalize_report','mcp_fallback'); return { error: `finalize_report_failed: ${e?.message||e}` }; }
            }
            return { error: 'finalize_report_not_available' };
          } catch (e) { return { error: `finalize_report_failed: ${e?.message||e}` }; }
        }

        case 'execute_sell': {
          return await executeSellInternal(args);
        }

        case 'execute_sell_all': {
          // Force sell_all path; token_amount placeholder not needed here
          const a = { ...args, sell_all: true, token_amount: 0 };
          return await executeSellInternal(a);
        }

        case 'execute_sell_partial': {
          // Require token_amount; enforce sell_all=false
          const a = { ...args, sell_all: false };
          return await executeSellInternal(a);
        }

        case 'get_transaction_status': {
          try {
            const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
            const status = await connection.getSignatureStatus(args.tx_hash);
            
            return {
              success: true,
              tx_hash: args.tx_hash,
              confirmed: status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized',
              status: status.value?.confirmationStatus || 'unknown',
              error: status.value?.err || null,
              slot: status.value?.slot,
              solscan_url: `https://solscan.io/tx/${args.tx_hash}`
            };
          } catch (e) {
            return { error: `Failed to get transaction status: ${e.message}` };
          }
        }

        // ELSE: Return unknown tool error.
        default:
          return { error: 'Unknown tool: ' + toolName };
      }
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

// no-op helper removed
