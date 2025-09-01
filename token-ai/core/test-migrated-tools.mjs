// Smoke tests for migrated tools (validation paths, no network/DB required)
import { getTool, hasTool } from './tools-registry.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

async function run(){
  // Load env same as server (parent then local), and bridge RPC vars
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const TOKEN_AI_DIR = path.resolve(HERE, '..');
  const PARENT = path.resolve(TOKEN_AI_DIR, '..');
  dotenv.config({ path: path.join(PARENT, '.env') });
  dotenv.config({ path: path.join(TOKEN_AI_DIR, '.env') });
  if (!process.env.SOLANA_RPC_ENDPOINT && process.env.RPC_URL) process.env.SOLANA_RPC_ENDPOINT = process.env.RPC_URL;
  if (!process.env.RPC_URL && process.env.SOLANA_RPC_ENDPOINT) process.env.RPC_URL = process.env.SOLANA_RPC_ENDPOINT;
  // Ensure exec-tools registers default handlers by constructing an executor once
  const { createToolExecutor } = await import('./exec-tools.js');
  const ex = createToolExecutor({ PROJECT_ROOT: process.cwd(), CACHE_TTL_MIN: 0, SKIP_OHLCV: false, FAST_OHLCV_PROVIDER: 'birdeye' });
  void ex; // silence unused

  // 1) analyze_token_ohlcv_range without API key -> error stub
  const ohlcv = getTool('analyze_token_ohlcv_range');
  const r1 = ohlcv ? await ohlcv({ mint_address: 'NotAValidMint_____123', time_from: 0, time_to: 0, interval_minutes: 1 }) : null;
  console.log('ohlcv_invalid_mint:', r1 && r1.error ? 'ok' : 'unexpected');

  // 2) websites: invalid URL
  const webExtract = getTool('extract_website_content');
  const r2 = webExtract ? await webExtract({ url: 'notaurl' }) : null;
  console.log('website_invalid_url:', r2 && r2.error ? 'ok' : 'unexpected');

  // 3) discover_official_links: invalid mint
  const discover = getTool('discover_official_links');
  const r3 = discover ? await discover({ mint_address: 'badmint', urls: [] }) : null;
  console.log('discover_invalid_mint:', r3 && r3.error ? 'ok' : 'unexpected');

  // 4) get_twitter_recent_tweets: invalid URL
  const tweets = getTool('get_twitter_recent_tweets');
  const r4 = tweets ? await tweets({ twitter_url: 'notaurl', limit: 5 }) : null;
  console.log('twitter_invalid_url:', r4 && r4.error ? 'ok' : 'unexpected');
}

run().catch(e=>{ console.error('migrated_tools_smoke_failed', e?.message || e); process.exit(1); });
