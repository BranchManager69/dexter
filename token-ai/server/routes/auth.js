import { jwtSignHS256, jwtVerifyHS256 } from '../utils/jwt.js';
import prisma from '../../../config/prisma.js';

export function registerIdentityMiddleware(app) {
  // Lightweight identity mapping: X-User-Token -> ai_app_users via ai_user_tokens
  app.use(async (req, res, next) => {
    try {
      const token = String(req.headers['x-user-token'] || '').trim();
      if (!token) return next();
      // find or create mapping
      let map = await prisma.ai_user_tokens.findUnique({ where: { token } }).catch(()=>null);
      let userId = map?.user_id || null;
      if (!userId) {
        const user = await prisma.ai_app_users.create({ data: { name: 'Dev User', role: 'user' } });
        await prisma.ai_user_tokens.create({ data: { token, user_id: user.id } });
        userId = user.id;
      }
      const user = await prisma.ai_app_users.findUnique({ where: { id: userId } }).catch(()=>null);
      if (user) req.aiUser = { id: user.id, role: user.role, extUserId: user.ext_user_id || null };
    } catch {}
    return next();
  });
}

export function registerAuthRoutes(app) {
  // Issue short‑lived MCP user token for UI (?userToken on /mcp-proxy)
  app.get('/mcp-user-token', async (req, res) => {
    try {
      const secret = process.env.MCP_USER_JWT_SECRET || process.env.TOKEN_AI_EVENTS_TOKEN || '';
      if (!secret) return res.status(501).json({ ok:false, error:'mcp_user_secret_missing' });
      let userId = null;
      // Supabase auth: verify Authorization: Bearer <access_token> using Auth API if available
      try {
        const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
        const anonKey = process.env.SUPABASE_ANON_KEY || '';
        const auth = String(req.headers['authorization']||'');
        if (supabaseUrl && anonKey && auth.startsWith('Bearer ')) {
          const tok = auth.slice(7).trim();
          const resp = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { 'authorization': `Bearer ${tok}`, 'apikey': anonKey } });
          if (resp.ok) {
            const data = await resp.json().catch(()=>null);
            const id = data?.id || data?.user?.id;
            if (id) userId = String(id);
          }
        }
      } catch {}
      // Dev override (optional): X-Dev-User-Id
      if (!userId && String(process.env.TOKEN_AI_DEV_ALLOW_USER_TOKEN||'').toLowerCase()==='1') {
        const dev = String(req.headers['x-dev-user-id']||'').trim(); if (dev) userId = dev;
      }
      // Demo fallback
      if (!userId) {
        if (String(process.env.TOKEN_AI_DEMO_MODE||'1')==='1') userId = 'demo';
        else return res.status(401).json({ ok:false, error:'unauthorized' });
      }
      const ttl = Math.max(60, Math.min(3600, parseInt(String(process.env.MCP_USER_JWT_TTL||'600'),10)||600));
      const token = jwtSignHS256({ sub: userId, iss:'token-ai' }, secret, ttl);
      return res.json({ ok:true, token, expires_in: ttl, user_id: userId });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });
}

export default { registerIdentityMiddleware, registerAuthRoutes };

