import { createToolExecutor } from '../core/exec-tools.js';

// Usage:
//   node agents/test-dexscreener.mjs <SYMBOL> [CHAIN=solana]

const symbol = process.argv[2] || 'BONK';
const chain = process.argv[3] || 'solana';

(async () => {
  const exec = createToolExecutor({ PROJECT_ROOT: process.cwd(), CACHE_TTL_MIN: 0, SKIP_OHLCV: true, CLI_OHLCV_INTERVAL: 1, FAST_OHLCV_PROVIDER: 'birdeye', CACHE_DIR: '/tmp/ai-token-cache' });
  const res = await exec.executeTool('resolve_symbol_to_mints', { symbol, chain_id: chain, limit: 10, enrich: true });
  console.log(JSON.stringify(res, null, 2));
})();

