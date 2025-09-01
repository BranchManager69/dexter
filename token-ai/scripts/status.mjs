#!/usr/bin/env node
// Lightweight PM2 + server status for token-ai
// ESM script; safe to run even without PM2 or server running

import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(_exec);

function msToMinutes(ms) {
  if (!ms || Number.isNaN(ms)) return null;
  const m = Math.floor(ms / 60000);
  return m;
}

async function getPm2Summary() {
  try {
    const { stdout } = await exec('pm2 jlist');
    const list = JSON.parse(stdout);
    const names = new Set(['ai-ui', 'tg-daemon', 'token-ai-mcp-http', 'token-ai-mcp-stdio']);
    const items = list
      .filter(p => names.has(p.name))
      .map(p => ({
        name: p.name,
        pm_id: p.pm_id,
        status: p.pm2_env?.status,
        restarts: p.pm2_env?.restart_time,
        cpu: p.monit?.cpu,
        memoryMB: p.monit?.memory ? Math.round(p.monit.memory / (1024 * 1024)) : null,
        uptimeMinutes: p.pm2_env?.pm_uptime ? msToMinutes(Date.now() - p.pm2_env.pm_uptime) : null
      }));
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

async function tryFetch(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      return { ok: true, status: res.status, data };
    }
    const text = await res.text();
    return { ok: true, status: res.status, text: text.slice(0, 400) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

async function main() {
  const port = process.env.TOKEN_AI_UI_PORT ? Number(process.env.TOKEN_AI_UI_PORT) : 3013;
  const base = `http://127.0.0.1:${port}`;

  const [pm2, runs, recent, latest] = await Promise.all([
    getPm2Summary(),
    tryFetch(`${base}/runs`),
    tryFetch(`${base}/recent-analyses?limit=5`),
    tryFetch(`${base}/latest-analysis`)
  ]);

  const summary = {
    timestamp: new Date().toISOString(),
    pm2,
    server: {
      port,
      runs: runs?.ok ? runs.data : runs,
      recentAnalyses: recent?.ok ? recent.data : recent,
      latestAnalysis: latest?.ok ? latest.data : latest
    }
  };

  // Pretty print concise view
  const lines = [];
  lines.push(`PM2 detected: ${pm2.ok ? 'yes' : 'no'}`);
  if (pm2.ok && pm2.items.length) {
    for (const p of pm2.items) {
      lines.push(` - ${p.name} [${p.status}] restarts=${p.restarts} cpu=${p.cpu}% mem=${p.memoryMB}MB uptime≈${p.uptimeMinutes}m (pm_id=${p.pm_id})`);
    }
  } else if (!pm2.ok) {
    lines.push(` - pm2 jlist error: ${pm2.error}`);
  }

  const serverUp = runs?.ok || recent?.ok || latest?.ok;
  lines.push(`Server on ${base}: ${serverUp ? 'reachable' : 'unreachable'}`);
  if (serverUp) {
    const runCount = runs?.ok && runs.data?.active ? runs.data.active.length : undefined;
    const latestFile = latest?.ok && latest.data?.file ? latest.data.file : undefined;
    lines.push(` - active runs: ${runCount ?? 'n/a'}`);
    lines.push(` - latest analysis: ${latestFile ?? 'n/a'}`);
  } else {
    lines.push(` - Try: pm2 reload ai-ui (or check TOKEN_AI_UI_PORT)`);
  }

  console.log(lines.join('\n'));
  // Emit machine-readable JSON at the end (useful for scripts)
  console.log('\nJSON_SUMMARY_BEGIN');
  console.log(JSON.stringify(summary, null, 2));
  console.log('JSON_SUMMARY_END');
}

main().catch(err => {
  console.error('status.mjs fatal error:', err);
  process.exit(1);
});

