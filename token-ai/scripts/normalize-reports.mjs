#!/usr/bin/env node
// Normalize historical analysis JSONs to a canonical schema.
// Dry-run by default. Use --apply to write changes.
// Canonicalizations:
// - Ensure metadata.market exists with { fdv, liquidity, volume24h }
// - If top-level market exists, merge into metadata.market
// - Rename market.volume_24h -> market.volume24h
// - Set metadata.schema_version = 1 (non-breaking)

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPORTS_DIR = path.join(ROOT, 'reports', 'ai-token-analyses');

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const VERBOSE = ARGS.includes('--verbose') || ARGS.includes('-v');

function readJson(abs){
  const txt = fs.readFileSync(abs, 'utf8');
  return JSON.parse(txt);
}

function normalizeOne(j){
  let changed = false;
  j.metadata = j.metadata || {};
  const top = j.market || {};
  const meta = j.metadata.market || {};
  // Compute market values
  const src = { ...top, ...meta };
  let fdv = (typeof src.fdv === 'number') ? src.fdv : null;
  let liquidity = (typeof src.liquidity === 'number') ? src.liquidity : null;
  let volume24h = (typeof src.volume24h === 'number') ? src.volume24h : (typeof src.volume_24h === 'number' ? src.volume_24h : null);
  const before = JSON.stringify(j.metadata.market || {});
  j.metadata.market = { fdv, liquidity, volume24h };
  if (JSON.stringify(j.metadata.market) !== before) changed = true;
  // Remove top-level market if it existed and differs
  if (j.market) {
    delete j.market; changed = true;
  }
  // schema version
  if (j.metadata.schema_version !== 1) { j.metadata.schema_version = 1; changed = true; }
  return { j, changed };
}

async function main(){
  const files = (fs.readdirSync(REPORTS_DIR) || []).filter(f => f.endsWith('.json'));
  let scanned = 0, changed = 0;
  const samples = [];
  for (const name of files){
    const abs = path.join(REPORTS_DIR, name);
    try {
      const orig = readJson(abs);
      const snapshotBefore = { market: orig.metadata?.market || orig.market || null };
      const { j, changed: did } = normalizeOne(orig);
      scanned++;
      if (did) {
        changed++;
        const snapshotAfter = { market: j.metadata?.market || null };
        samples.push({ file: name, before: snapshotBefore, after: snapshotAfter });
        if (APPLY) {
          const tmp = abs + '.tmp';
          await fsp.writeFile(tmp, JSON.stringify(j, null, 2));
          await fsp.rename(tmp, abs);
          if (VERBOSE) console.log('normalized:', name);
        }
      }
    } catch (e) {
      if (VERBOSE) console.warn('skip:', name, e?.message || e);
    }
  }
  console.log(`[normalize] scanned=${scanned} changed=${changed}`);
  if (samples.length) {
    console.log('[normalize] examples (up to 5):');
    for (const s of samples.slice(0,5)){
      console.log(`  - ${s.file}`);
      console.log(`    before: ${JSON.stringify(s.before)}`);
      console.log(`    after : ${JSON.stringify(s.after)}`);
    }
  }
  if (!APPLY) console.log('[normalize] dry-run complete. Re-run with --apply to write changes.');
}

main().catch(e=>{ console.error('normalize error:', e?.message || e); process.exit(1); });

