// token-ai/socials/config.js

import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'token-ai', 'socials', 'config.json');
const CURRENT_ACCOUNT_PATH = path.join(process.cwd(), 'token-ai', 'socials', 'telegram', 'current.json');

function readJsonIfExists(p) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  return null;
}

function valOrUndef(v) {
  if (v === undefined || v === null) return undefined;
  const s = String(v);
  return s.trim() === '' ? undefined : v;
}

export function getTelegramConfig() {
  const cfg = readJsonIfExists(CONFIG_PATH) || {};
  const t = cfg.telegram || {};
  const current = readJsonIfExists(CURRENT_ACCOUNT_PATH) || {};
  // Precedence: config.json overrides env; env is fallback
  const conf = {
    api_id: valOrUndef(t.api_id) ?? valOrUndef(process.env.TELEGRAM_API_ID) ?? undefined,
    api_hash: valOrUndef(t.api_hash) ?? valOrUndef(process.env.TELEGRAM_API_HASH) ?? undefined,
    // phone/session_path: allow current.json to override for quick switching
    phone: valOrUndef(current.phone) ?? valOrUndef(t.phone) ?? valOrUndef(process.env.TELEGRAM_PHONE) ?? undefined,
    password: valOrUndef(t.password) ?? valOrUndef(process.env.TELEGRAM_PASSWORD) ?? undefined,
    session_path: valOrUndef(current.session_path) ?? valOrUndef(t.session_path) ?? valOrUndef(process.env.TELEGRAM_SESSION_PATH) ?? undefined,
    use_ipv6: (t.use_ipv6 ?? (process.env.TELEGRAM_USE_IPV6 === '1' || process.env.TELEGRAM_USE_IPV6 === 'true')) || false,
    client: {
      device_model: valOrUndef(t.client?.device_model) ?? valOrUndef(process.env.TELEGRAM_DEVICE_MODEL) ?? undefined,
      system_version: valOrUndef(t.client?.system_version) ?? valOrUndef(process.env.TELEGRAM_SYSTEM_VERSION) ?? undefined,
      app_version: valOrUndef(t.client?.app_version) ?? valOrUndef(process.env.TELEGRAM_APP_VERSION) ?? undefined,
    },
    proxy: {
      url: valOrUndef(t.proxy?.url) ?? valOrUndef(process.env.TELEGRAM_PROXY_URL) ?? undefined,
      host: valOrUndef(t.proxy?.host) ?? valOrUndef(process.env.TELEGRAM_PROXY_HOST) ?? undefined,
      port: valOrUndef(t.proxy?.port) ?? valOrUndef(process.env.TELEGRAM_PROXY_PORT) ?? undefined,
      username: valOrUndef(t.proxy?.username) ?? valOrUndef(process.env.TELEGRAM_PROXY_USERNAME) ?? undefined,
      password: valOrUndef(t.proxy?.password) ?? valOrUndef(process.env.TELEGRAM_PROXY_PASSWORD) ?? undefined,
      type: valOrUndef(t.proxy?.type) ?? valOrUndef(process.env.TELEGRAM_PROXY_TYPE) ?? undefined, // socks4|socks5
    }
  };

  // Proxy pool support: config.telegram.proxy_pool (array of urls) or env TELEGRAM_PROXY_URLS (comma/space/newline separated)
  let pool = [];
  try {
    const fromCfg = Array.isArray(t.proxy_pool) ? t.proxy_pool.filter(Boolean) : [];
    const fromEnv = (process.env.TELEGRAM_PROXY_URLS || '')
      .split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    pool = [...fromCfg, ...fromEnv];
  } catch {}
  conf.proxy_pool = pool;
  return conf;
}

export function getConfigPaths() {
  return { configPath: CONFIG_PATH };
}

export function getTwitterConfig() {
  const cfg = readJsonIfExists(CONFIG_PATH) || {};
  const t = cfg.twitter || {};
  return {
    session_path: valOrUndef(t.session_path) ?? valOrUndef(process.env.TWITTER_SESSION_PATH) ?? path.join(process.cwd(), 'token-ai', 'socials', 'twitter', 'session.json'),
  };
}
