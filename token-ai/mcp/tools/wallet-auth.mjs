import { z } from 'zod';

// Per-session wallet overrides (for HTTP sessions) and a shared fallback for stdio
// Keyed by MCP session id when available; otherwise 'stdio'.
export const sessionWalletOverrides = new Map(); // sessionKey -> wallet_id

// Auth + Wallet resolution helpers
export function getBearerFromHeaders(headers){
  try {
    const h = headers || {};
    // Highest priority: explicit user token header
    const xUserToken = String(h['x-user-token'] || h['X-User-Token'] || '');
    if (xUserToken) return xUserToken.trim();
    // Next: X-Authorization (supports either raw token or Bearer <token>)
    const xAuthorization = String(h['x-authorization'] || h['X-Authorization'] || '');
    if (xAuthorization.startsWith('Bearer ')) return xAuthorization.slice(7).trim();
    if (xAuthorization) return xAuthorization.trim();
    // Fallback: standard Authorization header
    const auth = String(h['authorization'] || h['Authorization'] || '');
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    // As a last resort accept X-Api-Key
    const xApiKey = String(h['x-api-key'] || h['X-Api-Key'] || '');
    if (xApiKey) return xApiKey.trim();
  } catch {}
  return null;
}

export function parseBearerMap(){
  // Supports JSON: { "tokenA": "wallet-id-1", ... } or csv: tokenA:walletA,tokenB:walletB
  try {
    const j = process.env.TOKEN_AI_MCP_BEARER_MAP_JSON;
    if (j) { const obj = JSON.parse(j); if (obj && typeof obj === 'object') return obj; }
  } catch {}
  try {
    const s = process.env.TOKEN_AI_MCP_BEARER_MAP || '';
    if (s) {
      const out = {};
      for (const part of s.split(',')) {
        const [k, v] = part.split(':');
        if (k && v) out[k.trim()] = v.trim();
      }
      return out;
    }
  } catch {}
  return {};
}

const BEARER_MAP = parseBearerMap();

export function resolveWalletForRequest(extra){
  // 0) Session override takes precedence when set
  try {
    const sid = String(extra?.requestInfo?.headers?.['mcp-session-id'] || 'stdio');
    if (sessionWalletOverrides.has(sid)) {
      const wid = sessionWalletOverrides.get(sid);
      if (wid) return { wallet_id: wid, source: 'session' };
    }
  } catch {}
  try {
    // HTTP transport: extract from request headers
    const bearer = getBearerFromHeaders(extra?.requestInfo?.headers || {});
    if (bearer && BEARER_MAP[bearer]) {
      return { wallet_id: BEARER_MAP[bearer], source: 'bearer' };
    }
  } catch {}
  // STDIO or fallback: allow env to carry a bearer-like token
  try {
    const envToken = process.env.MCP_BEARER_TOKEN || process.env.TOKEN_AI_BEARER_TOKEN || '';
    if (envToken && BEARER_MAP[envToken]) {
      return { wallet_id: BEARER_MAP[envToken], source: 'bearer' };
    }
  } catch {}
  // Default env wallet id
  const envDefault = process.env.TOKEN_AI_DEFAULT_WALLET_ID || '';
  if (envDefault) return { wallet_id: envDefault, source: 'env' };
  return { wallet_id: null, source: 'none' };
}

export function registerWalletAuthTools(server) {
  // Auth helper: resolve current wallet for this session
  server.registerTool('resolve_wallet', {
    title: 'Resolve Wallet',
    description: 'Returns the effective wallet_id for this caller based on bearer token or env default.',
    outputSchema: { wallet_id: z.string().nullable(), source: z.string() }
  }, async (_args, extra) => {
    const r = resolveWalletForRequest(extra);
    return { structuredContent: r, content:[{ type:'text', text: r.wallet_id || 'none' }] };
  });

  // Session-scoped wallet override (without changing bearer/env)
  server.registerTool('set_session_wallet', {
    title: 'Set Session Wallet',
    description: 'Override the effective wallet_id for this MCP session only. Use resolve_wallet to inspect.',
    inputSchema: { wallet_id: z.string().optional(), clear: z.boolean().optional() },
    outputSchema: { ok: z.boolean(), wallet_id: z.string().nullable(), cleared: z.boolean().optional() }
  }, async ({ wallet_id, clear }, extra) => {
    try {
      const sid = String(extra?.requestInfo?.headers?.['mcp-session-id'] || 'stdio');
      if (clear) {
        sessionWalletOverrides.delete(sid);
        return { structuredContent: { ok: true, wallet_id: null, cleared: true }, content:[{ type:'text', text:'cleared' }] };
      }
      if (!wallet_id) return { content:[{ type:'text', text:'missing wallet_id' }], isError:true };
      sessionWalletOverrides.set(sid, String(wallet_id));
      return { structuredContent: { ok: true, wallet_id: String(wallet_id) }, content:[{ type:'text', text:String(wallet_id) }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'set_failed' }], isError:true };
    }
  });

  // Auth info for diagnostics
  server.registerTool('auth_info', {
    title: 'Auth Info',
    description: 'Diagnostics for wallet resolution and bearer/header state for this session.',
    outputSchema: {
      source: z.string(),
      wallet_id: z.string().nullable(),
      session_id: z.string().nullable(),
      default_wallet: z.string().nullable(),
      bearer_header: z.string().nullable(),
      bearer_preview: z.string().nullable(),
      mapping_hit: z.boolean().optional(),
    }
  }, async (_args, extra) => {
    const headers = extra?.requestInfo?.headers || {};
    const session_id = String(headers['mcp-session-id'] || 'stdio');
    const def = process.env.TOKEN_AI_DEFAULT_WALLET_ID || null;
    const bear = getBearerFromHeaders(headers);
    const bearPrev = bear ? `${bear.slice(0,4)}…${bear.slice(-4)}` : null;
    const map = parseBearerMap();
    const hit = !!(bear && map[bear]);
    const resolved = resolveWalletForRequest(extra);
    return { 
      structuredContent: { 
        source: resolved.source, 
        wallet_id: resolved.wallet_id, 
        session_id, 
        default_wallet: def, 
        bearer_header: bear || null, 
        bearer_preview: bearPrev, 
        mapping_hit: hit 
      }, 
      content:[{ type:'text', text: JSON.stringify({ source: resolved.source, wallet_id: resolved.wallet_id, session_id }, null, 2) }] 
    };
  });
}