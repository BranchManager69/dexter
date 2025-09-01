// token-ai/core/cache.js

import fs from 'node:fs';
import path from 'node:path';

export function ensureCacheDir(dir){
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

export function cachePath(dir, key){
  return path.join(dir, key);
}

// Cache the result of a function call (if ttlMs > 0). Handles sync function results.
export function withCache(dir, key, ttlMs, fn){
  ensureCacheDir(dir);
  const p = cachePath(dir, key);
  if (ttlMs > 0 && fs.existsSync(p)) {
    const age = Date.now() - fs.statSync(p).mtimeMs;
    if (age <= ttlMs) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
    }
  }
  const result = fn();
  try { fs.writeFileSync(p, JSON.stringify(result)); } catch {}
  return result;
}

