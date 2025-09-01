import { createToolExecutor } from '../core/exec-tools.js';

// Usage examples:
//   node agents/test-relative-prediction.mjs <TWEET_ID> <MINT_A> <MINT_B> [WINDOW_MIN=1440]
//   node agents/test-relative-prediction.mjs <TWEET_ID> --symbols LLM,BONK [WINDOW_MIN=1440]

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node agents/test-relative-prediction.mjs <TWEET_ID> <MINT_A> <MINT_B> [WINDOW_MIN]');
  console.error('   or: node agents/test-relative-prediction.mjs <TWEET_ID> --symbols SYM1,SYM2 [WINDOW_MIN]');
  process.exit(1);
}

const tweetId = args[0];
let windowMin = Number(args[3] || 1440);
let mintA = null, mintB = null, symbols = null;

if (args[1] === '--symbols') {
  symbols = String(args[2]||'').split(',').map(s=>s.trim()).filter(Boolean);
} else {
  mintA = args[1];
  mintB = args[2];
}

(async () => {
  const exec = createToolExecutor({ PROJECT_ROOT: process.cwd(), CACHE_TTL_MIN: 0, SKIP_OHLCV: false, CLI_OHLCV_INTERVAL: 1, FAST_OHLCV_PROVIDER: 'birdeye', CACHE_DIR: '/tmp/ai-token-cache' });
  const payload = {
    tweet_id: tweetId,
    window_minutes: windowMin,
    claim: { type: 'outperform', primary_index: 0, against_index: 1 },
    chain_id: 'solana'
  };
  if (symbols) payload.symbols = symbols; else payload.mint_addresses = [mintA, mintB];
  const res = await exec.executeTool('verify_relative_prediction', payload);
  console.log(JSON.stringify(res, null, 2));
})();

