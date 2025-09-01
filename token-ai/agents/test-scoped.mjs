import { loadAgentStateStore as load } from '../agents/store.js';
import { buildScopedDigest } from '../agents/memory.js';

const mint = process.argv[2] || '7p4FoJ8rCDirhkfeo3FgEsGgRc7EQcWVEaiSk5HDjupx';

(async () => {
  const state = await load(mint);
  const scopes = ['general','comms','pros','cons','pros_cons','summary','full'];
  for (const s of scopes) {
    const d = buildScopedDigest(state, s, 1200);
    console.log(`SCOPE=${s} len=${d.length}\n${d}\n---`);
  }
})();
