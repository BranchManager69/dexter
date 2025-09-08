#!/usr/bin/env node
// Ultra-short health check: prints one line with UI + MCP status
import http from 'node:http';

function fetchUrl(url, opts = {}){
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + (u.search || ''),
        method: opts.method || 'GET',
        headers: opts.headers || {},
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ ok: true, status: res.statusCode, body: Buffer.concat(chunks).toString(), headers: res.headers }));
      });
      req.on('error', () => resolve({ ok: false }));
      if (opts.body) req.write(opts.body);
      req.end();
    } catch { resolve({ ok:false }); }
  });
}

async function check(){
  const UI_PORT = Number(process.env.TOKEN_AI_UI_PORT || 3017);
  const MCP_PORT = Number(process.env.TOKEN_AI_MCP_PORT || 3930);
  const TOKEN = process.env.TOKEN_AI_MCP_TOKEN || '';

  const ui = await fetchUrl(`http://127.0.0.1:${UI_PORT}/agent-env.js?v=ok`);

  const initBody = JSON.stringify({ jsonrpc:'2.0', id:'1', method:'initialize', params:{ clientInfo:{ name:'ok', version:'0.1' }, protocolVersion:'2024-11-05', capabilities:{} } });
  const mcp = await fetchUrl(`http://127.0.0.1:${MCP_PORT}/mcp`, {
    method:'POST',
    headers: { 'content-type':'application/json', 'accept':'application/json, text/event-stream', ...(TOKEN ? { 'authorization': `Bearer ${TOKEN}` } : {}) },
    body: initBody,
  });

  const uiOk = ui.ok && ui.status === 200;
  const mcpOk = mcp.ok && (mcp.status === 200);

  const parts = [];
  parts.push(`UI:${uiOk ? 'OK' : 'DOWN'}`);
  parts.push(`MCP:${mcpOk ? 'OK' : 'DOWN'}`);
  console.log(parts.join(' | '));
}

check().catch(()=>{ console.log('UI:DOWN | MCP:DOWN'); });

