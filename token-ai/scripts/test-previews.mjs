#!/usr/bin/env node
// Quick smoke test for preview trading tools (no transactions sent)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

async function main(){
  // Lazily import executor to allow env to be set by caller
  const { createToolExecutor } = await import(path.join(ROOT, 'core', 'exec-tools.js'));

  const exec = createToolExecutor({
    PROJECT_ROOT: ROOT,
    CACHE_TTL_MIN: 0,
    SKIP_OHLCV: true,
    CLI_OHLCV_INTERVAL: 1,
    FAST_OHLCV_PROVIDER: 'birdeye',
  });

  // Sample mint from recent reports
  const MINT = process.env.TEST_MINT || '2ZqgkCpvXjzB4NstzBUPSrsYrrbziUv5mC9CsxSQZryG';

  console.log('Testing execute_buy_preview...');
  const buyPrev = await exec.executeTool('execute_buy_preview', {
    token_mint: MINT,
    sol_amount: Number(process.env.TEST_SOL || '0.01'),
    slippage_bps: Number(process.env.TEST_SLIPPAGE || '100')
  });
  console.log('buy_preview:', buyPrev);

  console.log('Testing execute_sell_preview...');
  const sellPrev = await exec.executeTool('execute_sell_preview', {
    token_mint: MINT,
    token_amount: Number(process.env.TEST_TOKENS || '1'),
    slippage_bps: Number(process.env.TEST_SLIPPAGE || '100')
  });
  console.log('sell_preview:', sellPrev);
}

main().catch(e=>{ console.error('test-previews error:', e?.message || e); process.exit(1); });

