#!/usr/bin/env node
// Smoke test for MCP HTTP server
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = Number(process.env.TOKEN_AI_MCP_PORT || 3928);
const URL = process.env.TOKEN_AI_MCP_URL || `http://localhost:${PORT}/mcp`;
const TOKEN = process.env.TOKEN_AI_MCP_TOKEN || '';

async function main(){
  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
  const transport = new StreamableHTTPClientTransport(URL, { requestInit: { headers } });
  const client = new Client({ name: 'token-ai-mcp-http-smoke', version: '0.2.0' }, { capabilities: { tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);
  const tools = await client.listTools({});
  console.log('tools:', tools.tools.map(t=>t.name));
  const recent = await client.callTool({ name:'list_recent_analyses', arguments:{ limit: 2 } });
  console.log('list_recent_analyses.items:', (recent.structuredContent?.items||[]).length);
  const uris = await client.callTool({ name:'list_resource_uris', arguments:{ limit: 2 } });
  console.log('list_resource_uris.count:', (uris.structuredContent?.uris||[]).length);
  const page1 = await client.callTool({ name:'list_reports_page', arguments:{ limit: 2 } });
  const urisPage = page1.structuredContent?.uris||[];
  console.log('list_reports_page.count:', urisPage.length, 'next?:', !!page1.structuredContent?.nextCursor);
  const latest = await client.callTool({ name:'get_latest_analysis' });
  console.log('get_latest_analysis.file:', latest.structuredContent?.file || null);
  if (urisPage[0]){
    console.log('read_report_uri.try:', urisPage[0]);
    const rd = await client.callTool({ name:'read_report_uri', arguments:{ uri: urisPage[0] } });
    console.log('read_report_uri.file:', rd.structuredContent?.file || null);
  }
  const resList = await client.listResources({});
  console.log('resources.count:', (resList.resources||[]).length);
  if ((resList.resources||[]).length){
    const first = resList.resources[0];
    const content = await client.readResource({ uri: first.uri });
    const len = (content?.contents?.[0]?.text || '').length;
    console.log('read_resource.bytes:', len);
  }
  await client.close();
}

main().catch((e)=>{ console.error('test-mcp-http error:', e?.message || e); process.exit(1); });
