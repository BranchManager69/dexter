// Integration-style test for DexScreener tools via the registry
import { getTool } from './tools-registry.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

async function main(){
  // Load env like the server does (prefer parent/root .env if present, then local)
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const TOKEN_AI_DIR = path.resolve(HERE, '..');
  const PARENT = path.resolve(TOKEN_AI_DIR, '..');
  dotenv.config({ path: path.join(PARENT, '.env') });
  dotenv.config({ path: path.join(TOKEN_AI_DIR, '.env') });
  // Bridge RPC vars expected by parent config
  if (!process.env.SOLANA_RPC_ENDPOINT && process.env.RPC_URL) process.env.SOLANA_RPC_ENDPOINT = process.env.RPC_URL;
  if (!process.env.RPC_URL && process.env.SOLANA_RPC_ENDPOINT) process.env.RPC_URL = process.env.SOLANA_RPC_ENDPOINT;
  const { createToolExecutor } = await import('./exec-tools.js');
  createToolExecutor({ PROJECT_ROOT: process.cwd(), CACHE_TTL_MIN: 0 });

  const search = getTool('dexscreener_search');
  if (!search) throw new Error('dexscreener_search not registered');
  const s = await search({ query: 'BONK', chain_id: 'solana', limit: 10 });
  if (s?.error) { console.error('search_resp', s); throw new Error('dexscreener_search error: ' + (s.details || s.error)); }
  if (!Array.isArray(s?.results) || s.results.length === 0) throw new Error('dexscreener_search returned no results');
  console.log(`search_ok count=${s.results.length}`);

  // Find a Solana token address from results (prefer baseToken)
  let tokenAddr = null;
  for (const p of s.results) {
    const base = p?.baseToken?.address || p?.baseToken?.address; // consistent
    const quote = p?.quoteToken?.address;
    if (p?.chainId === 'solana' && base && !/^(So111|USD|USDC|USDT)/.test(base)) { tokenAddr = base; break; }
    if (p?.chainId === 'solana' && quote && !/^(So111|USD|USDC|USDT)/.test(quote)) { tokenAddr = quote; }
  }
  if (!tokenAddr) throw new Error('Could not resolve a Solana token address from search results');
  console.log(`picked_token=${tokenAddr}`);

  const tokenPairs = getTool('dexscreener_token_pairs');
  if (!tokenPairs) throw new Error('dexscreener_token_pairs not registered');
  const tp = await tokenPairs({ chain_id: 'solana', token_address: tokenAddr });
  if (tp?.error) throw new Error('dexscreener_token_pairs error: ' + tp.error);
  if (!tp?.raw || (!tp.raw.pairs && !Array.isArray(tp.raw))) throw new Error('dexscreener_token_pairs unexpected shape');
  console.log('token_pairs_ok');

  const pairDetails = getTool('dexscreener_pair_details');
  if (!pairDetails) throw new Error('dexscreener_pair_details not registered');
  // Pick a pairId from token pairs result
  const anyPairId = Array.isArray(tp?.raw?.pairs) ? tp.raw.pairs[0]?.pairAddress : (Array.isArray(tp?.raw) ? tp.raw[0]?.pairAddress : null);
  if (!anyPairId) throw new Error('No pairId found to test pair details');
  const pd = await pairDetails({ chain_id: 'solana', pair_id: anyPairId });
  if (pd?.error) throw new Error('dexscreener_pair_details error: ' + pd.error);
  if (!pd?.raw) throw new Error('dexscreener_pair_details missing raw');
  console.log('pair_details_ok');
}

main().catch(e=>{ console.error('dexscreener_test_failed', e?.message || e); process.exit(1); });
