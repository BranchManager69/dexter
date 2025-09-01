// token-ai/socials/tools/telegram-advanced.js

import { getTelegramClient, connectClient, joinByUsernameOrInvite } from '../telegram/gramjs-client.js';
import { Api } from 'telegram/tl/index.js';
import { getTelegramConfig } from '../config.js';

export async function join_telegram_group_user({ usernameOrInvite }) {
  const tcfg = getTelegramConfig();
  const apiId = tcfg.api_id;
  const apiHash = tcfg.api_hash;
  if (!apiId || !apiHash) throw new Error('Missing TELEGRAM_API_ID/TELEGRAM_API_HASH');
  const { client } = await getTelegramClient({ apiId, apiHash, sessionPath: tcfg.session_path });
  await connectClient(client);
  const res = await joinByUsernameOrInvite(client, usernameOrInvite);
  return { success: true, result: res?.className || 'ok' };
}

export async function get_telegram_recent_messages_user(/* { chatId, limit, sinceTime } */) {
  // implemented below as get_telegram_recent_messages_user_v2
  return { supported: false, reason: 'Use get_telegram_recent_messages_user_v2' };
}

// Fetch recent messages via GramJS using a username/@invite or entity id
export async function get_telegram_recent_messages_user_v2({ usernameOrInvite, limit = 100, sinceTime = null }) {
  const tcfg = (await import('../config.js')).getTelegramConfig();
  const apiId = tcfg.api_id;
  const apiHash = tcfg.api_hash;
  if (!apiId || !apiHash) throw new Error('Missing TELEGRAM_API_ID/TELEGRAM_API_HASH');
  const { client } = await getTelegramClient({ apiId, apiHash, sessionPath: tcfg.session_path });
  await connectClient(client);

  // Resolve peer (username or invite join if needed)
  let entity;
  try {
    if (usernameOrInvite) {
      const target = String(usernameOrInvite).trim().replace(/^@/, '');
      // Join if invite link
      if (/t\.me\/(\+|joinchat\/)/i.test(target)) {
        await joinByUsernameOrInvite(client, target);
      }
      entity = await client.getEntity(target);
    } else {
      throw new Error('usernameOrInvite required');
    }
  } catch (e) {
    return { success: false, error: 'Failed to resolve/join target: ' + e.message };
  }

  const since = sinceTime ? new Date(sinceTime) : null;
  let messages = [];
  try {
    // Use low-level GetHistory to retrieve messages
    const resp = await client.invoke(new Api.messages.GetHistory({
      peer: entity,
      limit: limit,
      offsetId: 0,
      minId: 0,
      addOffset: 0,
      maxId: 0,
      hash: BigInt(0)
    }));
    const all = resp.messages || [];
    for (const m of all) {
      // Only process standard message types
      if (m?.className && !String(m.className).toLowerCase().includes('message')) continue;
      const dt = m?.date ? new Date(m.date * 1000) : null;
      if (since && dt && dt < since) continue;
      const summary = {
        id: m.id,
        date: dt?.toISOString() || null,
        message: m.message || null,
        views: m.views ?? null,
        forwards: m.forwards ?? null,
        replyToMsgId: m.replyToMsgId ?? null,
        out: !!m.out,
      };
      // Inline keyboard summary (for portal/verification flows)
      try {
        const rm = m.replyMarkup;
        if (rm && rm.className && String(rm.className).toLowerCase().includes('inline')) {
          const buttons = [];
          const rows = rm.rows || [];
          for (const row of rows) {
            for (const b of (row.buttons || [])) {
              const btn = { type: b.className || 'Button', text: b.text || null };
              if (b.url) btn.url = b.url;
              if (b.data) {
                try {
                  const buf = Buffer.from(b.data);
                  btn.data_b64 = buf.toString('base64');
                } catch {}
              }
              buttons.push(btn);
            }
          }
          if (buttons.length) summary.inline_buttons = buttons;
        }
      } catch {}
      messages.push(summary);
    }
  } catch (e) {
    return { success: false, error: 'GetHistory failed: ' + e.message };
  }

  return { success: true, count: messages.length, messages };
}

// Search messages from a specific author in a chat using MTProto Search
export async function get_telegram_messages_by_author_v2({ chatUsernameOrInvite, authorUsername, limit = 100, sinceTime = null }) {
  const tcfg = (await import('../config.js')).getTelegramConfig();
  const apiId = tcfg.api_id;
  const apiHash = tcfg.api_hash;
  if (!apiId || !apiHash) throw new Error('Missing TELEGRAM_API_ID/TELEGRAM_API_HASH');
  if (!chatUsernameOrInvite || !authorUsername) throw new Error('chatUsernameOrInvite and authorUsername required');
  const { client } = await getTelegramClient({ apiId, apiHash, sessionPath: tcfg.session_path });
  await connectClient(client);

  // Resolve chat and author entities
  const chatTarget = String(chatUsernameOrInvite).trim().replace(/^@/, '');
  const authorTarget = String(authorUsername).trim().replace(/^@/, '');
  if (/t\.me\/(\+|joinchat\/)/i.test(chatTarget)) {
    await joinByUsernameOrInvite(client, chatTarget);
  }
  const [chatEntity, authorEntity] = await Promise.all([
    client.getEntity(chatTarget),
    client.getEntity(authorTarget)
  ]);

  const since = sinceTime ? new Date(sinceTime) : null;
  let messages = [];
  try {
    const resp = await client.invoke(new Api.messages.Search({
      peer: chatEntity,
      q: '',
      fromId: authorEntity,
      limit,
      offsetId: 0,
      addOffset: 0,
      minDate: 0,
      maxDate: 0,
      filter: new Api.InputMessagesFilterEmpty(),
      hash: BigInt(0)
    }));
    const all = resp.messages || [];
    for (const m of all) {
      const dt = m?.date ? new Date(m.date * 1000) : null;
      if (since && dt && dt < since) continue;
      messages.push({
        id: m.id,
        date: dt?.toISOString() || null,
        message: m.message || null,
        views: m.views ?? null,
        forwards: m.forwards ?? null,
        replyToMsgId: m.replyToMsgId ?? null,
        out: !!m.out,
      });
    }
  } catch (e) {
    return { success: false, error: 'Search failed: ' + e.message };
  }
  return { success: true, count: messages.length, messages };
}
