// token-ai/socials/tools/persist.js

import fs from 'fs';
import path from 'path';
import prisma from '../../../config/prisma.js';
import { persistTwitterData } from '../twitter/persist.js';
import { REPORTS_DIR, getTimestamp, parseMetricCount, normalizeJoinDate } from '../common.js';

// Consolidated snapshot writer (idempotent-ish): delegates to per-platform persistence and writes a JSON artifact
export async function persist_socials_snapshot(token, snapshot) {
  const res = { twitter: null, website: null, telegram: null };
  try {
    if (snapshot?.twitter_data) {
      res.twitter = await persistTwitterData(token.address, { ...snapshot, socials_from_db: snapshot.socials_from_db || [] }, { parseMetricCount, normalizeJoinDate });
    }
  } catch (e) {
    res.twitter = { error: e.message };
  }

  // Write a JSON artifact for caching/reference
  try {
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const file = path.join(REPORTS_DIR, `snapshot-${token.address}-${getTimestamp()}.json`);
    fs.writeFileSync(file, JSON.stringify({ token: { address: token.address, symbol: token.symbol, name: token.name }, snapshot }, null, 2));
    res.artifact = file;
  } catch (e) {
    res.artifactError = e.message;
  }
  return res;
}

// Load the most recent artifact for a token
export async function load_latest_socials_snapshot(tokenAddress) {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs.readdirSync(REPORTS_DIR).filter(f => f.startsWith(`snapshot-${tokenAddress}-`) && f.endsWith('.json'));
  if (files.length === 0) return null;
  const latest = files.map(f => ({ f, t: fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs }))
                     .sort((a,b)=> b.t - a.t)[0].f;
  try { return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, latest), 'utf8')); }
  catch { return null; }
}

