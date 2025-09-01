import { createToolExecutor } from '../core/exec-tools.js';
import { loadAgentStateStore as load, saveAgentStateStore as save } from './store.js';
import { updateStateMarket } from './market.js';
import { buildScopedDigest } from './memory.js';

const mint = process.argv[2] || '7p4FoJ8rCDirhkfeo3FgEsGgRc7EQcWVEaiSk5HDjupx';

(async () => {
  const exec = createToolExecutor({ PROJECT_ROOT: process.cwd(), CACHE_TTL_MIN: 0, SKIP_OHLCV: false, CLI_OHLCV_INTERVAL: 1, FAST_OHLCV_PROVIDER: 'birdeye', CACHE_DIR: '/tmp/ai-token-cache' });
  const now = Math.floor(Date.now()/1000);
  const tf = now - 3600;
  const tt = now;
  const res = await exec.executeTool('analyze_token_ohlcv_range', { mint_address: mint, time_from: tf, time_to: tt, interval_minutes: 1 });
  if (res && res.ohlcv && res.ohlcv.length) {
    const state = await load(mint);
    // remove any placeholder example citations if present
    if (state?.memory?.citations) {
      state.memory.citations = state.memory.citations.filter(c => (c?.url||'').indexOf('example.com') === -1);
    }
    updateStateMarket(state, res);
    await save(mint, state, { digest: buildScopedDigest(state, 'summary', 2000) });
    console.log('OHLCV updated: candles=', res.ohlcv.length, 'change_pct=', state.memory.market?.price?.change_pct);
  } else {
    console.log('OHLCV fetch returned no data or error:', res?.error || res?.note);
  }
})();

