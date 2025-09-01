import { jwtVerifyHS256 } from '../utils/jwt.js';

// Build OAuth metadata for ChatGPT MCP (served at host root and under /mcp-proxy)
function buildUiOauthMeta() {
  const PUB = 'https://dexter.cash/mcp';
  const AUTH = process.env.TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT || `${PUB}/authorize`;
  const TOKEN = process.env.TOKEN_AI_OIDC_TOKEN_ENDPOINT || `${PUB}/token`;
  const USERINFO = process.env.TOKEN_AI_OIDC_USERINFO || `${PUB}/userinfo`;
  const ISSUER = process.env.TOKEN_AI_OIDC_ISSUER || PUB;
  const SCOPES = (process.env.TOKEN_AI_OIDC_SCOPES || 'openid profile email').split(/\s+/).filter(Boolean);
  const CLIENT_ID = process.env.TOKEN_AI_OIDC_CLIENT_ID || 'clanka-mcp';
  return {
    issuer: ISSUER,
    authorization_endpoint: AUTH,
    token_endpoint: TOKEN,
    userinfo_endpoint: USERINFO,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: SCOPES,
    mcp: { client_id: CLIENT_ID, redirect_uri: `${PUB.replace(/\/$/, '')}/callback` }
  };
}

export function registerMcpProxyRoutes(app) {
  // Root discovery endpoints
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify(buildUiOauthMeta()));
    } catch {
      try { res.status(500).json({ error: 'oauth_meta_error' }); } catch {}
    }
  });

  app.get('/.well-known/openid-configuration', (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const meta = buildUiOauthMeta();
      res.end(JSON.stringify({ issuer: meta.issuer, authorization_endpoint: meta.authorization_endpoint, token_endpoint: meta.token_endpoint, userinfo_endpoint: meta.userinfo_endpoint }));
    } catch {
      try { res.status(500).json({ error: 'oidc_meta_error' }); } catch {}
    }
  });

  // Proxy discovery under /mcp-proxy for ChatGPT flows that use the proxy base
  app.get('/mcp-proxy/.well-known/oauth-authorization-server', (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify(buildUiOauthMeta()));
    } catch {
      try { res.status(500).json({ error: 'oauth_meta_error' }); } catch {}
    }
  });

  app.get('/mcp-proxy/.well-known/openid-configuration', (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const meta = buildUiOauthMeta();
      res.end(JSON.stringify({ issuer: meta.issuer, authorization_endpoint: meta.authorization_endpoint, token_endpoint: meta.token_endpoint, userinfo_endpoint: meta.userinfo_endpoint }));
    } catch {
      try { res.status(500).json({ error: 'oidc_meta_error' }); } catch {}
    }
  });

  // Proxy OAuth flows under /mcp-proxy to the local MCP server endpoints
  app.all('/mcp-proxy/authorize', async (req, res) => {
    try {
      const port = Number(process.env.TOKEN_AI_MCP_PORT || 3928);
      const qs = req.originalUrl.split('?')[1] || '';
      const target = `http://127.0.0.1:${port}/mcp/authorize${qs ? ('?' + qs) : ''}`;
      const r = await fetch(target, { method: 'GET', headers: { 'accept': 'text/html' }, redirect: 'manual' });
      if (r.status >= 300 && r.status < 400) {
        let loc = r.headers.get('location') || '';
        if (loc) loc = loc.replace('/mcp/callback', '/mcp-proxy/callback');
        res.writeHead(r.status, { Location: loc || '/mcp-proxy/callback' });
        res.end();
        return;
      }
      res.status(r.status);
      r.headers.forEach((val, key) => { try { res.setHeader(key, val); } catch {} });
      let html = await r.text();
      try { html = html.replaceAll('/mcp/authorize', '/mcp-proxy/authorize'); } catch {}
      res.end(html);
    } catch (e) {
      try { res.status(500).send('authorize_proxy_error'); } catch {}
    }
  });

  app.all('/mcp-proxy/token', async (req, res) => {
    try {
      const port = Number(process.env.TOKEN_AI_MCP_PORT || 3928);
      const target = `http://127.0.0.1:${port}/mcp/token`;
      const bodyRaw = await new Promise((resolve) => { let data=''; req.on('data', c=> data+=c.toString()); req.on('end', ()=> resolve(data)); req.on('error', ()=> resolve('')); });
      const body = bodyRaw && bodyRaw.length ? bodyRaw : (typeof req.body === 'string' ? req.body : new URLSearchParams(req.body || {}).toString());
      const r = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
      res.status(r.status);
      r.headers.forEach((val, key) => { try { res.setHeader(key, val); } catch {} });
      const text = await r.text();
      res.end(text);
    } catch (e) {
      try { res.status(500).json({ error: 'token_proxy_error' }); } catch {}
    }
  });

  app.all('/mcp-proxy/userinfo', async (req, res) => {
    try {
      const port = Number(process.env.TOKEN_AI_MCP_PORT || 3928);
      const target = `http://127.0.0.1:${port}/mcp/userinfo`;
      const hdr = new Headers();
      const incomingAuth = req.headers['authorization'];
      if (incomingAuth) hdr.set('authorization', Array.isArray(incomingAuth) ? incomingAuth.join(',') : String(incomingAuth));
      const r = await fetch(target, { method: 'GET', headers: hdr });
      res.status(r.status);
      r.headers.forEach((val, key) => { try { res.setHeader(key, val); } catch {} });
      const text = await r.text();
      res.end(text);
    } catch (e) {
      try { res.status(500).json({ error: 'userinfo_proxy_error' }); } catch {}
    }
  });

  // OAuth callback helper page
  app.get('/mcp-proxy/callback', (req, res) => {
    try {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!DOCTYPE html><html><head><title>OAuth Success</title></head><body>
        <h1>Authorization Successful</h1>
        <p>You can close this window and return to ChatGPT.</p>
        <script>if (window.opener) { try { window.opener.postMessage({ type: 'oauth-callback', url: window.location.href }, '*'); } catch(e){} window.close(); }</script>
      </body></html>`);
    } catch (e) { try { res.status(500).end('callback_error'); } catch {} }
  });

  // Public MCP proxy: forwards traffic to MCP with server-side bearer or forwarded auth
  app.all('/mcp-proxy', async (req, res) => {
    try {
      const target = String(process.env.TOKEN_AI_MCP_URL || '').trim();
      if (!target) { return res.status(503).json({ ok:false, error:'mcp_url_not_configured' }); }
      const token = String(process.env.TOKEN_AI_MCP_TOKEN || '').trim();
      const url = target;
      const method = req.method || 'GET';
      const hdr = new Headers();
      try {
        for (const [k, v] of Object.entries(req.headers || {})) {
          if (k.toLowerCase() === 'host' || k.toLowerCase() === 'content-length') continue;
          if (v != null) hdr.set(k, Array.isArray(v) ? v.join(',') : String(v));
        }
      } catch {}
      const FORWARD_AUTH = String(process.env.TOKEN_AI_MCP_PROXY_FORWARD_AUTH || '').toLowerCase();
      const shouldForward = (FORWARD_AUTH === '1' || FORWARD_AUTH === 'true' || FORWARD_AUTH === 'yes' || FORWARD_AUTH === 'on');
      let authMode = 'none';
      if (shouldForward) {
        const incomingAuth = req.headers['authorization'];
        if (incomingAuth) {
          hdr.set('Authorization', Array.isArray(incomingAuth) ? incomingAuth.join(',') : String(incomingAuth));
          authMode = 'forward';
        }
      } else {
        if (token) { hdr.set('Authorization', `Bearer ${token}`); authMode = 'inject'; }
      }

      // Validate per-user token for wallet mapping
      try {
        const qTok = String(req.query.userToken || '').trim();
        const hTok = String(req.headers['x-user-token'] || '').trim();
        const secret = process.env.MCP_USER_JWT_SECRET || process.env.TOKEN_AI_EVENTS_TOKEN || '';
        let uTok = '';
        if (qTok) {
          if (!secret) { return res.status(401).json({ ok:false, error:'user_token_validation_not_configured' }); }
          const payload = jwtVerifyHS256(qTok, secret);
          if (!payload || !(payload.sub || payload.user_id)) {
            return res.status(401).json({ ok:false, error:'invalid_user_token' });
          }
          uTok = String(payload.sub || payload.user_id);
        } else if (hTok) {
          uTok = hTok;
        } else {
          return res.status(401).json({ ok:false, error:'missing_user_token' });
        }
        // Pass through on a safe header to the backend
        hdr.set('X-User-Token', uTok);
      } catch {}

      // Normalize Accept
      const accept = hdr.get('accept') || '';
      if (!(accept.includes('application/json') && accept.includes('text/event-stream'))) {
        hdr.set('accept', 'application/json, text/event-stream');
      }
      // Body
      let body = undefined;
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        body = req.body ? JSON.stringify(req.body) : undefined;
        if (!hdr.get('content-type')) hdr.set('content-type', 'application/json');
      }
      const r = await fetch(url, { method, headers: hdr, body, duplex: 'half' });
      res.status(r.status);
      r.headers.forEach((val, key) => { try { res.setHeader(key, val); } catch {} });
      try { res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id'); } catch {}
      if (!r.body) { return res.end(); }
      const reader = r.body.getReader();
      const write = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      };
      write().catch(()=>{ try { res.end(); } catch {} });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'mcp_proxy_error' });
    }
  });
}

export default { registerMcpProxyRoutes };

