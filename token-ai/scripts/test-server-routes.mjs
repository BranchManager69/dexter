// Spin up a minimal app with modular routes and smoke test key endpoints
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIdentityMiddleware, registerAuthRoutes } from '../server/routes/auth.js';
import { registerMcpProxyRoutes } from '../server/routes/mcpProxy.js';
import { registerRealtimeRoutes } from '../server/routes/realtime.js';
import { registerWalletRoutes } from '../server/routes/wallets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_AI_DIR = path.resolve(__dirname, '..');

async function main(){
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '512kb' }));

  // Register modules (same order as server.js)
  registerIdentityMiddleware(app);
  registerAuthRoutes(app);
  registerRealtimeRoutes(app, { port: 0, tokenAiDir: TOKEN_AI_DIR });
  registerMcpProxyRoutes(app);
  registerWalletRoutes(app);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  async function getJSON(pathname, init) {
    const r = await fetch(base + pathname, init);
    const txt = await r.text();
    let body = null; try { body = JSON.parse(txt); } catch { body = txt; }
    return { status: r.status, ok: r.ok, body };
  }

  const results = {};
  results['well-known'] = await getJSON('/.well-known/oauth-authorization-server');
  results['mcp-proxy'] = await getJSON('/mcp-proxy');
  results['realtime-tools'] = await getJSON('/realtime/tools');
  results['realtime-bootstrap'] = await getJSON('/realtime/bootstrap');
  results['mcp-user-token'] = await getJSON('/mcp-user-token');

  // If we can mint a user token, test /mcp-proxy with it
  if (results['mcp-user-token'].ok && results['mcp-user-token'].body && results['mcp-user-token'].body.token) {
    const tok = results['mcp-user-token'].body.token;
    results['mcp-proxy-with-token'] = await getJSON(`/mcp-proxy?userToken=${encodeURIComponent(tok)}`);
    // If MCP URL is configured, attempt a real MCP handshake over the proxy and list tools
    const mcpUrl = process.env.TOKEN_AI_MCP_URL || '';
    const mcpTok = process.env.TOKEN_AI_MCP_TOKEN || '';
    if (mcpUrl) {
      try {
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
        const proxyUrl = `${base}/mcp-proxy?userToken=${encodeURIComponent(tok)}`;
        const forward = ['1','true','yes','on'].includes(String(process.env.TOKEN_AI_MCP_PROXY_FORWARD_AUTH||'').toLowerCase());
        const headers = {};
        if (forward && mcpTok) headers['authorization'] = `Bearer ${mcpTok}`;
        const transport = new StreamableHTTPClientTransport(proxyUrl, { requestInit: { headers } });
        const client = new Client({ name:'server-routes-proxy-test', version:'0.1.0' }, { capabilities:{ tools:{}, resources:{}, prompts:{}, logging:{} } });
        await client.connect(transport);
        const tools = await client.listTools({});
        results['mcp-proxy-tools'] = {
          ok: true,
          count: tools?.tools?.length || 0,
          sample: (tools?.tools||[]).slice(0,10).map(t=>t.name)
        };
        await client.close();
      } catch (e) {
        results['mcp-proxy-tools'] = { ok: false, error: e?.message || String(e) };
      }
    } else {
      results['mcp-proxy-tools'] = { skipped: true, reason: 'TOKEN_AI_MCP_URL not set' };
    }
  } else {
    results['mcp-proxy-with-token'] = { skipped: true };
    results['mcp-proxy-tools'] = { skipped: true };
  }

  // Introspect routes to ensure uniqueness
  function listRoutes(app) {
    const out = [];
    const stack = app && app._router && Array.isArray(app._router.stack) ? app._router.stack : [];
    stack.forEach((layer) => {
      if (layer.route && layer.route.path) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods || {}).filter(Boolean);
        out.push({ path, methods });
      }
    });
    return out;
  }
  const routes = listRoutes(app);
  const countByPath = (p) => routes.filter(r => r.path === p).length;
  const routeCounts = {
    '/realtime/tools': countByPath('/realtime/tools'),
    '/realtime/bootstrap': countByPath('/realtime/bootstrap'),
    '/.well-known/oauth-authorization-server': countByPath('/.well-known/oauth-authorization-server'),
    '/mcp-proxy': countByPath('/mcp-proxy'),
    '/managed-wallets': countByPath('/managed-wallets'),
    '/mcp-user-token': countByPath('/mcp-user-token'),
  };

  server.close();

  // Print concise summary
  const summary = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { status: v.status, ok: v.ok, body: typeof v.body === 'object' ? (v.body?.ok ?? undefined) : undefined, skipped: v.skipped || undefined }]));
  console.log(JSON.stringify({ port, summary, routeCounts, details: results }, null, 2));
}

main().catch((e)=>{ console.error('test-server-routes error:', e?.message || e); process.exit(1); });
