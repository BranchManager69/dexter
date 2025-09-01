#!/usr/bin/env node

// token-ai/socials/telegram/session-daemon.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import http from 'http';
import chalk from 'chalk';
import { Api } from 'telegram/tl/index.js';
import { getTelegramClient, connectClient, joinByUsernameOrInvite } from './gramjs-client.js';
import { SocksClient } from 'socks';
import url from 'url';
import { getTelegramConfig } from '../config.js';

const PORT = parseInt(process.env.TELEGRAM_DAEMON_PORT || '41235', 10);
const CONNECT_TIMEOUT_MS = parseInt(process.env.TELEGRAM_CONNECT_TIMEOUT_MS || '30000', 10);
const RECONNECT_DELAY_MS = parseInt(process.env.TELEGRAM_RECONNECT_DELAY_MS || '3000', 10);
const CMD_TIMEOUT_MS = parseInt(process.env.TELEGRAM_DAEMON_CMD_TIMEOUT_MS || '12000', 10);
const READY_TIMEOUT_MS = parseInt(process.env.TELEGRAM_DAEMON_READY_TIMEOUT_MS || '10000', 10);
const ROTATE_AFTER_NOT_READY = parseInt(process.env.TELEGRAM_PROXY_ROTATE_AFTER || '3', 10);

let client = null;
let sessionPath = null;
let connectedAt = null;
let lastError = null;
let ready = false;
let readyAt = null;
let proxyIdx = 0;
let notReadyStreak = 0;
let currentProxy = null; // masked string for status
let banned = false;
let banReason = null;

function log(...args) { console.log(chalk.gray('[TG-Daemon]'), ...args); }
function j(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

function parseProxyUrl(u) {
  try {
    const uu = new url.URL(String(u));
    const host = uu.hostname;
    const port = uu.port ? Number(uu.port) : undefined;
    const username = uu.username || undefined;
    const password = uu.password || undefined;
    const proto = (uu.protocol || '').replace(':','');
    const type = /socks4/i.test(proto) ? 'socks4' : 'socks5';
    return { host, port, username, password, type };
  } catch { return null; }
}

function maskProxy(u) {
  try { const uu = new url.URL(String(u)); uu.username='***'; uu.password='***'; return uu.toString(); } catch { return '(invalid)'; }
}

async function ensureClient() {
  if (client && client.connected) { if (!connectedAt) connectedAt = new Date(); return; }
  const cfg = getTelegramConfig();
  const apiId = cfg.api_id; const apiHash = cfg.api_hash;
  if (!apiId || !apiHash) throw new Error('Missing TELEGRAM_API_ID/TELEGRAM_API_HASH');
  // Choose proxy: prefer pool order
  const pool = Array.isArray(cfg.proxy_pool) ? cfg.proxy_pool.filter(Boolean) : [];
  if (pool.length === 0 && cfg.proxy?.url) pool.push(cfg.proxy.url);
  const chosen = pool.length ? pool[(proxyIdx % pool.length + pool.length) % pool.length] : null;
  const proxyOverride = chosen ? (function(){
    const p = parseProxyUrl(chosen); if (!p) return null;
    const socksType = p.type === 'socks4' ? 4 : 5;
    currentProxy = maskProxy(chosen);
    return { ip: p.host, port: Number(p.port), socksType, ...(p.username?{username:p.username}:{}) , ...(p.password?{password:p.password}:{}) };
  })() : null;
  // Quick pre-probe to DC4:443 to weed out dead proxies
  if (proxyOverride) {
    try {
      await SocksClient.createConnection({
        proxy: { host: proxyOverride.ip, port: proxyOverride.port, type: proxyOverride.socksType, userId: proxyOverride.username, password: proxyOverride.password },
        command: "connect", timeout: 4000,
        destination: { host: cfg.use_ipv6 ? "2001:067c:04e8:f004:0000:0000:0000:000a" : "149.154.167.91", port: 443 }
      }).then(({ socket })=> { try { socket.destroy(); } catch {} });
    } catch (e) {
      lastError = "pre-probe failed: " + (e?.message || e);
      log('Pre-probe failed for', currentProxy, 'rotating');
      proxyIdx++; throw new Error(lastError);
    }
  }
    const cobj = await getTelegramClient({ apiId, apiHash, sessionPath: cfg.session_path, proxyOverride });
  client = cobj.client; sessionPath = cobj.sessionPath;
  await Promise.race([
    connectClient(client),
    new Promise((_, rej)=> setTimeout(()=> rej(new Error('connect timeout')) , CONNECT_TIMEOUT_MS))
  ]);
  connectedAt = new Date();
}

async function ensureReady() {
  if (!client || !client.connected) throw new Error('not connected');
  await Promise.race([
    client.invoke(new Api.help.GetConfig()),
    new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout')), READY_TIMEOUT_MS))
  ]);
  // Check account viability via getMe; detect ban/invalid session
  try {
    await Promise.race([
      client.getMe(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('getMe timeout')), READY_TIMEOUT_MS))
    ]);
    banned = false; banReason = null;
  } catch (e) {
    const msg = (e?.errorMessage || e?.message || String(e)).toUpperCase();
    if (msg.includes('USER_DEACTIVATED') || msg.includes('BAN') || msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('SESSION_REVOKED')) {
      banned = true; banReason = e?.errorMessage || e?.message || 'account_banned';
      throw new Error('account_banned: ' + banReason);
    }
    // Not a ban — leave readiness to true; but surface last error
  }
  ready = true;
  if (!readyAt) readyAt = new Date();
}

async function connectLoop() {
  for (;;) {
    try {
      await ensureClient();
      try {
        await ensureReady();
        log('Connected (ready).', currentProxy ? 'via '+currentProxy : '');
        notReadyStreak = 0;
      } catch (e) {
        lastError = e?.message || String(e);
        notReadyStreak++;
        log('Connected socket but not ready:', lastError, `(streak=${notReadyStreak})`, 'retrying in', RECONNECT_DELAY_MS, 'ms');
        if (notReadyStreak >= ROTATE_AFTER_NOT_READY) {
          // Rotate proxy and rebuild client
          try { await client.disconnect(); } catch {}
          client = null; connectedAt = null; ready = false; readyAt = null;
          proxyIdx++;
          log('Rotating proxy to index', proxyIdx);
        }
        await new Promise(r=> setTimeout(r, RECONNECT_DELAY_MS));
        continue;
      }
      lastError = null;
      return; // stay connected; let status endpoint report health
    } catch (e) {
      lastError = e?.message || String(e);
      log('Connect attempt failed:', lastError, 'retrying in', RECONNECT_DELAY_MS, 'ms');
      if (lastError && String(lastError).includes('account_banned')) {
        log('Account appears banned, holding without further retries.');
        return; // stop retry loop; status will show banned
      }
      await new Promise(r=> setTimeout(r, RECONNECT_DELAY_MS));
    }
  }
}

function summarizeInlineButtons(m) {
  const rm = m.replyMarkup; const buttons = [];
  if (rm && rm.className && String(rm.className).toLowerCase().includes('inline')) {
    const rows = rm.rows || [];
    for (const row of rows) {
      for (const b of (row.buttons || [])) {
        const btn = { type: b.className || 'Button', text: b.text || null };
        if (b.url) btn.url = b.url;
        if (b.data) { try { const buf = Buffer.from(b.data); btn.data_b64 = buf.toString('base64'); } catch {} }
        buttons.push(btn);
      }
    }
  }
  return buttons;
}

async function handleResolve(body) {
  await ensureClient();
  let target = String(body.target || '').trim();
  if (!target) throw new Error('target required');
  // Normalize t.me links and @usernames to a slug
  const slug = target.replace(/^(https?:\/\/)?t\.me\//i, '').replace(/^@/, '');
  const entity = await Promise.race([
    client.getEntity(slug),
    new Promise((_, rej) => setTimeout(() => rej(new Error('getEntity timeout')), CMD_TIMEOUT_MS))
  ]);
  return { ok: true, className: entity?.className || null, id: entity?.id || null, title: entity?.title || null, username: entity?.username || null };
}

async function handleHistory(body) {
  await ensureClient();
  let target = String(body.target || '').trim();
  const limit = Math.min(Math.max(parseInt(body.limit || '25', 10), 1), 300);
  if (!target) throw new Error('target required');
  const slug = target.replace(/^(https?:\/\/)?t\.me\//i, '').replace(/^@/, '');
  const entity = await Promise.race([
    client.getEntity(slug),
    new Promise((_, rej) => setTimeout(() => rej(new Error('getEntity timeout')), CMD_TIMEOUT_MS))
  ]);
  const resp = await Promise.race([
    client.invoke(new Api.messages.GetHistory({ peer: entity, limit, offsetId: 0, minId: 0, addOffset: 0, maxId: 0, hash: BigInt(0) })),
    new Promise((_, rej) => setTimeout(() => rej(new Error('GetHistory timeout')), CMD_TIMEOUT_MS))
  ]);
  const msgs = (resp?.messages || []).map(m => ({ id: m.id, date: m?.date ? new Date(m.date * 1000).toISOString() : null, message: m.message || null, inline_buttons: summarizeInlineButtons(m) }));
  return { ok: true, count: msgs.length, messages: msgs };
}

async function handleStartBot(body) {
  await ensureClient();
  const bot = String(body.bot || '').replace(/^@/, '');
  const param = String(body.param || '').trim();
  if (!bot || !param) throw new Error('bot and param required');
  await client.sendMessage(bot, { message: `/start ${param}` });
  return { ok: true };
}

async function handleJoin(body) {
  await ensureClient();
  const target = String(body.target || '').trim();
  if (!target) throw new Error('target required');
  const res = await joinByUsernameOrInvite(client, target);
  return { ok: true, result: res?.className || 'ok' };
}

async function handleStatus() {
  const cfg = getTelegramConfig();
  return { ok: true, connected: !!(client && client.connected), connectedAt, ready, readyAt, banned, banReason, sessionPath, use_ipv6: cfg.use_ipv6, proxy_pool_size: (cfg.proxy_pool || []).length, proxy_index: proxyIdx, current_proxy: currentProxy, lastError };
}

const handlers = {
  resolve: handleResolve,
  history: handleHistory,
  start_bot: handleStartBot,
  join: handleJoin,
  status: handleStatus,
  dialogs: async (body) => {
    try {
      await ensureClient();
      const limit = Math.min(Math.max(parseInt(body.limit || '50', 10), 1), 200);
      const q = String(body.q || '').trim().toLowerCase();
      const dialogs = await client.getDialogs({ limit });
      const list = [];
      for (const d of dialogs) {
        const e = d?.entity;
        if (!e) continue;
        const item = {
          id: e.id || null,
          className: e.className || null,
          title: e.title || e.firstName || null,
          username: e.username || null,
          isUser: !!e.isUser,
          isBot: !!e.bot,
          isChannel: !!e.isChannel,
          isGroup: !!e.isGroup,
          unreadCount: d.unreadCount || 0,
          lastMessage: d.message?.message || null,
        };
        if (!q || (item.title?.toLowerCase().includes(q) || item.username?.toLowerCase().includes(q))) {
          list.push(item);
        }
      }
      return { ok: true, count: list.length, dialogs: list };
    } catch (e) {
      return { ok: false, error: e?.errorMessage || e?.message || String(e) };
    }
  },
  search: async (body) => {
    try {
      await ensureClient();
      const q = String(body.q || body.query || '').trim();
      const limit = Math.min(Math.max(parseInt(body.limit || '10', 10), 1), 50);
      if (!q) return { ok: false, error: 'query required' };
      const resp = await client.invoke(new Api.contacts.Search({ q, limit }));
      const users = (resp?.users || []).map(u => ({ id: u.id || null, username: u.username || null, firstName: u.firstName || null, bot: !!u.bot }));
      const chats = (resp?.chats || []).map(c => ({ id: c.id || null, title: c.title || null, username: c.username || null, className: c.className || null }));
      return { ok: true, users, chats };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  } ,
  // Diagnose readiness vs. ban vs. proxy issues
  probe: async () => {
    try {
      await ensureClient();
      const start = Date.now();
      const cfg = await Promise.race([
        client.invoke(new Api.help.GetConfig()),
        new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 8000))
      ]);
      return { ok: true, ms: Date.now() - start, dc: cfg?.thisDc || null };
    } catch (e) {
      // RpcError from GramJS exposes errorMessage/errorCode
      return { ok: false, error: e?.errorMessage || e?.message || String(e), code: e?.errorCode || null };
    }
  },
  self: async () => {
    try {
      await ensureClient();
      const start = Date.now();
      const me = await Promise.race([
        client.getMe(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('getMe timeout')), 8000))
      ]);
      return {
        ok: true,
        ms: Date.now() - start,
        id: me?.id || null,
        username: me?.username || null,
        firstName: me?.firstName || null,
        lastName: me?.lastName || null,
        phone: me?.phone || null
      };
    } catch (e) {
      return { ok: false, error: e?.errorMessage || e?.message || String(e), code: e?.errorCode || null };
    }
  }
};

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  if (method === 'GET' && url === '/healthz') { return j(res, 200, { ok: true }); }
  if (method !== 'POST') { return j(res, 405, { ok: false, error: 'POST only' }); }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; if (raw.length > 1e6) { req.destroy(); } });
  req.on('end', async () => {
    try {
      const body = raw ? JSON.parse(raw) : {};
      const cmd = body.cmd || body.action;
      if (!cmd) return j(res, 400, { ok: false, error: 'cmd required' });
      const fn = handlers[cmd];
      if (!fn) return j(res, 404, { ok: false, error: 'unknown cmd' });
      const out = await fn(body.args || body);
      j(res, 200, out);
    } catch (e) {
      lastError = e?.message || String(e);
      j(res, 500, { ok: false, error: lastError });
    }
  });
});

async function boot() {
  server.listen(PORT, '127.0.0.1', () => {
    log('Listening on http://127.0.0.1:' + PORT);
  });
  // Start connection in background (non-blocking for server availability)
  connectLoop();
}

process.on('SIGINT', async () => {
  log('Shutting down...');
  try { server.close(); } catch {}
  try { if (client) await client.disconnect(); } catch {}
  process.exit(0);
});

boot();
