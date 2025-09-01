import { loadAgentStateStore as load, saveAgentStateStore as save } from './store.js';
import { buildMemoryDigest, updateStateFromAnalysis } from './memory.js';

const mint = process.argv[2] || '7p4FoJ8rCDirhkfeo3FgEsGgRc7EQcWVEaiSk5HDjupx';

(async () => {
  const state0 = await load(mint);
  console.log('Loaded state exists?', !!state0 && !!state0.memory);
  const digest0 = buildMemoryDigest(state0, 800);
  console.log('Digest0 len:', digest0.length);
  const fakeAnalysis = {
    tokenType: 'meme',
    branchScore: 71,
    riskScore: 4,
    memeSignals: { narrativeHeat: 'strong', momentumTrend: 'rising', coordinationStyle: 'organic', vibe: 'party', ctoStatus: 'forming' },
    redFlags: ['dev wallet unknown'],
    greenFlags: ['organic community growth'],
    summary: 'Solid momentum with organic coordination; monitor liquidity ops.',
    metadata: { web_citations: [{ url: 'https://example.com', title: 'Example' }] }
  };
  const state1 = updateStateFromAnalysis(state0, fakeAnalysis);
  const ok = await save(mint, state1, { digest: buildMemoryDigest(state1, 1200) });
  console.log('Saved?', ok);
  const state2 = await load(mint);
  console.log('Interactions:', state2.interactions_count);
  const digest2 = buildMemoryDigest(state2, 4000);
  console.log('Digest2 len:', digest2.length);
})();

