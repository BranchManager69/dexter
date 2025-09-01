import { createToolExecutor } from '../core/exec-tools.js';

// Usage:
//   node agents/test-verify-prediction.mjs <MINT> <TWEET_ID> [MINUTES]
// Example:
//   node agents/test-verify-prediction.mjs 7p4FoJ8rCDirhkfeo3FgEsGgRc7EQcWVEaiSk5HDjupx 1841234567890123456 1440

const mint = process.argv[2];
const tweetId = process.argv[3];
const minutes = Number(process.argv[4] || 1440);

if (!mint || !tweetId) {
  console.error('Usage: node agents/test-verify-prediction.mjs <MINT> <TWEET_ID> [MINUTES]');
  process.exit(1);
}

(async () => {
  const exec = createToolExecutor({ PROJECT_ROOT: process.cwd(), CACHE_TTL_MIN: 0, SKIP_OHLCV: false, CLI_OHLCV_INTERVAL: 1, FAST_OHLCV_PROVIDER: 'birdeye', CACHE_DIR: '/tmp/ai-token-cache' });
  const res = await exec.executeTool('verify_tweet_prediction', {
    tweet_id: tweetId,
    minutes_after: minutes,
    prediction_type: 'auto_detect',
    mint_address: mint
  });
  console.log(JSON.stringify(res, null, 2));
})();

