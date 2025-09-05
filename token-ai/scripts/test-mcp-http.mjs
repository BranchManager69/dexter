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
  try {
    const tools = await client.listTools({});
    console.log('tools:', tools.tools.map(t=>t.name));
  } catch (e) { console.error('step:listTools error:', e); throw e; }
  try {
    const recent = await client.callTool({ name:'list_recent_analyses', arguments:{ limit: 2 } });
    console.log('list_recent_analyses.items:', (recent.structuredContent?.items||[]).length);
  } catch (e) { console.error('step:list_recent_analyses error:', e); }
  try {
    const uris = await client.callTool({ name:'list_resource_uris', arguments:{ limit: 2 } });
    console.log('list_resource_uris.count:', (uris.structuredContent?.uris||[]).length);
  } catch (e) { console.error('step:list_resource_uris error:', e); }
  let urisPage = [];
  try {
    const page1 = await client.callTool({ name:'list_reports_page', arguments:{ limit: 2 } });
    urisPage = page1.structuredContent?.uris||[];
    console.log('list_reports_page.count:', urisPage.length, 'next?:', !!page1.structuredContent?.nextCursor);
  } catch (e) { console.error('step:list_reports_page error:', e); }
  try {
    const latest = await client.callTool({ name:'get_latest_analysis' });
    console.log('get_latest_analysis.file:', latest.structuredContent?.file || null);
  } catch (e) { console.error('step:get_latest_analysis error:', e); }
  try {
    if (urisPage[0]){
      console.log('read_report_uri.try:', urisPage[0]);
      const rd = await client.callTool({ name:'read_report_uri', arguments:{ uri: urisPage[0] } });
      console.log('read_report_uri.file:', rd.structuredContent?.file || null);
    }
  } catch (e) { console.error('step:read_report_uri error:', e); }
  let resList = { resources: [] };
  try {
    resList = await client.listResources({});
    console.log('resources.count:', (resList.resources||[]).length);
  } catch (e) { console.error('step:listResources error:', e); }
  try {
    if ((resList.resources||[]).length){
      const first = resList.resources[0];
      console.log('read_resource.try:', first.uri);
      const content = await client.readResource({ uri: first.uri });
      console.log('read_resource.contents[0]:', content?.contents?.[0]);
      const len = (content?.contents?.[0]?.text || '').length;
      console.log('read_resource.bytes:', len);
    }
  } catch (e) { console.error('step:readResource error:', e); throw e; }
  await client.close();
}

main().catch((e)=>{ console.error('test-mcp-http error:', e?.message || e); process.exit(1); });
