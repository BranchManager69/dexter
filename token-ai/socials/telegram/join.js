#!/usr/bin/env node

// token-ai/socials/telegram/join.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { getTelegramClient, connectClient, loadSessionString } from './gramjs-client.js';
import { getTelegramConfig } from '../config.js';

async function main() {
  const target = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!target) {
    console.error('Usage: node token-ai/socials/telegram/join.js <t.me/username|@username|inviteLink>');
    process.exit(1);
  }

  const tcfg = getTelegramConfig();
  const apiId = tcfg.api_id;
  const apiHash = tcfg.api_hash;
  if (!apiId || !apiHash) {
    console.error('Missing Telegram credentials. Fill token-ai/socials/config.json (telegram.api_id/api_hash) or set TELEGRAM_API_ID/TELEGRAM_API_HASH in .env');
    process.exit(1);
  }
  const { client } = await getTelegramClient({ apiId, apiHash, sessionPath: tcfg.session_path });
  await connectClient(client);
  if (!loadSessionString(tcfg.session_path)) {
    console.error('No session found. Run: node token-ai/socials/telegram/login.js');
    process.exit(1);
  }
  // Lazy import to avoid cycle
  const { joinByUsernameOrInvite } = await import('./gramjs-client.js');
  console.log('[Telegram] Joining', target);
  const res = await joinByUsernameOrInvite(client, target);
  console.log('[Telegram] Join result:', res?.className || 'ok');
  try { await client.disconnect(); } catch {}
  console.log('[Telegram] Disconnected.');
  process.exit(0);
}

main().catch((e) => { console.error('[Telegram Join Error]', e?.message || e); process.exit(1); });
