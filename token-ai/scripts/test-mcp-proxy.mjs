#!/usr/bin/env node
// Quick test: connect to MCP via the UI proxy and list tools
// Uses demo user token if no Supabase session is present on the server side.

import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const UI_BASE = process.env.UI_BASE || 'http://127.0.0.1:3017';

async function getUserToken(){
  return new Promise((resolve) => {
    const url = new URL('/mcp-user-token', UI_BASE);
    const req = http.request(url, { method:'GET', headers:{ 'accept':'application/json' } }, (res) => {
      let data='';
      res.on('data', c=> data+=c.toString());
      res.on('end', () => {
        try { const j = JSON.parse(data); resolve(j?.token || null); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function main(){
  const tok = await getUserToken();
  if (!tok) throw new Error('failed_to_mint_user_token');
  const url = `${UI_BASE}/mcp-proxy?userToken=${encodeURIComponent(tok)}`;
  const headers = {}; // auth injected by proxy
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  const client = new Client({ name:'dexter-mcp-proxy-test', version:'0.1.0' }, { capabilities:{ tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);
  const tools = await client.listTools({});
  console.log('proxy.tools.count:', tools.tools?.length || 0);
  const names = (tools?.tools||[]).slice(0,10).map(t=>t.name);
  console.log('proxy.tools.sample:', names.join(', '));
  await client.close();
}

main().catch((e)=>{ console.error('test-mcp-proxy error:', e?.message || e); process.exit(1); });

