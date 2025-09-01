// token-ai/core/validation.js

export function isBase58Mint(m){
  try {
    const s = String(m || '').trim();
    if (!s) return false;
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
  } catch { return false; }
}

export function isHttpUrl(u){
  try { return /^https?:\/\//i.test(String(u||'')); } catch { return false; }
}

export function toNumber(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function parseMaybeJson(val){
  try { return JSON.parse(String(val)); } catch { return null; }
}

