#!/usr/bin/env node
// Smoke test for the hybrid tools adapter (MCP path only for now)
import { ToolsAdapter } from '../core/tools-adapter.mjs';

async function main(){
  process.env.TOKEN_AI_ENABLE_MCP = process.env.TOKEN_AI_ENABLE_MCP || '1';
  const tools = new ToolsAdapter({ enableMcp: true });
  try {
    const t = await tools.resolveToken('CLANKA', { chain:'solana', limit: 3 });
    console.log('resolveToken:', JSON.stringify(t, null, 2).slice(0, 600));
    const preview = await tools.fetchUrl('https://example.com', { mode:'raw' });
    console.log('fetchUrl:', JSON.stringify(preview, null, 2).slice(0, 300));
  } finally { try { await tools.close(); } catch {} }
}

main().catch((e)=>{ console.error('test-mcp-adapter error:', e?.message || e); process.exit(1); });

