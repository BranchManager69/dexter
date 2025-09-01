#!/usr/bin/env node

// token-ai/socials/telegram/session-client.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import http from 'http';

const PORT = parseInt(process.env.TELEGRAM_DAEMON_PORT || '41235', 10);

function usage() {
  console.log('Usage: npm run telegram:ctl -- <cmd> [args]');
  console.log('  cmds: status');
  console.log('        resolve <@slug|t.me/...>');
  console.log('        history <@slug|t.me/...> [--limit=25]');
  console.log('        join <@slug|t.me/+invite|invite>');
  console.log('        start-bot <@bot> --param=XXXX');
  console.log('        probe');
  console.log('        self');
  console.log('        search <query> [--limit=10]');
  console.log('        dialogs [--limit=50] [--q=filter]');
}

function parseArgs(argv) {
  const out = { kv: {}, rest: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const [k,v] = a.split('='); out.kv[k.replace(/^--/,'')] = v ?? '1'; }
    else out.rest.push(a);
  }
  return out;
}

function post(cmd, args) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ cmd, args });
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let raw = '';
      res.on('data', (d) => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({ ok: false, error: 'invalid JSON', raw }); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function main() {
  const { kv, rest } = parseArgs(process.argv);
  if (rest.length === 0) { usage(); process.exit(1); }
  const cmd = rest[0];
  if (cmd === 'status') { console.log(JSON.stringify(await post('status', {}), null, 2)); return; }
  if (cmd === 'resolve') { const target = rest[1]; if (!target) return usage(); console.log(JSON.stringify(await post('resolve', { target }), null, 2)); return; }
  if (cmd === 'history') { const target = rest[1]; if (!target) return usage(); const limit = parseInt(kv.limit || '25', 10); console.log(JSON.stringify(await post('history', { target, limit }), null, 2)); return; }
  if (cmd === 'join') { const target = rest[1]; if (!target) return usage(); console.log(JSON.stringify(await post('join', { target }), null, 2)); return; }
  if (cmd === 'start-bot') { const bot = rest[1]; const param = kv.param || kv.p || ''; if (!bot || !param) return usage(); console.log(JSON.stringify(await post('start_bot', { bot, param }), null, 2)); return; }
  if (cmd === 'search') { const q = rest.slice(1).join(' '); const limit = parseInt(kv.limit||'10',10); console.log(JSON.stringify(await post('search', { q, limit }), null, 2)); return; }
  if (cmd === 'probe') { console.log(JSON.stringify(await post('probe', {}), null, 2)); return; }
  if (cmd === 'self') { console.log(JSON.stringify(await post('self', {}), null, 2)); return; }
  if (cmd === 'dialogs') { const limit = parseInt(kv.limit||'50',10); const q = kv.q||''; console.log(JSON.stringify(await post('dialogs', { limit, q }), null, 2)); return; }
  usage();
}

main().catch((e) => { console.error('[ctl error]', e?.message || e); process.exit(1); });
