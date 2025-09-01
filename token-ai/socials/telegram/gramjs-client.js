// token-ai/socials/telegram/gramjs-client.js

import fs from 'fs';
import path from 'path';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram/tl/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { getTelegramConfig } from '../config.js';
import url from 'url';

function buildProxyFromConfig(tcfg){
  const p = tcfg?.proxy || {};
  let host = p.host, port = p.port ? Number(p.port) : undefined, username = p.username, password = p.password, type = p.type;
  if (p.url) {
    try {
      const u = new url.URL(String(p.url));
      host = u.hostname || host;
      port = u.port ? Number(u.port) : port;
      username = u.username || username;
      password = u.password || password;
      const proto = (u.protocol || '').replace(':','');
      if (/socks5/i.test(proto)) type = 'socks5';
      else if (/socks4/i.test(proto)) type = 'socks4';
    } catch {}
  }
  if (!host || !port) {
    if (Array.isArray(tcfg?.proxy_pool) && tcfg.proxy_pool.length > 0) {
      try {
        const u = new (require('url').URL)(String(tcfg.proxy_pool[0]));
        host = u.hostname || host;
        port = u.port ? Number(u.port) : port;
        username = u.username || username;
        password = u.password || password;
        const proto = (u.protocol || '').replace(':','');
        if (/socks5/i.test(proto)) type = 'socks5';
        else if (/socks4/i.test(proto)) type = 'socks4';
      } catch {}
    }
  }
  if (!host || !port) return null;
  // Strip IPv6 brackets if present
  host = String(host).replace(/^\[|\]$/g, '');
  const socksType = /4/.test(String(type||'')) ? 4 : 5;
  const proxy = { ip: host, port: Number(port), socksType };
  if (username) proxy.username = username;
  if (password) proxy.password = password;
  return proxy;
}

const DEFAULT_SESSION_PATH = path.join(process.cwd(), 'token-ai', 'socials', 'telegram', 'session.session');

export function loadSessionString(sessionPath = DEFAULT_SESSION_PATH) {
  try { return fs.existsSync(sessionPath) ? fs.readFileSync(sessionPath, 'utf8').trim() : ''; }
  catch { return ''; }
}

export function saveSessionString(session, sessionPath = DEFAULT_SESSION_PATH) {
  const dir = path.dirname(sessionPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sessionPath, session, 'utf8');
}

export async function getTelegramClient({ apiId, apiHash, sessionPath = DEFAULT_SESSION_PATH, proxyOverride = null } = {}) {
  if (!apiId || !apiHash) throw new Error('Missing TELEGRAM_API_ID/TELEGRAM_API_HASH');
  const tcfg = getTelegramConfig();
  const sessionStr = loadSessionString(sessionPath);
  const proxy = proxyOverride || buildProxyFromConfig(tcfg);
  const client = new TelegramClient(new StringSession(sessionStr), Number(apiId), String(apiHash), {
    connectionRetries: 5,
    // Use more plausible defaults and allow overrides from config/env
    // Default: Google Pixel 6 running Android 13 (real device/OS combo)
    deviceModel: tcfg.client?.device_model || process.env.TELEGRAM_DEVICE_MODEL || 'Google Pixel 6',
    systemVersion: tcfg.client?.system_version || process.env.TELEGRAM_SYSTEM_VERSION || 'Android 13; Pixel 6 Build/TQ3A.230805.001',
    appVersion: tcfg.client?.app_version || process.env.TELEGRAM_APP_VERSION || '10.12.2',
    langCode: process.env.TELEGRAM_LANG_CODE || 'en',
    systemLangCode: process.env.TELEGRAM_SYSTEM_LANG_CODE || 'en-US',
    useIPV6: !!tcfg.use_ipv6,
    ...(proxy ? { proxy } : {}),
  });
  return { client, sessionPath };
}

export async function connectClient(client) {
  if (!client.connected) {
    // Let GramJS negotiate DC/auth; do not force a DC here, as accounts may migrate (e.g., DC1)
    await client.connect();
  }
}

export async function startInteractiveLogin(client, { phoneNumber, getCode, getPassword, sessionPath = DEFAULT_SESSION_PATH } = {}) {
  await client.start({
    phoneNumber: async () => phoneNumber,
    phoneCode: async () => (await getCode())?.trim(),
    password: async () => (getPassword ? await getPassword() : undefined),
    onError: (err) => { throw err; },
  });
  saveSessionString(client.session.save(), sessionPath);
}

export async function joinByUsernameOrInvite(client, raw) {
  const target = String(raw || '').trim();
  if (!target) throw new Error('join target empty');
  // Invite hash (t.me/+HASH or joinchat/HASH)
  const inviteMatch = target.match(/t\.me\/(?:\+|joinchat\/)([A-Za-z0-9_-]+)/i);
  if (inviteMatch) {
    const hash = inviteMatch[1];
    return await client.invoke(new Api.messages.ImportChatInvite({ hash }));
  }
  // Username or full URL
  const username = target.replace(/^(https?:\/\/)?t\.me\//i, '').replace(/^@/, '');
  try {
    // GramJS convenience: Join channel/supergroup
    return await client.invoke(new Api.channels.JoinChannel({ channel: username }));
  } catch (e) {
    // Fallback: resolve entity then join
    const entity = await client.getEntity(username);
    try {
      return await client.invoke(new Api.channels.JoinChannel({ channel: entity }));
    } catch (e2) {
      // For legacy small chats (rare)
      if (entity?.id) {
        try {
          return await client.invoke(new Api.messages.AddChatUser({ chatId: entity.id, userId: entity, fwdLimit: 0 }));
        } catch {}
      }
      throw e2;
    }
  }
}

export function subscribeToMessages(client, handler) {
  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message) return;
      handler({
        chatId: message.chatId?.toString?.() || null,
        senderId: message.senderId?.toString?.() || null,
        text: message.message || '',
        date: message.date,
        raw: message,
      });
    } catch {}
  }, new NewMessage({}));
}
