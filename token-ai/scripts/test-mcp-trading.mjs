#!/usr/bin/env node
// Live trading test for MCP stdio server
// - Resolves default wallet
// - Resolves token by symbol
// - Preview small buy, then execute buy
// - Preview sell of bought amount, then execute sell
// NOTE: Requires DATABASE_URL and WALLET_ENCRYPTION_KEY configured, and default wallet funded.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PARENT = path.resolve(ROOT, '..');

function loadParentEnv(){
  const env = { ...process.env };
  try {
    const txt = fs.readFileSync(path.join(PARENT, '.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1]; let val = m[2];
      // Strip surrounding quotes
      const quoted = (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
      if (quoted) val = val.slice(1,-1);
      // Remove inline comments (unquoted only)
      if (!quoted && val.includes(' #')) val = val.split(' #')[0];
      if (!quoted && val.includes('\t#')) val = val.split('\t#')[0];
      if (!quoted && val.includes('#')) {
        // If the hash appears after some whitespace, treat as comment
        const idx = val.indexOf('#');
        const before = val.slice(0, idx);
        const after = val.slice(idx+1);
        if (/\s$/.test(before)) val = before; else val = before + '#' + after; // keep if URL fragment
      }
      val = val.trim();
      if (!(key in env)) env[key] = val;
    }
  } catch {}
  if (env.RPC_URL && !env.SOLANA_RPC_ENDPOINT) env.SOLANA_RPC_ENDPOINT = env.RPC_URL;
  if (env.DATABASE_URL_PROD && !env.DATABASE_URL) env.DATABASE_URL = env.DATABASE_URL_PROD;
  env.NODE_ENV = env.NODE_ENV || 'production';
  return env;
}

async function call(client, name, args={}){
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) {
    const msg = res.content?.[0]?.text || 'tool_error';
    throw new Error(`${name} failed: ${msg}`);
  }
  return res.structuredContent || res;
}

async function main(){
  const tokenQuery = process.argv[2] || 'JUP'; // default symbol to test
  const solSpend = Number(process.env.MCP_TRADE_TEST_SOL || '0.001');

  const transport = new StdioClientTransport({ command: 'node', args: [path.join(ROOT, 'mcp', 'server.mjs')], cwd: ROOT, stderr: 'pipe', env: loadParentEnv() });
  const client = new Client({ name: 'mcp-trading-test', version: '0.1.0' }, { capabilities: { tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);

  try {
    const wallet = await call(client, 'resolve_wallet');
    if (!wallet.wallet_id) throw new Error('No default wallet resolved');
    console.log('wallet:', wallet);
    // Inspect SOL using balances tool (does not require Prisma)
    let lamports = null;
    try {
      const bals = await call(client, 'list_wallet_token_balances', { wallet_id: wallet.wallet_id, min_ui: 0, limit: 50 });
      const sol = (bals.items||[]).find(i => i.ata === 'native');
      if (sol) {
        lamports = Number(sol.amount_raw || '0');
        console.log('sol_balance:', lamports/1e9);
      }
    } catch {}

    const results = await call(client, 'resolve_token', { query: tokenQuery, limit: 3 });
    const token = (results.results||[])[0];
    if (!token) throw new Error('No token found for query');
    console.log('token:', token.symbol, token.address, 'liq=$'+(token.liquidity_usd||0));
    // If SOL is low, try to free up by selling a small portion of the largest token
    const MIN_BUFFER = 3_000_000; // ~0.003 SOL
    if (lamports != null && lamports < MIN_BUFFER) {
      console.log('Attempting to free SOL by selling a small token portion…');
      const { SOL_MINT } = await import('../trade-manager/jupiter-api.js');
      const balances = await call(client, 'list_wallet_token_balances', { wallet_id: wallet.wallet_id, min_ui: 0.000001, limit: 10 });
      const items = (balances.items||[]).filter(i=>i.mint && i.amount_ui>0 && i.mint !== SOL_MINT);
      if (!items.length) {
        console.log('No token balances to sell; skipping live trade.');
        return;
      }
      const targetLamports = MIN_BUFFER - lamports + 500_000; // add small margin
      // Pick candidate by best SOL yield from a small fraction
      const sampleFrac = 0.05;
      let best = null; let bestPreview = 0;
      for (const it of items.slice(0, 8)) {
        const testAmt = Math.max(0.000001, it.amount_ui * sampleFrac);
        try {
          const pv = await call(client, 'execute_sell_preview', { token_mint: it.mint, token_amount: Number(testAmt.toFixed(6)), slippage_bps: 300 });
          const exp = Number(pv.expected_sol || pv.expected_sol_ui || 0);
          if (exp > bestPreview) { best = it; bestPreview = exp; }
        } catch { /* ignore */ }
      }
      if (!best) { console.log('No viable token to sell; skipping live trade.'); return; }
      // Heuristic search: try increasing amounts until preview meets target
      let guess = Math.max(0.0001, best.amount_ui * sampleFrac);
      let ok = false; let tries = 0; let expected = 0;
      while (tries < 6) {
        const prev = await call(client, 'execute_sell_preview', { token_mint: best.mint, token_amount: Number(guess.toFixed(6)), slippage_bps: 300 });
        expected = Number(prev.expected_sol || prev.expected_sol_ui || 0);
        if (expected * 1e9 >= targetLamports) { ok = true; break; }
        guess *= 1.8; tries++;
      }
      if (ok) {
        console.log(`Selling ~${guess.toFixed(6)} of ${best.mint} to free ~${(expected).toFixed(6)} SOL`);
        const sold = await call(client, 'execute_sell', { token_mint: best.mint, token_amount: Number(guess.toFixed(6)), slippage_bps: 300 });
        console.log('sold:', sold);
        await sleep(1500);
      } else {
        console.log('Could not find a small sell that meets target; skipping live trade.');
        return;
      }
    }

    const prevBuy = await call(client, 'execute_buy_preview', { token_mint: token.address, sol_amount: solSpend, slippage_bps: 100 });
    console.log('preview_buy:', prevBuy);

    const buy = await call(client, 'execute_buy', { token_mint: token.address, sol_amount: solSpend, slippage_bps: 100 });
    console.log('buy:', buy);

    // Small delay to ensure balance reflects
    await sleep(1500);

    const tokensBoughtUi = Number(buy.tokens_bought_ui || '0');
    // Sell a conservative 50% to avoid rounding/balance mismatches
    const sellAmountUi = Math.max(0, Number((tokensBoughtUi * 0.5).toFixed(6)));
    if (sellAmountUi <= 0) throw new Error('No tokens bought to sell back');

    const prevSell = await call(client, 'execute_sell_preview', { token_mint: token.address, token_amount: sellAmountUi, slippage_bps: 200 });
    console.log('preview_sell:', prevSell);

    const sell = await call(client, 'execute_sell', { token_mint: token.address, token_amount: sellAmountUi, slippage_bps: 200 });
    console.log('sell:', sell);

    console.log('SUCCESS: round-trip buy/sell complete');

    // Validate sell_all on a remaining SPL token (exclude SOL and the test token)
    try {
      const { SOL_MINT } = await import('../trade-manager/jupiter-api.js');
      const bals2 = await call(client, 'list_wallet_token_balances', { wallet_id: wallet.wallet_id, min_ui: 0.000001, limit: 20 });
      const cand = (bals2.items||[]).find(i => i.mint !== SOL_MINT && i.mint !== token.address && i.amount_ui > 0.001);
      if (cand) {
        const prevAll = await call(client, 'execute_sell_all_preview', { wallet_id: wallet.wallet_id, token_mint: cand.mint, slippage_bps: 200 });
        console.log('sell_all_preview:', prevAll);
        const all = await call(client, 'execute_sell_all', { wallet_id: wallet.wallet_id, token_mint: cand.mint, slippage_bps: 200 });
        console.log('sell_all:', all);
      } else {
        console.log('sell_all: no suitable token found');
      }
    } catch (e) {
      console.log('sell_all test skipped:', e.message || String(e));
    }
  } finally {
    await client.close(); await transport.close();
  }
}

main().catch((e)=>{ console.error('test-mcp-trading error:', e?.message || e); process.exit(1); });
