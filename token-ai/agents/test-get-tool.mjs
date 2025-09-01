import { createToolExecutor } from '../core/exec-tools.js';

const mint = process.argv[2] || '7p4FoJ8rCDirhkfeo3FgEsGgRc7EQcWVEaiSk5HDjupx';

(async () => {
  const exec = createToolExecutor({ PROJECT_ROOT: process.cwd(), CACHE_TTL_MIN: 0, SKIP_OHLCV: true, CLI_OHLCV_INTERVAL: 1, FAST_OHLCV_PROVIDER: 'birdeye', CACHE_DIR: '/tmp/ai-token-cache' });
  const out1 = await exec.executeTool('get_agent_memory', { mint_address: mint, scope: 'general', max_chars: 600 });
  console.log('general:', { scope: out1.scope, len: (out1.digest||'').length, interactions: out1.interactions_count });
  const out2 = await exec.executeTool('get_agent_memory', { mint_address: mint, scope: 'comms', max_chars: 600 });
  console.log('comms:', { scope: out2.scope, len: (out2.digest||'').length });
  const out3 = await exec.executeTool('get_agent_memory', { mint_address: mint, scope: 'pros_cons', max_chars: 600 });
  console.log('pros_cons:', { scope: out3.scope, len: (out3.digest||'').length, pros: (out3.memory?.pros||[]).length, cons: (out3.memory?.cons||[]).length });
  const out4 = await exec.executeTool('get_agent_memory', { mint_address: mint, scope: 'pros', max_chars: 600 });
  console.log('pros only:', { scope: out4.scope, len: (out4.digest||'').length, count: (out4.memory?.pros||[]).length });
  const out5 = await exec.executeTool('get_agent_memory', { mint_address: mint, scope: 'cons', max_chars: 600 });
  console.log('cons only:', { scope: out5.scope, len: (out5.digest||'').length, count: (out5.memory?.cons||[]).length });
})();
