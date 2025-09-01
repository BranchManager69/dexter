// token-ai/socials/tools/telegram-persist.js

import fs from 'fs';
import path from 'path';
import prisma from '../../../config/prisma.js';
import { REPORTS_DIR } from '../common.js';

// Best-effort persistence for Telegram messages.
// If prisma.telegram_messages model exists, upsert rows; otherwise just write a JSON artifact.

export async function persist_telegram_messages({ mint, chatRef, messages }) {
  const res = { persisted: 0, errors: 0, artifact: null };
  if (!Array.isArray(messages) || messages.length === 0) return res;

  // Try DB persistence; prefer the minimal TokenAI model if present.
  // If any DB op fails (missing client model or table), fall back to artifact only.
  let dbOk = true;
  try {
    for (const m of messages) {
      try {
        const row = {
          mint,
          chat_ref: chatRef || 'unknown',
          message_id: String(m.id),
          date: m.date ? new Date(m.date) : null,
          text: m.message || null,
          views: m.views ?? null,
          forwards: m.forwards ?? null,
          reply_to_msg_id: m.replyToMsgId ? String(m.replyToMsgId) : null,
          out: !!m.out,
          created_at: new Date(),
          updated_at: new Date(),
        };

        if (prisma && prisma.telegram_messages_tokenai && typeof prisma.telegram_messages_tokenai.upsert === 'function') {
          await prisma.telegram_messages_tokenai.upsert({
            where: { mint_chat_ref_message_id: { mint: row.mint, chat_ref: row.chat_ref, message_id: row.message_id } },
            update: {
              date: row.date,
              text: row.text,
              views: row.views,
              forwards: row.forwards,
              reply_to_msg_id: row.reply_to_msg_id,
              out: row.out,
              updated_at: new Date(),
            },
            create: row,
          });
        } else {
          // No compatible model in client — mark DB as not OK to skip further attempts
          throw new Error('telegram_messages_tokenai model not available in Prisma client');
        }
        res.persisted++;
      } catch (e) {
        dbOk = false; res.errors++; break;
      }
    }
  } catch {
    dbOk = false;
  }

  // Always write an artifact for transparency
  const artifact = { mint, chatRef: chatRef || 'unknown', count: messages.length, messages };
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(REPORTS_DIR, `telegram-messages-${mint}-${ts}.json`);
  try {
    fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
    res.artifact = outPath;
  } catch {}

  return res;
}
