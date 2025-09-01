// token-ai/socials/telegram/voice.js

// Voice scaffolding for group calls using TGCalls-style interfaces.
// This file lays the tracks and degrades gracefully if the library is missing.

import fs from 'fs';
import path from 'path';
import { getTelegramClient, connectClient } from './gramjs-client.js';

async function loadTgCalls() {
  try {
    // Defer import to allow repo usage without the dep installed
    const mod = await import('tgcalls');
    return mod;
  } catch (e) {
    return null;
  }
}

export async function startGroupCallReceive({ usernameOrInvite, outDir = 'token-ai/socials/reports/voice', durationSec = 60 }) {
  const tgcalls = await loadTgCalls();
  if (!tgcalls) {
    return { success: false, error: 'tgcalls not installed. Install a TGCalls-compatible library to enable voice.' };
  }
  const { getTelegramConfig } = await import('../config.js');
  const cfg = getTelegramConfig();
  const { api_id: apiId, api_hash: apiHash, session_path: sessionPath } = cfg;
  if (!apiId || !apiHash) return { success: false, error: 'Missing TELEGRAM_API_ID/TELEGRAM_API_HASH' };
  const { client } = await getTelegramClient({ apiId, apiHash, sessionPath });
  await connectClient(client);

  // Pseudocode: create a TGCalls client bound to GramJS client
  // Note: concrete APIs differ among libs; this is a scaffold.
  const call = new tgcalls.TGCalls(client);
  try {
    await call.joinVoiceChat(usernameOrInvite);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, `record-${Date.now()}.ogg`);
    const writable = fs.createWriteStream(outfile);
    await call.on('audio', (chunk) => { writable.write(chunk); });
    await new Promise(r => setTimeout(r, (Number(durationSec)||60)*1000));
    writable.end();
    await call.leaveVoiceChat();
    return { success: true, path: outfile };
  } catch (e) {
    try { await call.leaveVoiceChat(); } catch {}
    return { success: false, error: e.message };
  }
}

export async function startGroupCallSend({ usernameOrInvite, filePath }) {
  const tgcalls = await loadTgCalls();
  if (!tgcalls) {
    return { success: false, error: 'tgcalls not installed. Install a TGCalls-compatible library to enable voice.' };
  }
  const { getTelegramConfig } = await import('../config.js');
  const cfg = getTelegramConfig();
  const { api_id: apiId, api_hash: apiHash, session_path: sessionPath } = cfg;
  if (!apiId || !apiHash) return { success: false, error: 'Missing TELEGRAM_API_ID/TELEGRAM_API_HASH' };
  if (!fs.existsSync(filePath)) return { success: false, error: 'Audio file not found: ' + filePath };
  const { client } = await getTelegramClient({ apiId, apiHash, sessionPath });
  await connectClient(client);

  const call = new tgcalls.TGCalls(client);
  try {
    await call.joinVoiceChat(usernameOrInvite);
    const readable = fs.createReadStream(filePath);
    readable.on('data', (chunk) => call.sendAudio(chunk));
    await new Promise((resolve, reject) => { readable.on('end', resolve); readable.on('error', reject); });
    await call.leaveVoiceChat();
    return { success: true };
  } catch (e) {
    try { await call.leaveVoiceChat(); } catch {}
    return { success: false, error: e.message };
  }
}

