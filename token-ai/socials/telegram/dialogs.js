#!/usr/bin/env node

// token-ai/socials/telegram/dialogs.js
// Lists recent dialogs and optionally fetches history for matches, without needing daemon changes.

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { Api } from 'telegram/tl/index.js';
import { getTelegramClient, connectClient } from './gramjs-client.js';

function parseArgs(argv) {
  const kv = {}; const rest = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const [k,v] = a.split('='); kv[k.replace(/^--/,'')] = v ?? '1'; }
    else rest.push(a);
  }
  return { kv, rest };
}

function pickTitle(e) { return e?.title || e?.firstName || e?.lastName || '(untitled)'; }

async function main() {
  const { kv } = parseArgs(process.argv);
  const limit = Math.min(Math.max(parseInt(kv.limit || '200', 10), 1), 500);
  const q = String(kv.q || '').trim().toLowerCase();
  const histN = Math.min(Math.max(parseInt(kv.history || '0', 10), 0), 100);

  const cfg = (await import('../config.js')).getTelegramConfig();
  const { client, sessionPath } = await getTelegramClient({ apiId: cfg.api_id, apiHash: cfg.api_hash, sessionPath: cfg.session_path });
  await connectClient(client);

  const dialogs = await client.getDialogs({ limit });
  const list = [];
  for (const d of dialogs) {
    const e = d?.entity; if (!e) continue;
    const item = {
      id: e.id || null,
      className: e.className || null,
      title: pickTitle(e),
      username: e.username || null,
      isUser: !!e.isUser,
      isBot: !!e.bot,
      isChannel: !!e.isChannel,
      isGroup: !!e.isGroup,
      unreadCount: d.unreadCount || 0,
      lastMessage: d.message?.message || null,
    };
    if (!q || (item.title?.toLowerCase().includes(q) || item.username?.toLowerCase().includes(q))) {
      if (histN > 0) {
        try {
          const resp = await client.invoke(new Api.messages.GetHistory({ peer: e, limit: histN, offsetId: 0, minId: 0, addOffset: 0, maxId: 0, hash: BigInt(0) }));
          const messages = (resp?.messages || []).map(m => ({ id: m.id, date: m?.date ? new Date(m.date*1000).toISOString() : null, message: m.message || null }));
          item.history = messages;
        } catch (e2) {
          item.historyError = e2?.message || String(e2);
        }
      }
      list.push(item);
    }
  }
  console.log(JSON.stringify({ ok: true, count: list.length, dialogs: list }, null, 2));
  try { await client.disconnect(); } catch {}
}

main().catch((e) => { console.error('[dialogs] error:', e?.message || e); process.exit(1); });

