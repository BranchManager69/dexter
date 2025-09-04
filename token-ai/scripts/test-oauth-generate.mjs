#!/usr/bin/env node
// Public-domain MCP OAuth test to generate a new wallet and verify listing
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = (process.env.TOKEN_AI_MCP_PUBLIC_URL || 'https://dexter.cash/mcp').replace(/\/$/,'');

function getAgent(url){ return url.startsWith('https:') ? https : http; }
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function sha256b64url(s){ return b64url(crypto.createHash('sha256').update(s).digest()); }

async function httpGet(url, headers={}){
  return await new Promise((resolve)=>{
    const a = getAgent(url);
    const req = a.request(url, { method:'GET', headers }, (res)=>{ let data=''; res.on('data',c=>data+=c); res.on('end',()=> resolve({ status:res.statusCode, headers:res.headers, body:data })); });
    req.on('error', e=> resolve({ status:500, headers:{}, body:String(e?.message||e) })); req.end();
  });
}

async function httpPostForm(url, form, headers={}){
  const body = new URLSearchParams(form).toString();
  return await new Promise((resolve)=>{
    const a = getAgent(url);
    const req = a.request(url, { method:'POST', headers: { 'content-type':'application/x-www-form-urlencoded', ...headers } }, (res)=>{ let data=''; res.on('data',c=>data+=c); res.on('end',()=> resolve({ status:res.statusCode, headers:res.headers, body:data })); });
    req.on('error', e=> resolve({ status:500, headers:{}, body:String(e?.message||e) }));
    req.write(body); req.end();
  });
}

async function main(){
  // 1) Discovery
  const disco = await httpGet(`${BASE}/.well-known/openid-configuration`);
  if (disco.status !== 200) throw new Error(`discovery_failed status=${disco.status}`);
  const prov = JSON.parse(disco.body||'{}');
  const authz = prov.authorization_endpoint || `${BASE}/authorize`;
  const tokenEp = prov.token_endpoint || `${BASE}/token`;
  const redirect = `${BASE}/callback`;

  // 2) OAuth PKCE
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = sha256b64url(verifier);
  const auth = await httpGet(`${authz}?client_id=clanka-mcp&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=openid%20profile%20email&code_challenge=${challenge}&code_challenge_method=S256`);
  if (auth.status !== 302) throw new Error(`authorize_failed status=${auth.status}`);
  const loc = auth.headers.location || '';
  const code = loc && loc.includes('code=') ? new URL(loc).searchParams.get('code') : null;
  if (!code) throw new Error('no_code');
  const tok = await httpPostForm(tokenEp, { grant_type:'authorization_code', code, code_verifier:verifier, client_id:'clanka-mcp' });
  if (tok.status !== 200) throw new Error(`token_failed status=${tok.status} body=${tok.body}`);
  const access = JSON.parse(tok.body||'{}')?.access_token || '';
  if (!access) throw new Error('no_access_token');

  // 3) Connect MCP and call tools
  const headers = { Authorization: `Bearer ${access}` };
  const transport = new StreamableHTTPClientTransport(BASE, { requestInit: { headers } });
  const client = new Client({ name:'oauth-generate-wallet-test', version:'0.1.0' }, { capabilities:{ tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);

  const label = `OAuth Test Wallet ${new Date().toISOString().slice(0,19)}`;
  const gen = await client.callTool({ name:'generate_wallet', arguments:{ label } });
  console.log('generate_wallet:', gen.structuredContent || gen);
  const genId = (gen?.structuredContent?.wallet_id) || null;
  if (genId) console.log('GENERATED_WALLET_ID:', genId);

  const my = await client.callTool({ name:'list_my_wallets', arguments:{} });
  console.log('list_my_wallets:', my.structuredContent || my);

  const authInfo = await client.callTool({ name:'auth_info', arguments:{} });
  console.log('auth_info:', authInfo.structuredContent || authInfo);

  await client.close();
}

main().catch(e=>{ console.error('test-oauth-generate error:', e?.message || e); process.exit(1); });



