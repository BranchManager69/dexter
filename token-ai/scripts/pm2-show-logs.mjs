#!/usr/bin/env node
// Non-blocking PM2 logs fetcher. Prints last N lines and exits.
import { execSync, spawnSync } from 'child_process';

function usage(){
  console.log('Usage: node scripts/pm2-show-logs.mjs <pm2_name> [lines=200] [kind=both|out|err]');
}

const name = process.argv[2] || process.env.PM2_APP || 'ai-ui';
const lines = Number(process.argv[3] || process.env.LINES || 200);
const kind = (process.argv[4] || process.env.KIND || 'both').toLowerCase();

if (!name) { usage(); process.exit(1); }

let jlist;
try {
  jlist = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8' }));
} catch (e) {
  console.error('Failed to run `pm2 jlist`:', e.message);
  process.exit(2);
}

const proc = jlist.find(p => p.name === name);
if (!proc) {
  console.error('PM2 app not found:', name);
  process.exit(3);
}

const out = proc.pm2_env?.pm_out_log_path;
const err = proc.pm2_env?.pm_err_log_path;
if (!out && !err) {
  console.error('No log paths recorded for app:', name);
  process.exit(4);
}

function printTail(file, label){
  if (!file) return;
  const r = spawnSync('tail', ['-n', String(lines), file], { encoding: 'utf8' });
  if (r.error) { console.error(`[${label}] tail error:`, r.error.message); return; }
  console.log(`===== ${label} (${file}) last ${lines} lines =====`);
  process.stdout.write(r.stdout || '');
}

if (kind === 'both' || kind === 'out') printTail(out, `${name}:out`);
if (kind === 'both' || kind === 'err') printTail(err, `${name}:err`);

