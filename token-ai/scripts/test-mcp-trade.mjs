#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

async function main(){
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(ROOT, 'mcp', 'server.mjs')],
    cwd: ROOT,
    stderr: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SOLANA_RPC_ENDPOINT: process.env.SOLANA_RPC_ENDPOINT || 'https://mainnet.helius-rpc.com/?api-key='+(process.env.HELIUS_API_KEY||'') || 'https://api.mainnet-beta.solana.com',
    }
  });
  const client = new Client({ name: 'token-ai-mcp-trade-smoke', version: '0.1.0' }, { capabilities: { tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);
  const wallets = await client.callTool({ name:'list_managed_wallets', arguments:{}});
  const list = wallets.structuredContent?.wallets || [];
  console.log('managed_wallets.count:', list.length);
  if (list.length) {
    const w = list[0];
    console.log('wallet:', w.id, w.public_key);
  }
  await client.close();
  await transport.close();
}

main().catch((e)=>{ console.error('trade-smoke error:', e?.message || e); process.exit(1); });

