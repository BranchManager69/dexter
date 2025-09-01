#!/usr/bin/env node

// token-ai/socials/telegram/auto-join-safeguard.js
// Polls the Safeguard bot DM for a t.me invite and auto-joins when available.

import dotenv from 'dotenv';
dotenv.config({ override: true });

import http from 'http';

const PORT = parseInt(process.env.TELEGRAM_DAEMON_PORT || '41235', 10);

function usage() {
  console.log('Usage: node token-ai/socials/telegram/auto-join-safeguard.js [--timeoutMs=120000] [--pollMs=3000]');
  console.log('Polls @safeguard for an invite link and joins automatically.');
}

function parseArgs(argv) {
  const kv = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { kv.help = '1'; continue; }
    if (a.startsWith('--')) { const [k,v] = a.split('='); kv[k.replace(/^--/,'')] = v ?? '1'; }
  }
  return kv;
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

function findJoinTarget(messages = []) {
  const rxInvite = /https?:\/\/t\.me\/(?:\+|joinchat\/)\S+/i;
  const rxAnyTme = /https?:\/\/t\.me\/[A-Za-z0-9_+\-/?#=]+/i;
  for (const m of messages) {
    // Prefer explicit invite links
    if (m?.message && rxInvite.test(m.message)) return m.message.match(rxInvite)[0];
    const btns = Array.isArray(m?.inline_buttons) ? m.inline_buttons : [];
    for (const b of btns) {
      if (b?.url && rxInvite.test(b.url)) return b.url;
    }
  }
  // Fall back to any t.me link (public channel/group)
  for (const m of messages) {
    if (m?.message && rxAnyTme.test(m.message)) return m.message.match(rxAnyTme)[0];
    const btns = Array.isArray(m?.inline_buttons) ? m.inline_buttons : [];
    for (const b of btns) {
      if (b?.url && rxAnyTme.test(b.url)) return b.url;
    }
  }
  return null;
}

async function main() {
  const kv = parseArgs(process.argv);
  if (kv.help) return usage();
  const timeoutMs = parseInt(kv.timeoutMs || '180000', 10); // 3 minutes default
  const pollMs = parseInt(kv.pollMs || '3000', 10);

  const start = Date.now();
  console.log('[auto-join] Watching @safeguard for invite link...');

  while (Date.now() - start < timeoutMs) {
    const hist = await post('history', { target: '@safeguard', limit: 25 });
    if (hist?.ok) {
      // Print what we see to aid debugging and avoid assumptions
      console.log('[auto-join] Latest @safeguard messages:', JSON.stringify(hist.messages || [], null, 2));
      const target = findJoinTarget(hist.messages || []);
      if (target) {
        console.log('[auto-join] Found join target:', target);
        const j = await post('join', { target });
        if (!j?.ok) { console.error('[auto-join] Join failed:', j?.error || j); process.exitCode = 2; return; }
        console.log('[auto-join] Joined. Result:', j?.result || 'ok');
        const portal = process.env.TELEGRAM_PORTAL_SLUG || 't.me/devdegenduel';
        const h2 = await post('history', { target: portal, limit: 10 });
        if (h2?.ok) console.log('[auto-join] Portal history fetched:', h2.count, 'messages');
        return;
      }
      // If we see a verification success message, try to fetch portal or main chat anyway
      const verified = (hist.messages || []).some(m => /verified|verification complete|access granted/i.test(m?.message || ''));
      if (verified) {
        console.log('[auto-join] Verified message detected, checking portal history.');
        const portal = process.env.TELEGRAM_PORTAL_SLUG || 't.me/devdegenduel';
        const h2 = await post('history', { target: portal, limit: 10 });
        if (h2?.ok) { console.log('[auto-join] Portal history fetched:', h2.count, 'messages'); return; }
      }
    } else {
      console.log('[auto-join] history error:', hist?.error || 'unknown');
    }
    await new Promise(r => setTimeout(r, pollMs));
  }

  console.log('[auto-join] Timed out waiting for invite. No link detected.');
  process.exitCode = 1;
}

main().catch((e) => { console.error('[auto-join] error:', e?.message || e); process.exit(1); });
