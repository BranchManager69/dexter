#!/usr/bin/env node

// token-ai/socials/telegram/login.js

import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
dotenv.config({ override: true });

import { Api } from 'telegram/tl/index.js';
import { getTelegramClient, connectClient, startInteractiveLogin, loadSessionString, saveSessionString } from './gramjs-client.js';
import { getTelegramConfig } from '../config.js';

function parseArgs(argv){ const args={ kv:{}, rest:[] }; for(let i=2;i<argv.length;i++){ const a=argv[i]; if(a.startsWith('--')){ const [k,v]=a.split('='); args.kv[k.replace(/^--/,'')] = v===undefined? '1': v; } else args.rest.push(a);} return args; }

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans); }));
}

async function maybeResetSession(client, sessionPath, { nonInteractive=false } = {}) {
  try { await client.invoke(new Api.auth.LogOut({})); } catch {}
  try { await client.disconnect(); } catch {}
  try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath); } catch {}
  saveSessionString('', sessionPath);
  if (!nonInteractive) console.log('[Telegram] Cleared existing session; proceeding to fresh login...');
}

async function main() {
  const { kv } = parseArgs(process.argv);
  const forceReset = kv.reset==='1' || kv.reset==='true';
  const tcfg = getTelegramConfig();
  const apiId = tcfg.api_id;
  const apiHash = tcfg.api_hash;
  const phone = tcfg.phone;
  if (!apiId || !apiHash || !phone) {
    console.error('Missing Telegram credentials. Fill token-ai/socials/config.json (telegram.api_id/api_hash/phone) or set TELEGRAM_API_ID/TELEGRAM_API_HASH/TELEGRAM_PHONE in .env');
    process.exit(1);
  }
  let { client, sessionPath } = await getTelegramClient({ apiId, apiHash, sessionPath: tcfg.session_path });

  // If a session exists, attempt to reuse or prompt to reset
  const hasSession = !!loadSessionString(sessionPath);
  if (hasSession && !forceReset) {
    try {
      // Try to connect with existing session, with a timeout guard
      await Promise.race([
        connectClient(client),
        new Promise((_, rej) => setTimeout(()=> rej(new Error('Connect timed out (existing session)')), 12000))
      ]);
      const authorized = await client.checkAuthorization?.();
      if (authorized) {
        // Show who we are logged in as
        let me = null; try { me = await client.getMe?.(); } catch {}
        const label = me?.username ? '@'+me.username : (me?.firstName || 'this account');
        const ans = (await ask(`[Telegram] Existing session detected for ${label}. Reuse it? (Y/n/reset) `)).trim().toLowerCase();
        if (ans === '' || ans === 'y' || ans === 'yes') {
          console.log('[Telegram] Reusing existing session. Nothing to do.');
          try { await client.disconnect(); } catch {}
          return;
        }
        if (ans === 'reset' || ans === 'r' || ans === 'n' || ans === 'no') {
          await maybeResetSession(client, sessionPath);
          // Recreate client after reset
          const c2 = await getTelegramClient({ apiId, apiHash, sessionPath });
          client = c2.client;
        } else {
          console.log('[Telegram] Unknown answer; aborting.');
          try { await client.disconnect(); } catch {}
          process.exit(1);
        }
      }
    } catch (e) {
      console.log('[Telegram] Existing session failed to connect:', e?.message || e);
      const ans = (await ask('[Telegram] Reset the session and login fresh? (Y/n) ')).trim().toLowerCase();
      if (ans === '' || ans === 'y' || ans === 'yes') {
        await maybeResetSession(client, sessionPath);
        const c2 = await getTelegramClient({ apiId, apiHash, sessionPath });
        client = c2.client;
      } else {
        console.log('[Telegram] Aborting per user choice.');
        process.exit(1);
      }
    }
  } else if (forceReset) {
    await maybeResetSession(client, sessionPath, { nonInteractive: true });
    const c2 = await getTelegramClient({ apiId, apiHash, sessionPath });
    client = c2.client;
  }

  // Fresh interactive login
  await connectClient(client);
  console.log('\n[Telegram] Starting interactive login for', phone);
  await startInteractiveLogin(client, {
    phoneNumber: phone,
    getCode: async () => await ask('Enter the login code sent by Telegram: '),
    getPassword: async () => tcfg.password || await ask('Two-step password (if set, else blank): '),
    sessionPath,
  });
  console.log('[Telegram] Session saved. You are logged in.');
  try { await client.disconnect(); } catch {}
  console.log('[Telegram] Disconnected.');
}

main().catch((e) => { console.error('[Telegram Login Error]', e?.message || e); process.exit(1); });
