#!/usr/bin/env node
// Cleanup non-minted analysis reports: dry-run by default. Use --apply to move files and delete DB rows.
// - Moves files without a valid mint to reports/ai-token-analyses/_archived-nomint/
// - Deletes matching DB rows in ai_token_analyses (by file_path or invalid token_address) when --apply is set

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Locate repo paths
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPORTS_DIR = path.join(ROOT, 'reports', 'ai-token-analyses');
const ARCHIVE_DIR = path.join(REPORTS_DIR, '_archived-nomint');

// Flags
const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const VERBOSE = ARGS.includes('--verbose') || ARGS.includes('-v');

function isValidMint(m){
  try {
    const s = String(m || '').trim();
    if (!s) return false;
    if (s.startsWith('--')) return false;
    return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(s);
  } catch { return false; }
}

function extractMintFromReport(j, filename){
  try {
    let m = j?.tokenAddress || j?.mint || j?.metadata?.tokenAddress || j?.metadata?.token_address || j?.metadata?.token?.address || j?.token?.address || '';
    if (typeof m === 'string') m = m.trim(); else m = '';
    if (m.startsWith('--mint=')) m = m.slice(7);
    if (m && !m.startsWith('--')) return m;
    const name = String(filename || '');
    const mintEq = name.match(/mint=([A-Za-z0-9_-]+)/);
    if (mintEq && mintEq[1]) return mintEq[1];
    const base58Matches = name.match(/[1-9A-HJ-NP-Za-km-z]{32,64}/g);
    if (base58Matches && base58Matches.length) return base58Matches.sort((a,b)=> b.length - a.length)[0];
  } catch {}
  return null;
}

async function scanFiles(){
  const all = [];
  const nomint = [];
  const errors = [];
  try {
    const files = (fs.readdirSync(REPORTS_DIR) || []).filter(f=>f.endsWith('.json'));
    for (const name of files){
      const abs = path.join(REPORTS_DIR, name);
      try {
        const txt = fs.readFileSync(abs, 'utf8');
        const j = JSON.parse(txt);
        const mint = extractMintFromReport(j, name);
        const ok = isValidMint(mint);
        const rec = { file: name, abs, mint: mint || null, valid: ok };
        all.push(rec);
        if (!ok) nomint.push(rec);
      } catch (e) {
        errors.push({ file: name, error: e?.message || String(e) });
      }
    }
  } catch (e) {
    console.error('Failed to read reports:', e?.message || e);
  }
  return { all, nomint, errors };
}

async function findDbMatches(nomint){
  try {
    const prisma = (await import(path.join(ROOT, '..', 'config', 'prisma.js'))).default;
    const out = [];
    for (const it of nomint){
      try {
        // Match by exact file_path or suffix match; also include rows where token_address is invalid
        const rows = await prisma.ai_token_analyses.findMany({
          where: {
            OR: [
              { file_path: it.abs },
              { file_path: { endsWith: path.join('token-ai','reports','ai-token-analyses', it.file) } },
              { token_address: { not: null } }
            ]
          },
          select: { id: true, token_address: true, file_path: true, created_at: true }
        });
        // Filter to actual invalid-addr rows or matching file_path rows
        const matches = rows.filter(r => r.file_path === it.abs || (r.file_path||'').endsWith(it.file) || !isValidMint(r.token_address));
        if (matches.length) out.push({ file: it.file, abs: it.abs, db: matches });
      } catch {}
    }
    return out;
  } catch (e) {
    if (VERBOSE) console.warn('DB unavailable or prisma import failed:', e?.message || e);
    return [];
  }
}

async function applyChanges(nomint, dbMatches){
  // Ensure archive dir
  try { await fsp.mkdir(ARCHIVE_DIR, { recursive: true }); } catch {}
  // Move files
  for (const it of nomint){
    const src = it.abs;
    const dst = path.join(ARCHIVE_DIR, it.file);
    try {
      await fsp.rename(src, dst);
      if (VERBOSE) console.log('moved:', it.file, '->', dst);
    } catch (e) {
      console.warn('move failed:', it.file, e?.message || e);
    }
  }
  // Delete DB rows
  try {
    const prisma = (await import(path.join(ROOT, '..', 'config', 'prisma.js'))).default;
    const ids = dbMatches.flatMap(m => m.db.map(r => r.id));
    if (ids.length){
      // Use deleteMany by IDs; fall back to individual deletes
      try {
        await prisma.ai_token_analyses.deleteMany({ where: { id: { in: ids } } });
        console.log('DB deleteMany ok:', ids.length);
      } catch {
        for (const id of ids){
          try { await prisma.ai_token_analyses.delete({ where: { id } }); } catch {}
        }
        console.log('DB deletes done:', ids.length);
      }
    }
  } catch (e) {
    console.warn('DB deletion failed:', e?.message || e);
  }
}

async function main(){
  console.log(`[cleanup] scanning ${REPORTS_DIR}`);
  const { all, nomint, errors } = await scanFiles();
  console.log(`[cleanup] total JSON: ${all.length}, without valid mint: ${nomint.length}, parse errors: ${errors.length}`);
  if (nomint.length){
    console.log('[cleanup] candidates (first 20):');
    for (const it of nomint.slice(0,20)) console.log(`  - ${it.file} mint=${it.mint||'null'}`);
  }
  if (errors.length){
    console.log('[cleanup] parse errors (first 10):');
    for (const e of errors.slice(0,10)) console.log(`  - ${e.file}: ${e.error}`);
  }
  const dbMatches = await findDbMatches(nomint);
  const totalDbRows = dbMatches.reduce((a,m)=>a + m.db.length, 0);
  console.log(`[cleanup] DB matches to delete: ${totalDbRows} rows across ${dbMatches.length} files`);
  if (!APPLY){
    console.log('[cleanup] dry-run complete. Re-run with --apply to archive files and delete DB rows.');
    return;
  }
  console.log('[cleanup] applying changes…');
  await applyChanges(nomint, dbMatches);
  console.log('[cleanup] done. Archived files at:', ARCHIVE_DIR);
}

main().catch(e=>{ console.error('cleanup error:', e?.message || e); process.exit(1); });

