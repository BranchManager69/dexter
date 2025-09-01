#!/usr/bin/env node
// Comprehensive end-to-end MCP test (unified /mcp)
// - Discovery (/.well-known/*)
// - Gate hint (GET /mcp with Accept: text/event-stream → 401 + WWW-Authenticate)
// - OAuth flow (PKCE) → token → StreamableHTTP connect → list tools → search → fetch
// - Bearer flow (TOKEN_AI_MCP_TOKEN) → connect → list tools
// - UI proxy flow (/mcp-proxy?userToken=…) if /mcp-user-token is reachable

import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';

function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function sha256b64url(s){ return b64url(crypto.createHash('sha256').update(s).digest()); }
function getAgent(url){ return url.startsWith('https:') ? https : (url.startsWith('http:') ? http : https); }
async function httpGetRaw(url, headers={}){ return await new Promise((resolve)=>{ const a=getAgent(url); const req=a.request(url,{method:'GET',headers},(res)=>{ let data=''; res.on('data',c=>data+=c.toString()); res.on('end',()=>resolve({ status:res.statusCode, headers:res.headers, body:data }));}); req.on('error',(e)=>resolve({ status:500, headers:{}, body:String(e?.message||e) })); req.end(); }); }
async function httpPostForm(url, form, headers={}){ const body = new URLSearchParams(form).toString(); return await new Promise((resolve)=>{ const a=getAgent(url); const req=a.request(url, { method:'POST', headers: { 'content-type':'application/x-www-form-urlencoded', ...headers } }, (res)=>{ let data=''; res.on('data',c=>data+=c.toString()); res.on('end',()=>resolve({ status:res.statusCode, headers:res.headers, body:data }));}); req.on('error',(e)=>resolve({ status:500, headers:{}, body:String(e?.message||e) })); try { req.write(body); } catch {} req.end(); }); }

function baseFrom(url){ try { const u=new URL(url); u.pathname=''; u.search=''; u.hash=''; return u.toString().replace(/\/$/,''); } catch { return url.replace(/\/mcp$/,''); } }

function log(step, ok, extra){ const s=ok? 'OK' : 'FAIL'; console.log(`${step}: ${s}${extra?` - ${extra}`:''}`); }

async function connectAndSmoke(baseUrl, headers){
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const transport = new StreamableHTTPClientTransport(baseUrl, { requestInit: { headers } });
  const client = new Client({ name:'mcp-all-smoke', version:'0.4.0' }, { capabilities:{ tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);
  const tools = await client.listTools({});
  log('listTools', true, `count=${tools.tools?.length||0}`);
  // Try canonical search/fetch if present
  const hasSearch = tools.tools?.some(t=>t.name==='search');
  const hasFetch = tools.tools?.some(t=>t.name==='fetch');
  if (hasSearch) {
    const sr = await client.callTool({ name:'search', arguments:{ query:'mint' } });
    const raw = sr?.content?.[0]?.text || '';
    log('search', !!raw, `bytes=${raw.length}`);
    if (hasFetch) {
      try {
        const parsed = JSON.parse(raw||'{}');
        const id = parsed?.results?.[0]?.id;
        if (id) {
          const fr = await client.callTool({ name:'fetch', arguments:{ id } });
          log('fetch', !!(fr?.content?.[0]?.text), `bytes=${(fr?.content?.[0]?.text||'').length}`);
        }
      } catch {}
    }
  }
  await client.close();
}

async function main(){
  const PORT = Number(process.env.TOKEN_AI_MCP_PORT || 3928);
  const BASE = (process.env.TOKEN_AI_MCP_PUBLIC_URL || `http://localhost:${PORT}/mcp`).replace(/\/$/,'');
  const ROOT = baseFrom(BASE);
  let failures = 0;

  // 1) Discovery
  const meta = await httpGetRaw(`${ROOT}/.well-known/openid-configuration`);
  log('discovery.openid-configuration', meta.status===200, `status=${meta.status}`);
  if (meta.status!==200) failures++;

  // 2) Gate hint on /mcp (should be 401 with WWW-Authenticate)
  const gate = await httpGetRaw(BASE, { 'Accept': 'text/event-stream' });
  const gateOk = gate.status===401 && /WWW-Authenticate:/i.test(Object.keys(gate.headers).join('\n'));
  log('gate.sse_hint', gateOk, `status=${gate.status}`);
  if (!gateOk) failures++;

  // 3) OAuth flow (PKCE) → token
  try {
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = sha256b64url(verifier);
    const auth = await httpGetRaw(`${BASE}/authorize?client_id=clanka-mcp&redirect_uri=${encodeURIComponent(`${ROOT}/callback`)}&response_type=code&scope=openid%20profile%20email&code_challenge=${challenge}&code_challenge_method=S256`);
    const loc = auth.headers.location || '';
    const code = loc && loc.includes('code=') ? new URL(loc).searchParams.get('code') : null;
    const tok = code ? await httpPostForm(`${BASE}/token`, { grant_type:'authorization_code', code, code_verifier:verifier, client_id:'clanka-mcp' }) : { status:0 };
    const ok = auth.status===302 && tok.status===200;
    log('oauth.pkce', ok, `authorize=${auth.status} token=${tok.status}`);
    if (!ok) { failures++; }
    if (ok) {
      const access = JSON.parse(tok.body||'{}')?.access_token || '';
      // 4) Connect with OAuth bearer and smoke tools
      await connectAndSmoke(BASE, { Authorization: `Bearer ${access}` });
    }
  } catch (e) {
    failures++; log('oauth.pkce', false, e?.message||String(e));
  }

  // 5) Bearer flow (server token) if provided
  try {
    const token = process.env.TOKEN_AI_MCP_TOKEN || '';
    if (token) {
      await connectAndSmoke(BASE, { Authorization: `Bearer ${token}` });
    } else {
      log('bearer.skip', true, 'TOKEN_AI_MCP_TOKEN not set');
    }
  } catch (e) {
    failures++; log('bearer.flow', false, e?.message||String(e));
  }

  // 6) UI proxy flow (optional): try to mint a userToken and connect via /mcp-proxy
  try {
    const t = await httpGetRaw(`${ROOT}/mcp-user-token`);
    if (t.status===200) {
      const j = JSON.parse(t.body||'{}');
      if (j?.token) {
        const proxy = `${ROOT}/mcp-proxy?userToken=${encodeURIComponent(j.token)}`;
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
        const transport = new StreamableHTTPClientTransport(proxy);
        const c = new Client({ name:'mcp-proxy-smoke', version:'0.1.0' }, { capabilities:{ tools:{}, resources:{}, prompts:{}, logging:{} } });
        await c.connect(transport);
        const tools = await c.listTools({});
        log('proxy.listTools', true, `count=${tools.tools?.length||0}`);
        await c.close();
      }
    } else {
      log('proxy.skip', true, `mcp-user-token status=${t.status}`);
    }
  } catch (e) {
    // Optional; do not count as failure
    log('proxy.flow', false, e?.message||String(e));
  }

  if (failures>0) {
    console.error(`mcp-all: ${failures} failures`);
    process.exit(1);
  } else {
    console.log('mcp-all: ALL CHECKS PASSED');
  }
}

main().catch((e)=>{ console.error('test-mcp-all error:', e?.message || e); process.exit(1); });

