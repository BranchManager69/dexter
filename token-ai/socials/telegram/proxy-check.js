#!/usr/bin/env node

// token-ai/socials/telegram/proxy-check.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import chalk from 'chalk';
import { SocksClient } from 'socks';

function parsePool() {
  const envPool = (process.env.TELEGRAM_PROXY_URLS || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  const single = process.env.TELEGRAM_PROXY_URL || '';
  const out = [...envPool];
  if (single && !out.includes(single)) out.push(single);
  return out;
}

function parseProxy(u) {
  try {
    const uu = new URL(String(u));
    return {
      host: uu.hostname,
      port: Number(uu.port || 1080),
      type: /socks4/i.test(uu.protocol) ? 4 : 5,
      userId: uu.username || undefined,
      password: uu.password || undefined,
    };
  } catch { return null; }
}

function mask(u) { try { const x = new URL(String(u)); x.username='***'; x.password='***'; return x.toString(); } catch { return u; } }

async function probeOnce(proxy, dstHost, dstPort, timeoutMs=4000) {
  return new Promise((resolve) => {
    let done=false; const onDone = (ok, err) => { if (done) return; done=true; resolve({ ok, err }); };
    const opts = {
      proxy: { host: proxy.host, port: proxy.port, type: proxy.type, userId: proxy.userId, password: proxy.password },
      command: 'connect', timeout: timeoutMs,
      destination: { host: dstHost, port: dstPort }
    };
    SocksClient.createConnection(opts)
      .then(({ socket }) => { try { socket.destroy(); } catch {}; onDone(true); })
      .catch((e) => onDone(false, e?.message || String(e)));
  });
}

async function main() {
  const pool = parsePool();
  if (pool.length === 0) {
    console.error('No proxies set. Configure TELEGRAM_PROXY_URLS or TELEGRAM_PROXY_URL.');
    process.exit(1);
  }
  const DC4_V4 = '149.154.167.91';
  const DC4_V6 = '2001:067c:04e8:f004:0000:0000:0000:000a';
  const useV6 = process.env.TELEGRAM_USE_IPV6 === '1' || process.env.TELEGRAM_USE_IPV6 === 'true';
  console.log(chalk.cyan(`[ProxyCheck] Testing ${pool.length} proxies → DC4 ${useV6?'IPv6':'IPv4'}:443`));
  for (let i=0;i<pool.length;i++) {
    const url = pool[i];
    const p = parseProxy(url);
    if (!p) { console.log(`[#${i}] ${mask(url)} -> invalid url`); continue; }
    const dst = useV6 ? DC4_V6 : DC4_V4;
    const r = await probeOnce(p, dst, 443, 5000);
    if (r.ok) console.log(chalk.green(`[#${i}] ${mask(url)} -> OK`));
    else console.log(chalk.red(`[#${i}] ${mask(url)} -> FAIL: ${r.err}`));
  }
}

main().catch(e=>{ console.error('[proxy-check fatal]', e?.stack||e); process.exit(1); });

