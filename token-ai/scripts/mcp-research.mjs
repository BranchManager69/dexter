#!/usr/bin/env node
// MCP Deep Research CLI helpers
// Commands:
//   search <query> [--topN=8] [--timeRange=w]
//   fetch <url> [--mode=readability|raw]
//   smart:fetch <url> [--min-len=300] [--rendered-wait-ms=800] [--rendered-scroll-steps=2] [--rendered-scroll-delay-ms=300]
//   crawl:site <root_url> [--max=10] [--depth=2] [--same-origin=1] [--delay=200]
//   crawl:urls <url1,url2,...> [--concurrency=3] [--delay=150]
//   note:write <text> [--source=URI] [--tags=tag1,tag2]
//   note:list [--query=substr] [--limit=50]
//   note:read <id>
//   note:delete <id>
//   finalize <title> [--outline=H1|H2|H3] [--include=id1,id2] [--extra=TEXT]
//   run:quick <mint>
//   wait:mint <mint> [--timeout=600] [--poll=1500]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PARENT = path.resolve(ROOT, '..');

function usage(){
  console.log(`Usage:
  npm run mcp:search -- <QUERY> [--topN=8] [--timeRange=w]
  npm run mcp:fetch -- <URL> [--mode=readability|raw]
  npm run mcp:crawl:site -- <ROOT_URL> [--max=10] [--depth=2] [--same-origin=1] [--delay=200]
  npm run mcp:crawl:urls -- <URL1,URL2,...> [--concurrency=3] [--delay=150]
  npm run mcp:note:write -- <TEXT> [--source=URI] [--tags=tag1,tag2]
  npm run mcp:note:list -- [--query=substr] [--limit=50]
  npm run mcp:note:read -- <ID>
  npm run mcp:note:delete -- <ID>
  npm run mcp:finalize -- <TITLE> [--outline=H1|H2|H3] [--include=id1,id2] [--extra=TEXT]
  npm run mcp:run:quick -- <MINT>
  npm run mcp:wait:mint -- <MINT> [--timeout=600] [--poll=1500]
`);
}

function parseFlags(args){
  const out = {}; for (const a of args) if (a.startsWith('--')) { const [k,v] = a.slice(2).split('='); out[k.replace(/-/g,'_')] = v===undefined? true : v; } return out;
}

function loadParentEnv(){
  const env = { ...process.env };
  try {
    const txt = fs.readFileSync(path.join(PARENT, '.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)){
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
      const k = m[1]; let v = m[2]; if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v = v.slice(1,-1);
      if (!(k in env)) env[k] = v;
    }
  } catch {}
  env.NODE_ENV = env.NODE_ENV || 'production';
  if (env.RPC_URL && !env.SOLANA_RPC_ENDPOINT) env.SOLANA_RPC_ENDPOINT = env.RPC_URL;
  if (env.DATABASE_URL_PROD && !env.DATABASE_URL) env.DATABASE_URL = env.DATABASE_URL_PROD;
  return env;
}

async function main(){
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const args = rest.filter(a=>!a.startsWith('--'));
  if (!cmd) { usage(); process.exit(1); }

  const env = loadParentEnv();
  const transport = new StdioClientTransport({ command:'node', args:[path.join(ROOT,'mcp','server.mjs')], cwd: ROOT, stderr:'pipe', env });
  const client = new Client({ name:'mcp-research-cli', version:'0.1.0' }, { capabilities:{ tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);

  async function call(name, payload){
    const res = await client.callTool({ name, arguments: payload });
    if (res.isError) { console.error('ERROR:', res.content?.[0]?.text || JSON.stringify(res)); process.exit(2); }
    console.log(JSON.stringify(res.structuredContent || res, null, 2));
  }

  try {
    switch (cmd) {
      case 'search': {
        const query = args.join(' ');
        await call('web_search', { query, topN: flags.topN? Number(flags.topN): undefined, timeRange: flags.timeRange || undefined });
        break;
      }
      case 'fetch': {
        const url = args[0]; const mode = flags.mode || 'readability';
        await call('fetch_url', { url, mode });
        break;
      }
      case 'smart:fetch': {
        const url = args[0];
        await call('smart_fetch', {
          url,
          min_len: flags['min-len'] ? Number(flags['min-len']) : undefined,
          rendered_wait_ms: flags['rendered-wait-ms'] ? Number(flags['rendered-wait-ms']) : undefined,
          rendered_scroll_steps: flags['rendered-scroll-steps'] ? Number(flags['rendered-scroll-steps']) : undefined,
          rendered_scroll_delay_ms: flags['rendered-scroll-delay-ms'] ? Number(flags['rendered-scroll-delay-ms']) : undefined,
        });
        break;
      }
      case 'crawl:site': {
        const root_url = args[0];
        await call('crawl_site', { root_url, max_pages: flags.max? Number(flags.max): undefined, depth: flags.depth? Number(flags.depth): undefined, same_origin: flags['same-origin'] ? Boolean(Number(flags['same-origin'])): undefined, delay_ms: flags.delay? Number(flags.delay): undefined });
        break;
      }
      case 'crawl:urls': {
        const list = (args[0]||'').split(',').filter(Boolean);
        await call('crawl_urls', { urls: list, concurrency: flags.concurrency? Number(flags.concurrency): undefined, delay_ms: flags.delay? Number(flags.delay): undefined });
        break;
      }
      case 'note:write': {
        const text = args.join(' ');
        const tags = flags.tags ? String(flags.tags).split(',') : undefined;
        await call('write_note', { text, source_uri: flags.source || undefined, tags });
        break;
      }
      case 'note:list': {
        await call('list_notes', { query: flags.query || undefined, limit: flags.limit? Number(flags.limit): undefined });
        break;
      }
      case 'note:read': {
        await call('read_note', { id: args[0] }); break;
      }
      case 'note:delete': {
        await call('delete_note', { id: args[0] }); break;
      }
      case 'finalize': {
        const title = args.join(' ');
        const outline = flags.outline ? String(flags.outline).split('|') : undefined;
        const include_notes = flags.include ? String(flags.include).split(',') : undefined;
        await call('finalize_report', { title, outline, include_notes, extra_context: flags.extra || undefined });
        break;
      }
      case 'run:quick': {
        await call('run_agent_quick', { mint: args[0] }); break;
      }
      case 'wait:mint': {
        await call('wait_for_report_by_mint', { mint: args[0], timeout_sec: flags.timeout? Number(flags.timeout): undefined, poll_ms: flags.poll? Number(flags.poll): undefined });
        break;
      }
      default: usage(); process.exit(1);
    }
  } finally {
    await client.close(); await transport.close();
  }
}

main().catch(e=>{ console.error('fatal:', e?.message || e); process.exit(1); });
