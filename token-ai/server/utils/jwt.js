// Minimal HS256 JWT helpers for short‑lived tokens
import crypto from 'crypto';

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlJSON(obj) { return b64url(JSON.stringify(obj)); }

function hmacSHA256(key, data) {
  return crypto
    .createHmac('sha256', key)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function jwtSignHS256(payload, secret, ttlSec = 600) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + ttlSec, ...payload };
  const header = { alg: 'HS256', typ: 'JWT' };
  const token = `${b64urlJSON(header)}.${b64urlJSON(body)}`;
  const sig = hmacSHA256(secret, token);
  return `${token}.${sig}`;
}

export function jwtVerifyHS256(token, secret) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const sig = hmacSHA256(secret, `${h}.${p}`);
    if (sig !== s) return null;
    const payload = JSON.parse(
      Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export default { jwtSignHS256, jwtVerifyHS256 };

