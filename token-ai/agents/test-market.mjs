import { loadAgentStateStore as load, saveAgentStateStore as save } from './store.js';
import { updateStateMarket } from './market.js';
import { buildScopedDigest } from './memory.js';

const mint = process.argv[2] || '7p4FoJ8rCDirhkfeo3FgEsGgRc7EQcWVEaiSk5HDjupx';

(async () => {
  const state = await load(mint);
  const now = Math.floor(Date.now()/1000);
  // fake simple OHLCV with rise
  const ohlcv = [];
  for (let i=10; i>=1; i--) {
    const t = now - i*60;
    const base = 1 + (10-i)*0.01; // ascending
    ohlcv.push({ t, o: base, h: base+0.02, l: base-0.02, c: base+0.01, v: 1000 + i*10, v_usd: 2000 + i*15 });
  }
  const res = { provider:'fake', time_from: now-600, time_to: now, interval_minutes: 1, ohlcv };
  updateStateMarket(state, res);
  await save(mint, state, { digest: buildScopedDigest(state, 'summary', 1200) });
  console.log('Updated market summary for', mint);
})();

