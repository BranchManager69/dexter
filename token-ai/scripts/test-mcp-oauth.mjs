#!/usr/bin/env node
// End-to-end smoke test for OAuth-enabled MCP HTTP server (built-in OIDC provider)
// Flow: authorize (PKCE) -> token -> connect MCP -> list tools -> list recent analyses

import crypto from 'node:crypto';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = Number(process.env.TOKEN_AI_MCP_PORT || 3928);
const BASE = process.env.TOKEN_AI_MCP_PUBLIC_URL || `http://localhost:${PORT}/mcp`;
const MCP_URL = `http://localhost:${PORT}/mcp`;

function b64url(buf){
  return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function sha256b64url(s){
  const h = crypto.createHash('sha256').update(s).digest();
  return b64url(h);
}

async function httpGetRaw(url){
  return new Promise((resolve) => {
    const req = http.request(url, { method:'GET' }, (res) => {
      let data='';
      res.on('data', c=> data+=c.toString());
      res.on('end', ()=> resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', (e)=> resolve({ status: 500, headers:{}, body: String(e?.message||e) }));
    req.end();
  });
}

async function httpPostForm(url, form){
  const body = new URLSearchParams(form).toString();
  return new Promise((resolve) => {
    const req = http.request(url, { method:'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } }, (res) => {
      let data=''; res.on('data', c=> data+=c.toString()); res.on('end', ()=> resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', (e)=> resolve({ status: 500, headers:{}, body: String(e?.message||e) }));
    req.write(body); req.end();
  });
}

async function main(){
  // 1) Discover metadata
  const meta = await httpGetRaw(`${MCP_URL.replace(/\/mcp$/, '')}/.well-known/oauth-authorization-server`);
  console.log('meta.status:', meta.status);
  const discovery = JSON.parse(meta.body || '{}');
  // Prefer local endpoints regardless of discovery host to avoid mismatched PUBLIC_URL during dev
  const localBase = MCP_URL.replace(/\/mcp$/, '');
  const authzEndpoint = `${localBase}/authorize`;
  const tokenEndpoint = `${localBase}/token`;

  // 2) PKCE params
  const clientId = process.env.TOKEN_AI_OIDC_CLIENT_ID || 'clanka-mcp';
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = sha256b64url(verifier);
  const redirect = `${MCP_URL.replace(/\/mcp$/, '')}/callback`;

  // 3) Authorize (auto-approve via approve=1)
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    approve: '1'
  }).toString();
  const authz = await httpGetRaw(`${authzEndpoint}?${qs}`);
  console.log('authorize.status:', authz.status);
  const loc = authz.headers.location || '';
  if (!loc || !/code=/.test(loc)) throw new Error('No authorization code redirect');
  const code = new URL(loc.startsWith('http') ? loc : `${redirect}?${loc.split('?')[1]}`).searchParams.get('code');
  if (!code) throw new Error('Missing code');

  // 4) Token exchange
  const tok = await httpPostForm(tokenEndpoint, { grant_type:'authorization_code', code, code_verifier: verifier, client_id: clientId });
  console.log('token.status:', tok.status);
  const tokenResp = JSON.parse(tok.body || '{}');
  if (!tokenResp.access_token) throw new Error('No access_token');

  // 5) Connect MCP with bearer
  const headers = { Authorization: `Bearer ${tokenResp.access_token}` };
  const transport = new StreamableHTTPClientTransport(MCP_URL, { requestInit: { headers } });
  const client = new Client({ name:'token-ai-mcp-oauth-smoke', version:'0.3.0' }, { capabilities:{ tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);
  const tools = await client.listTools({});
  console.log('tools.count:', tools.tools?.length || 0);
  const recent = await client.callTool({ name:'list_recent_analyses', arguments:{ limit: 1 } });
  console.log('list_recent_analyses.ok:', !!recent);
  await client.close();
}

main().catch((e)=>{ console.error('test-mcp-oauth error:', e?.message || e); process.exit(1); });
