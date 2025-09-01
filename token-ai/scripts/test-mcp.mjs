#!/usr/bin/env node
// Ad-hoc smoke test: spawn the MCP stdio server and exercise a few tools
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
  });
  const client = new Client({ name: 'token-ai-mcp-smoke', version: '0.1.0' }, {
    capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} }
  });
  await client.connect(transport);
  console.log('connected');
  try {
    const tools = await client.listTools({});
    console.log('tools:', tools.tools.map(t=>t.name));
  } catch (e) { console.error('listTools error:', e?.message || e); throw e; }
  try {
    const recent = await client.callTool({ name:'list_recent_analyses', arguments:{ limit: 3 } });
    console.log('list_recent_analyses.items:', (recent.structuredContent?.items||[]).length);
  } catch (e) { console.error('list_recent_analyses error:', e?.message || e); }
  try {
    const uris = await client.callTool({ name:'list_resource_uris', arguments:{ limit: 3 } });
    console.log('list_resource_uris.count:', (uris.structuredContent?.uris||[]).length);
  } catch (e) { console.error('list_resource_uris error:', e?.message || e); }
  let page1;
  try {
    page1 = await client.callTool({ name:'list_reports_page', arguments:{ limit: 2 } });
    console.log('list_reports_page.count:', (page1.structuredContent?.uris||[]).length, 'next?:', !!page1.structuredContent?.nextCursor);
  } catch (e) { console.error('list_reports_page error:', e?.message || e); }
  try {
    const latest = await client.callTool({ name:'get_latest_analysis' });
    console.log('get_latest_analysis.file:', latest.structuredContent?.file || null);
  } catch (e) { console.error('get_latest_analysis error:', e?.message || e); }
  try {
    if ((page1?.structuredContent?.uris||[])[0]){
      const rd = await client.callTool({ name:'read_report_uri', arguments:{ uri: page1.structuredContent.uris[0] } });
      console.log('read_report_uri.file:', rd.structuredContent?.file || null);
    }
  } catch (e) { console.error('read_report_uri error:', e?.message || e); }
  await client.close();
  await transport.close();
}

main().catch((e)=>{ console.error('test-mcp error:', e?.message || e); process.exit(1); });
