// token-ai/socials/tools/telegram.js

import axios from 'axios';

function tgToken() {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export async function get_telegram_group_meta(telegramUrl) {
  const token = tgToken();
  if (!token) return { scrapeSuccess: false, error: 'TELEGRAM_BOT_TOKEN missing' };
  try {
    const username = String(telegramUrl || '').split('/').pop().replace('@', '');
    const resp = await axios.get(`https://api.telegram.org/bot${token}/getChat`, { params: { chat_id: `@${username}` }, timeout: 5000 });
    if (!resp.data?.ok) return { scrapeSuccess: false, error: 'getChat failed' };
    const chat = resp.data.result;
    let memberCount = null;
    try {
      const countResp = await axios.get(`https://api.telegram.org/bot${token}/getChatMemberCount`, { params: { chat_id: `@${username}` }, timeout: 5000 });
      if (countResp.data?.ok) memberCount = countResp.data.result;
    } catch {}
    return {
      scrapeSuccess: true,
      title: chat.title,
      username: chat.username,
      type: chat.type,
      description: chat.description,
      memberCount,
      inviteLink: chat.invite_link,
      hasPrivateForwards: chat.has_private_forwards,
      hasProtectedContent: chat.has_protected_content,
      linkedChatId: chat.linked_chat_id,
    };
  } catch (e) {
    return { scrapeSuccess: false, error: e?.response?.data?.description || e.message };
  }
}

export async function get_telegram_recent_messages(/* telegramUrl, opts */) {
  // Placeholder — requires MTProto or a bot in group with message content access.
  return { supported: false, reason: 'Not implemented with Bot API; requires MTProto/user client' };
}

