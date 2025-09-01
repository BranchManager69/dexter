#!/usr/bin/env node

// token-ai/socials/telegram/connect-test.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import chalk from 'chalk';
import { getTelegramClient, connectClient } from './gramjs-client.js';
import { getTelegramConfig } from '../config.js';
import { Api } from 'telegram/tl/index.js';

async function main(){
  const tcfg = getTelegramConfig();
  const { api_id: apiId, api_hash: apiHash, session_path: sessionPath, client } = tcfg;
  if(!apiId || !apiHash){
    console.error('Missing TELEGRAM_API_ID/TELEGRAM_API_HASH');
    process.exit(1);
  }
  console.log('\n[Telegram Connect Test]');
  console.log('  device  :', client?.device_model || '(default)');
  console.log('  system  :', client?.system_version || '(default)');
  console.log('  app     :', client?.app_version || '(default)');

  // Build proxy list: pool first, then single proxy
  const pool = (tcfg.proxy_pool || []).slice();
  if (tcfg.proxy?.url) pool.push(tcfg.proxy.url);
  if (tcfg.proxy?.host && tcfg.proxy?.port) {
    const auth = (tcfg.proxy.username && tcfg.proxy.password) ? `${tcfg.proxy.username}:${tcfg.proxy.password}@` : '';
    const url = `socks${tcfg.proxy.type && String(tcfg.proxy.type).includes('4')?'4':'5'}://${auth}${tcfg.proxy.host}:${tcfg.proxy.port}`;
    pool.push(url);
  }
  const seen = new Set();
  const uniq = pool.filter(u=>{ if(!u) return false; const k=String(u); if(seen.has(k)) return false; seen.add(k); return true; });
  if (uniq.length === 0) uniq.push(null); // null => no proxy

  let lastErr = null; let ok = false; let used = null; let dc = null;
  const DC4_IPV4 = '149.154.167.91';
  const DC4_IPV6 = '2001:067c:04e8:f004:0000:0000:0000:000a';
  for (const u of uniq) {
    const shown = u ? u.replace(/:\/\/.+@/,'://***:***@') : 'direct (no proxy)';
    console.log('  trying   :', shown);
    try {
      const proxyOverride = u ? (function(){
        // parse URL and construct gramJS proxy object
        try {
          const uu = new URL(u);
          const ip = uu.hostname.replace(/^\[|\]$/g,'');
          const port = Number(uu.port);
          const socksType = /socks4/i.test(uu.protocol) ? 4 : 5;
          const po = { ip, port, socksType };
          if (uu.username) po.username = uu.username;
          if (uu.password) po.password = uu.password;
          return po;
        } catch { return null; }
      })() : null;
      const { client: c } = await getTelegramClient({ apiId, apiHash, sessionPath, proxyOverride });
      // Try IPv4 DC first, then IPv6 (or reverse if use_ipv6=true). Each: try 443 then 80.
      const dcOrder = tcfg.use_ipv6 ? [DC4_IPV6, DC4_IPV4] : [DC4_IPV4, DC4_IPV6];
      const initPorts = [443]; // pin to 443 for production stability
      let connected = false; let lastE = null;
      for (const ip of dcOrder) {
        for (const p of initPorts) {
          try {
            if (c?.session?.setDC) { c.session.setDC(4, ip, p); }
            await connectClient(c);
            connected = true; break;
          } catch (ee) { lastE = ee; }
        }
        if (connected) break;
      }
      if (!connected) throw lastE || new Error('connect failed');
      // Confirm by making a simple unauthenticated API call
      const cfg = await c.invoke(new Api.help.GetConfig());
      dc = cfg.thisDc || null;
      ok = true; used = shown;
      try { await c.disconnect(); } catch {}
      break;
    } catch (e) {
      lastErr = e;
      console.log(chalk.red('  failed  :'), e?.message || e);
    }
  }

  if (ok) {
    console.log(chalk.green('Connected to Telegram MTProto successfully via:'), used, dc?`(dc=${dc})`:'' );
    process.exit(0);
  } else {
    console.error(chalk.red('All proxy attempts failed'), lastErr?.message || lastErr || 'unknown error');
    process.exit(2);
  }
}

main();
