#!/usr/bin/env node
// Lightweight CLI to call MCP trading tools without Codex
// Commands:
//   balances <wallet_id> [--min-ui=NUM] [--limit=N]
//   buy <wallet_id> <mint> [--sol=NUM] [--slippage=150,250,300]
//   sell <wallet_id> <mint> [--amount=NUM] [--pct=PCT] [--output=SOL|USDC] [--slippage=100,200,300]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PARENT = path.resolve(ROOT, '..');

function usage() {
  console.log(`Usage:
  node scripts/mcp-trade.mjs balances <wallet_id> [--min-ui=NUM] [--limit=N]
  node scripts/mcp-trade.mjs buy <wallet_id> <mint> [--sol=NUM] [--slippage=150,250,300]
  node scripts/mcp-trade.mjs sell <wallet_id> <mint> [--amount=NUM] [--pct=PCT] [--output=SOL|USDC] [--slippage=100,200,300]
`);
}

function parseFlags(argv){
  const out = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const [k,vRaw] = a.slice(2).split('=');
    const v = (vRaw === undefined) ? true : vRaw;
    out[k.replace(/-/g,'_')] = v;
  }
  return out;
}

function loadParentEnv(){
  const env = { ...process.env };
  // Merge selected vars from parent .env (monorepo root)
  const envPath = path.join(PARENT, '.env');
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1]; let val = m[2];
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1,-1);
      if (!(key in env)) env[key] = val;
    }
  } catch {}
  // Ensure critical vars
  env.NODE_ENV = env.NODE_ENV || 'production';
  if (env.RPC_URL && !env.SOLANA_RPC_ENDPOINT) env.SOLANA_RPC_ENDPOINT = env.RPC_URL;
  // DATABASE_URL is set by '../config/database-env.js' using DATABASE_URL_PROD; but set both for safety
  if (env.DATABASE_URL_PROD && !env.DATABASE_URL) env.DATABASE_URL = env.DATABASE_URL_PROD;
  return env;
}

async function main(){
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd) { usage(); process.exit(1); }
  const flags = parseFlags(argv.slice(1));
  const childEnv = loadParentEnv();

  const transport = new StdioClientTransport({ command: 'node', args: [path.join(ROOT, 'mcp', 'server.mjs')], cwd: ROOT, stderr: 'pipe', env: childEnv });
  const client = new Client({ name: 'mcp-trade-cli', version: '0.1.0' }, { capabilities: { tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);

  async function call(name, args){
    const res = await client.callTool({ name, arguments: args });
    if (res.isError) {
      console.error('ERROR:', (res.content?.[0]?.text) || JSON.stringify(res));
      process.exit(2);
    }
    console.log(JSON.stringify(res.structuredContent || res, null, 2));
  }

  if (cmd === 'balances') {
    const wallet_id = argv[1];
    if (!wallet_id) { usage(); process.exit(1); }
    const min_ui = flags.min_ui ? Number(flags.min_ui) : 0;
    const limit = flags.limit ? Number(flags.limit) : undefined;
    await call('list_wallet_token_balances', { wallet_id, min_ui, limit });
  } else if (cmd === 'buy') {
    const wallet_id = argv[1]; const token_mint = argv[2];
    if (!wallet_id || !token_mint) { usage(); process.exit(1); }
    const slippage_bps = flags.slippage ? Number(String(flags.slippage).split(',')[0]) : undefined;
    const sol_amount = Number(flags.sol || 0);
    if (!sol_amount || sol_amount <= 0) { console.error('buy requires --sol'); process.exit(1); }
    // Optional preview then execute
    await call('execute_buy_preview', { token_mint, sol_amount, slippage_bps });
    await call('execute_buy', { wallet_id, token_mint, sol_amount, slippage_bps });
  } else if (cmd === 'sell') {
    const wallet_id = argv[1]; const token_mint = argv[2];
    if (!wallet_id || !token_mint) { usage(); process.exit(1); }
    const output_mint = flags.output ? String(flags.output) : undefined;
    const slippage_bps = flags.slippage ? Number(String(flags.slippage).split(',')[0]) : undefined;
    let token_amount = flags.amount ? Number(flags.amount) : undefined;
    const percent_of_balance = flags.pct ? Number(flags.pct) : undefined;
    if (!token_amount && percent_of_balance) {
      // Resolve current balance to compute percent
      const bals = await (await client.callTool({ name:'list_wallet_token_balances', arguments:{ wallet_id, min_ui: 0, limit: 200 } })).structuredContent;
      const row = (bals?.items||[]).find(i => i.mint === token_mint);
      if (!row) { console.error('sell: token not found in balances'); process.exit(1); }
      token_amount = Number((row.amount_ui * (percent_of_balance/100)).toFixed(6));
    }
    if (!token_amount || token_amount <= 0) { console.error('sell requires --amount or --pct'); process.exit(1); }
    await call('execute_sell_preview', { token_mint, token_amount, slippage_bps, output_mint });
    await call('execute_sell', { wallet_id, token_mint, token_amount, slippage_bps, output_mint });
  } else {
    usage(); process.exit(1);
  }

  await client.close(); await transport.close();
}

main().catch(e => { console.error('fatal:', e?.message || e); process.exit(1); });
