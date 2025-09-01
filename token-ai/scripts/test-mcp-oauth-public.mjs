#!/usr/bin/env node
// End-to-end smoke test for the public OAuth-enabled MCP server at clanka.win
// Uses built-in OIDC endpoints exposed at https://clanka.win/mcp

import crypto from 'node:crypto';
import https from 'node:https';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = 'https://clanka.win/mcp';

function b64url(buf){
  return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function sha256b64url(s){
  const h = crypto.createHash('sha256').update(s).digest();
  return b64url(h);
}

async function httpsGetRaw(url, headers={}){
  return new Promise((resolve) => {
    const req = https.request(url, { method:'GET', headers }, (res) => {
      let data='';
      res.on('data', c=> data+=c.toString());
      res.on('end', ()=> resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', (e)=> resolve({ status: 500, headers:{}, body: String(e?.message||e) }));
    req.end();
  });
}

async function httpsPostForm(url, form, headers={}){
  const body = new URLSearchParams(form).toString();
  return new Promise((resolve) => {
    const req = https.request(url, { method:'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } }, (res) => {
      let data=''; res.on('data', c=> data+=c.toString()); res.on('end', ()=> resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', (e)=> resolve({ status: 500, headers:{}, body: String(e?.message||e) }));
    req.write(body); req.end();
  });
}

async function main(){
  // 1) Discover metadata from public domain
  const meta = await httpsGetRaw('https://clanka.win/.well-known/oauth-authorization-server');
  console.log('meta.status:', meta.status);
  const discovery = JSON.parse(meta.body || '{}');
  const authzEndpoint = discovery.authorization_endpoint || `${BASE}/authorize`;
  const tokenEndpoint = discovery.token_endpoint || `${BASE}/token`;

  // 2) PKCE params
  const clientId = 'clanka-mcp';
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = sha256b64url(verifier);
  const redirect = `${BASE}/callback`;

  // 3) Authorize (auto-approve)
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    approve: '1'
  }).toString();
  const authz = await httpsGetRaw(`${authzEndpoint}?${qs}`);
  console.log('authorize.status:', authz.status);
  const loc = authz.headers.location || '';
  if (!loc || !/code=/.test(loc)) throw new Error('No authorization code redirect');
  const code = new URL(loc.startsWith('http') ? loc : `${redirect}?${loc.split('?')[1]}`).searchParams.get('code');
  if (!code) throw new Error('Missing code');

  // 4) Token exchange
  const tok = await httpsPostForm(tokenEndpoint, { grant_type:'authorization_code', code, code_verifier: verifier, client_id: clientId });
  console.log('token.status:', tok.status);
  const tokenResp = JSON.parse(tok.body || '{}');
  if (!tokenResp.access_token) throw new Error('No access_token');

  // 5) Connect MCP with bearer against public URL
  const headers = { Authorization: `Bearer ${tokenResp.access_token}` };
  const transport = new StreamableHTTPClientTransport(BASE, { requestInit: { headers } });
  const client = new Client({ name:'token-ai-mcp-oauth-public', version:'0.3.0' }, { capabilities:{ tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);
  const tools = await client.listTools({});
  console.log('tools.count:', tools.tools?.length || 0);
  await client.close();
}

main().catch((e)=>{ console.error('test-mcp-oauth-public error:', e?.message || e); process.exit(1); });

