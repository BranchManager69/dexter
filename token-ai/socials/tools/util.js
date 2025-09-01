// token-ai/socials/tools/util.js

import fs from 'fs';
import path from 'path';
import { PublicKey } from '@solana/web3.js';
import { REPORTS_DIR } from '../common.js';

export function validate_base58_mint(mint) {
  try {
    const pk = new PublicKey(mint);
    const onCurve = PublicKey.isOnCurve(pk.toBytes());
    return { valid: true, onCurve, normalized: pk.toBase58() };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

export function rate_limited_gate({ retryAfterSec = 30, reason = 'rate_limited' } = {}) {
  const at = new Date(Date.now() + retryAfterSec * 1000).toISOString();
  return { defer: true, reason, retryAfterSec, retryAt: at };
}

export function get_cached_artifact({ tokenAddress, prefix = 'beta-x-', suffix = '.json' } = {}) {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith(suffix) && f.includes(tokenAddress || ''));
  if (files.length === 0) return null;
  const choose = files.map(f => ({ f, t: fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs }))
                     .sort((a,b)=> b.t - a.t)[0].f;
  return path.join(REPORTS_DIR, choose);
}

