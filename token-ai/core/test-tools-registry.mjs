// Minimal smoke test for core/tools-registry.js
import { registerTool, hasTool, getTool, registerLazyTool } from './tools-registry.js';

async function main(){
  const name = 'echo_test_tool';
  if (!hasTool(name)) registerTool(name, async (args) => ({ ok:true, args }));
  const fn = getTool(name);
  const res = fn ? await fn({ msg: 'hello' }) : null;
  console.log(JSON.stringify({ tool: name, has: hasTool(name), res }, null, 2));

  const lazyName = 'lazy_add';
  if (!hasTool(lazyName)) registerLazyTool(lazyName, async () => async ({ a, b }) => ({ sum: Number(a||0) + Number(b||0) }));
  const lazyFn = getTool(lazyName);
  const sumRes = lazyFn ? await lazyFn({ a: 2, b: 5 }) : null;
  console.log(JSON.stringify({ tool: lazyName, has: hasTool(lazyName), res: sumRes }, null, 2));
}

main().catch(e=>{ console.error('test_failed', e?.message || e); process.exit(1); });

