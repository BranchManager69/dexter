#!/usr/bin/env node

// token-ai/socials/preflight.js

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ override: true });

import { ensureReportsDir, REPORTS_DIR, TWITTER_SESSION_PATH } from './common.js';
import { getTelegramConfig, getTwitterConfig, getConfigPaths } from './config.js';

function mask(val, { keep = 2 } = {}) {
  if (!val) return 'MISSING';
  const s = String(val);
  if (s.length <= keep * 2) return '*'.repeat(s.length);
  return `${s.slice(0, keep)}${'*'.repeat(Math.max(0, s.length - keep * 2))}${s.slice(-keep)}`;
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

async function main() {
  const { configPath } = getConfigPaths();
  const tcfg = getTelegramConfig();
  const xcfg = getTwitterConfig();

  // Ensure reports dir
  ensureReportsDir();

  console.log('\n[Preflight] Token AI Socials configuration check');
  console.log('------------------------------------------------');
  console.log('Config file:', exists(configPath) ? `${configPath} (present)` : `${configPath} (not found, using .env if set)`);

  console.log('\nTelegram (MTProto user)');
  console.log('  api_id          :', tcfg.api_id ? 'SET' : 'MISSING');
  console.log('  api_hash        :', tcfg.api_hash ? `SET (${mask(tcfg.api_hash)})` : 'MISSING');
  console.log('  phone           :', tcfg.phone ? mask(tcfg.phone, { keep: 3 }) : 'MISSING');
  console.log('  password (2FA)  :', tcfg.password ? 'SET' : 'not set');
  console.log('  session_path    :', tcfg.session_path || '(default)');
  console.log('  session_exists  :', tcfg.session_path ? (exists(tcfg.session_path) ? 'YES' : 'NO') : 'NO');
  const cf = tcfg.client || {};
  console.log('  client_fingerprint: device=%s, system=%s, app=%s', cf.device_model||'(default)', cf.system_version||'(default)', cf.app_version||'(default)');
  const px = tcfg.proxy || {};
  const pxSet = !!(px.url || (px.host && px.port));
  const pool = tcfg.proxy_pool || [];
  if (pool.length > 0) {
    console.log('  proxy           : pool size =', pool.length, 'primary =', String(pool[0]).replace(/:\/\/.+@/,'://***:***@'));
  } else {
    console.log('  proxy           :', pxSet ? (px.url ? px.url.replace(/:\/\/.+@/,'://***:***@') : `${px.host}:${px.port}`) : 'not set');
  }
  console.log('  use_ipv6        :', tcfg.use_ipv6 ? 'YES' : 'NO');

  console.log('\nX/Twitter');
  console.log('  session_path    :', xcfg.session_path);
  console.log('  session_exists  :', exists(xcfg.session_path) ? 'YES' : 'NO');

  console.log('\nReports');
  console.log('  reports_dir     :', REPORTS_DIR);
  console.log('  dir_exists      :', exists(REPORTS_DIR) ? 'YES' : 'NO');

  console.log('\nNotes:');
  console.log('  - Configure values in token-ai/socials/config.json (overrides) or .env (fallback).');
  console.log('  - Telegram user-bot requires api_id/api_hash/phone to login; session will be saved to session_path.');
  console.log('  - X/Twitter scraping requires a valid session JSON at the configured session_path.');
  console.log('  - Optional: set a SOCKS proxy for MTProto via telegram.proxy.url (e.g., socks5://user:pass@host:port).');
  console.log('\nDone.');
}

main().catch((e) => { console.error('[Preflight Error]', e?.message || e); process.exit(1); });
