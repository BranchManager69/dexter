#!/usr/bin/env node

// token-ai/socials/telegram/request-webview.js
// Attempts to request a WebView URL from a bot for a given start param.

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { Api } from 'telegram/tl/index.js';
import { getTelegramClient, connectClient } from './gramjs-client.js';

function usage(){
  console.log('Usage: node token-ai/socials/telegram/request-webview.js <@bot> --param=-100xxxx [--platform=android]');
}

function parseArgs(argv){
  const kv = {}; const rest = [];
  for (let i=2;i<argv.length;i++){ const a = argv[i]; if (a.startsWith('--')){ const [k,v]=a.split('='); kv[k.replace(/^--/,'')] = v ?? '1'; } else rest.push(a);} return {kv, rest};
}

async function main(){
  const {kv, rest} = parseArgs(process.argv);
  const bot = (rest[0]||'').replace(/^@/,'');
  const param = kv.param || kv.p;
  const platform = kv.platform || 'android';
  if (!bot || !param) return usage();
  const cfg = (await import('../config.js')).getTelegramConfig();
  const { client } = await getTelegramClient({ apiId: cfg.api_id, apiHash: cfg.api_hash, sessionPath: cfg.session_path });
  await connectClient(client);

  const botEntity = await client.getEntity(bot);
  const peer = botEntity; // DM with bot
  try {
    console.log('[request-webview] invoking RequestWebView...');
    const res = await client.invoke(new Api.messages.RequestWebView({
      peer,
      bot: botEntity,
      fromBotMenu: false,
      platform,
      startParam: String(param),
      // url: undefined, // server will compute
    }));
    console.log('[request-webview] invoked.');
    try {
      console.log('className:', res?.className || null);
      // Some TL objects contain circular refs; pick known fields
      const url = res?.url || res?.queryId || res?.device || null;
      console.log('raw:', url ? { url } : res);
    } catch (e2) {
      console.log('[request-webview] got response but could not stringify; type:', res?.className || typeof res);
    }
  } catch (e) {
    console.error('[request-webview] error:', e?.errorMessage || e?.message || String(e));
    process.exitCode = 1;
  }
  try { await client.disconnect(); } catch {}
}

main().catch((e)=>{ console.error('[request-webview] fatal:', e?.message || e); process.exit(1); });
