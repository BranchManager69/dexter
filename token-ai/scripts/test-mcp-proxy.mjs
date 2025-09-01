#!/usr/bin/env node
// Smoke test for the MCP HTTP proxy (/mcp-proxy). Requires the UI server running.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = Number(process.env.TOKEN_AI_UI_PORT || 3013);
const USER_TOKEN = process.env.X_USER_TOKEN || process.env.TOKEN_AI_DEV_USER_TOKEN || 'dev_test';
const PROXY_URL = process.env.TOKEN_AI_MCP_PROXY_URL || `http://localhost:${PORT}/mcp-proxy?userToken=${encodeURIComponent(USER_TOKEN)}`;

async function main(){
  // Proxy injects Authorization; client must not send it here
  const transport = new StreamableHTTPClientTransport(PROXY_URL);
  const client = new Client({ name: 'token-ai-mcp-proxy-smoke', version: '0.2.0' }, { capabilities: { tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);
  const tools = await client.listTools({});
  console.log('tools:', tools.tools.map(t=>t.name));
  // Verify per-user identity reaches MCP
  const auth = await client.callTool({ name: 'auth_info' });
  console.log('auth_info:', auth.structuredContent || auth.content || null);
  // If wallet mapping is configured, resolve wallet
  try {
    const rw = await client.callTool({ name:'resolve_wallet' });
    console.log('resolve_wallet:', rw.structuredContent || rw.content || null);
  } catch (e) {
    console.log('resolve_wallet call failed:', e?.message || e);
  }
  await client.close();
}

main().catch((e)=>{ console.error('test-mcp-proxy error:', e?.message || e); process.exit(1); });

