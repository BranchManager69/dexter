#!/usr/bin/env node
// Pre-stamp public HTML files with a cache-busting version for static delivery.
// Replaces any '?v=@ASSET@' or existing '?v=<token>' with '?v=<ASSET_VER>'.

import fs from 'node:fs';
import path from 'node:path';

function computeAssetVersion() {
  try {
    if (process.env.TOKEN_AI_ASSET_VERSION) return String(process.env.TOKEN_AI_ASSET_VERSION);
  } catch {}
  // Try git short SHA from repo root
  try {
    const repoRoot = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
    const headPath = path.join(repoRoot, '.git', 'HEAD');
    const head = fs.readFileSync(headPath, 'utf8').trim();
    let ref = null;
    const m = head.match(/^ref:\s*(.*)$/);
    if (m) ref = path.join(repoRoot, '.git', m[1]);
    const sha = (ref && fs.existsSync(ref)) ? fs.readFileSync(ref, 'utf8').trim() : head;
    if (sha && sha.length >= 7) return sha.slice(0, 12);
  } catch {}
  return 'r' + Math.floor(Date.now() / 1000);
}

const ASSET = computeAssetVersion();
const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PUBLIC_DIR = path.resolve(HERE, '..', '..', 'public');

const FILES = ['agent-live.html', 'agent-dashboard.html'];

function stampFile(file) {
  const abs = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(abs)) return false;
  let src = fs.readFileSync(abs, 'utf8');
  // Replace either placeholder or previous tokens
  src = src.replace(/(\?v=)(@ASSET@|[A-Za-z0-9._-]+)/g, `$1${ASSET}`);
  // Also replace any lingering @ASSET@ occurrences
  src = src.replace(/@ASSET@/g, ASSET);
  fs.writeFileSync(abs, src, 'utf8');
  return true;
}

let changed = 0;
for (const f of FILES) { if (stampFile(f)) changed++; }
console.log(`[stamp-assets] version=${ASSET} files=${changed}`);

