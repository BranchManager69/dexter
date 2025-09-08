#!/usr/bin/env node
// Minimal static server for Token-AI live UI (separate from main API)
// Usage:
//   node token-ai/server.js --port 3013

import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer as WSS, WebSocket } from 'ws';
import fs from 'fs';
import OpenAI from 'openai';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { registerRealtimeRoutes } from './server/routes/realtime.js';
import { registerMcpProxyRoutes } from './server/routes/mcpProxy.js';
import { registerIdentityMiddleware, registerAuthRoutes } from './server/routes/auth.js';
import { registerWalletRoutes } from './server/routes/wallets.js';
import { registerLinkingRoutes } from './server/routes/linking.js';
import { registerIdentityRoutes } from './server/routes/identity.js';
import { RUN_LIMIT, LOGS_PER_RUN_LIMIT, CHILD_MAX_MB, activeRuns, childProcs, spawnAnalyzer, setRunLogListener, setRunExitListener, getRunLogs, killRun } from './core/run-manager.js';

// In-memory cache for lightweight endpoints
const memCache = new Map(); // key -> { at, data }
function cacheGet(k, ttlMs){ const e=memCache.get(k); if(!e) return null; if (Date.now()-e.at>ttlMs) return null; return e.data; }
function cacheSet(k, data){ memCache.set(k, { at: Date.now(), data }); }
import dotenv from 'dotenv';

// Load .env from parent monorepo first, then local token-ai/.env to allow local overrides
try {
  const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname));
  const PARENT = path.resolve(HERE, '..');
  // Do not override existing env (PM2-provided or shell)
  dotenv.config({ path: path.join(PARENT, '.env') });
  dotenv.config({ path: path.join(HERE, '.env') });
} catch {}

const ARGS = process.argv.slice(2);
function getFlag(name, def){
  for (let i=0;i<ARGS.length;i++){
    const a=ARGS[i];
    if (a===`--${name}`) return ARGS[i+1] || def;
    if (a.startsWith(`--${name}=`)) return a.split('=')[1] || def;
  }
  return def;
}

const PORT = Number(getFlag('port', process.env.TOKEN_AI_UI_PORT || 3013));

const app = express();
// Trust only loopback (local) proxy addresses for X-Forwarded-* so
// req.ip reflects the real client IP only when a local reverse proxy
// (like nginx on 127.0.0.1) forwards the request. This prevents
// direct external clients from spoofing X-Forwarded-For.
app.set('trust proxy', 'loopback');
const TOKEN_AI_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const REPORTS_DIR = path.join(TOKEN_AI_DIR, 'reports', 'ai-token-analyses');
const VOICE_DIR = path.join(TOKEN_AI_DIR, 'reports', 'voice-debug');
let RUNTIME_DEFAULT_WALLET_ID = process.env.TOKEN_AI_DEFAULT_WALLET_ID || '';
let DEV_X_USER_TOKEN = '';

// Asset version stamping disabled. Serve raw file paths without version tokens.
const ASSET_VER = 'no-cache';

// Serve static live pages from the repo's root public directory
const PUB_DIR = path.resolve(TOKEN_AI_DIR, '..', 'public');

// Dynamic HTML route for ALL public .html pages (no asset stamping)
app.get(/\/(.*\.html)$/i, (req, res, next) => {
  try {
    const rel = req.params[0];
    const file = path.join(PUB_DIR, rel);
    if (!fs.existsSync(file)) return next();
    let html = fs.readFileSync(file, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Prevent stale HTML so new ASSET_VER propagates promptly
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.end(html);
  } catch (e) {
    try { return next(e); } catch {}
  }
});

// Static files (JS/CSS/images)
app.use('/', express.static(PUB_DIR));

// Quick landing links
app.get('/live', (req,res)=>{
  res.redirect(301, '/agent-live.html');
});
app.get('/dashboard', (req,res)=>{
  res.redirect(301, '/agent-dashboard.html');
});

const server = http.createServer(app);

// OpenAI webhook endpoint (placed BEFORE JSON body parser to access raw body)
// Uses OPENAI_WEBHOOK_SECRET or OPENAI_WEBHOOK_KEY from env
try {
  const OPENAI_WEBHOOK_SECRET = process.env.OPENAI_WEBHOOK_SECRET || process.env.OPENAI_WEBHOOK_KEY || '';
  app.post('/openai/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    try {
      if (!OPENAI_WEBHOOK_SECRET) {
        return res.status(501).json({ ok:false, error:'webhook_secret_not_set' });
      }
      const client = new OpenAI({ webhookSecret: OPENAI_WEBHOOK_SECRET });
      const event = await client.webhooks.unwrap(req.body, req.headers);
      // Persist to disk for auditing
      try {
        const OPENAI_WH_DIR = path.join(TOKEN_AI_DIR, 'reports', 'openai-webhooks');
        fs.mkdirSync(OPENAI_WH_DIR, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g,'-');
        const base = `${event?.type || 'event'}-${stamp}-${Math.random().toString(36).slice(2,8)}`;
        const file = path.join(OPENAI_WH_DIR, `${base}.json`);
        fs.writeFileSync(file, JSON.stringify(event, null, 2));
      } catch {}
      // Minimal processing: broadcast to WS subscribers for visibility
      try {
        broadcast({ type:'DATA', topic:'terminal', subtype:'openai_webhook', event: event?.type || 'unknown', data: event, timestamp: new Date().toISOString() });
        console.log(`[openai:webhook] ${event?.type || 'unknown'}`);
      } catch {}
      return res.json({ ok:true });
    } catch (err) {
      const name = err?.name || '';
      const msg = err?.message || String(err);
      if (name.includes('InvalidWebhookSignature') || msg.toLowerCase().includes('invalid')) {
        return res.status(400).json({ ok:false, error:'invalid_signature' });
      }
      return res.status(500).json({ ok:false, error: msg });
    }
  });
} catch {}

// In-memory connected clients (WebSocket)
const wss = new WSS({ server, path: '/ws' });
const clients = new Set();

// Heartbeat (Cloudflare/proxy keepalive): ping clients periodically
const HEARTBEAT_MS = Number(process.env.TOKEN_AI_WS_HEARTBEAT_MS || 30000);
function wsHeartbeat() { try { this.isAlive = true; } catch {} }

wss.on('connection', (socket, req) => {
  const ip = req.socket.remoteAddress || '';
  console.log(`[ai-ui] WS client connected ${ip} (clients=${clients.size+1})`);
  clients.add(socket);
  // Mark alive and respond to pings
  try { socket.isAlive = true; socket.on('pong', wsHeartbeat); } catch {}
  socket.on('close', () => {
    clients.delete(socket);
    console.log(`[ai-ui] WS client disconnected (clients=${clients.size})`);
  });
});

// Ping loop
const wsPingIv = setInterval(() => {
  try {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) { try { ws.terminate(); } catch {} return; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  } catch {}
}, HEARTBEAT_MS);
server.on('close', () => { try { clearInterval(wsPingIv); } catch {} });

// Helper: broadcast JSON to all clients
function broadcast(obj){
  const data = JSON.stringify(obj);
  for (const sock of clients) {
    try { if (sock.readyState === WebSocket.OPEN) sock.send(data); } catch {}
  }
}

// JWT helpers and /mcp-user-token moved to server/routes/auth.js

// Accept sanitized agent events and broadcast to WS clients
app.use(express.json({ limit: '512kb' }));

// Register modular routes
registerIdentityMiddleware(app);
registerAuthRoutes(app);
registerRealtimeRoutes(app, { port: PORT, tokenAiDir: TOKEN_AI_DIR });
registerMcpProxyRoutes(app);
registerWalletRoutes(app);
registerLinkingRoutes(app);
registerIdentityRoutes(app);
app.post('/events', (req,res) => {
  try {
    // Allow only local agent by default
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error: 'forbidden' });
    }
    const { event, data } = req.body || {};
    if (!event) return res.status(400).json({ ok:false, error:'missing event' });
    // Broadcast in the same shape the pages expect
    broadcast({ type:'DATA', topic:'terminal', subtype:'ai_session', event, data, timestamp:new Date().toISOString() });
    try {
      const mint = data?.mint ? String(data.mint).slice(0,8)+'…' : '-';
      console.log(`[ai-ui] EVENT ${event} mint=${mint}`);
    } catch {}
    return res.json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Realtime voice debug endpoints are implemented in server/routes/realtime.js

// Mint ephemeral OpenAI Realtime session tokens for browser WebRTC
// Security: local callers always allowed. If TOKEN_AI_EVENTS_TOKEN is set,
// remote callers must send header `x-agent-token: <token>`.
if (false) app.post('/realtime/sessions', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = String(req.headers['x-agent-token'] || '');
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error: 'forbidden' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || '';
    if (!OPENAI_API_KEY) {
      return res.status(503).json({ ok:false, error:'missing_openai_key' });
    }

    // Defaults can be overridden by JSON body
    const body = req.body || {};
    const model = String(body.model || process.env.TOKEN_AI_REALTIME_MODEL || 'gpt-realtime');
    const voice = String(body.voice || process.env.TOKEN_AI_REALTIME_VOICE || 'verse');
    const instructions = String(body.instructions || readRealtimeInstructions() || '').trim();
    const modalities = Array.isArray(body.modalities) ? body.modalities : ['audio', 'text'];
    const turnDetection = body.turn_detection || { type: 'server_vad' };

    // Construct OpenAI payload
    const payload = {
      model,
      voice,
      modalities,
      // Let the server handle VAD/barge-in; client sends mic continuously
      turn_detection: turnDetection,
      ...(instructions ? { instructions } : {}),
    };

    // Create OpenAI Realtime session
    const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${OPENAI_API_KEY}`,
        'content-type': 'application/json',
        'openai-beta': 'realtime=v1',
      },
      body: JSON.stringify(payload),
    });

    // Handle errors
    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      return res.status(502).json({ ok:false, error:`openai_${r.status}`, details: t.slice(0,400) });
    }

    // Parse response
    const j = await r.json();

    // Return only the fields the browser needs
    return res.json({ ok:true, id: j.id, client_secret: j.client_secret, model: j.model, expires_at: j.expires_at, voice });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Serve Realtime bootstrap: instructions + tools (for the UI to session.update immediately)
if (false) app.get('/realtime/bootstrap', (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    const instructions = readRealtimeInstructions();
    const tools = getRealtimeTools();
    const model = String(process.env.TOKEN_AI_REALTIME_MODEL || 'gpt-realtime');
    const voice = String(process.env.TOKEN_AI_REALTIME_VOICE || 'verse');
    const version = computeBootstrapVersion({ model, voice, instructions, tools });
    // Compute updated_at from prompt/tools mtime (best-effort)
    let updatedAt = Date.now();
    try {
      const instrPath = path.join(TOKEN_AI_DIR, 'prompts', 'realtime.instructions.md');
      const toolsPath = path.join(TOKEN_AI_DIR, 'core', 'realtime-tools.js');
      const mt1 = fs.existsSync(instrPath) ? (fs.statSync(instrPath).mtimeMs||0) : 0;
      const mt2 = fs.existsSync(toolsPath) ? (fs.statSync(toolsPath).mtimeMs||0) : 0;
      updatedAt = Math.max(mt1, mt2, updatedAt);
    } catch {}
    // Conditional ETag handling
    const etag = version ? `W/"${version}"` : undefined;
    if (etag) {
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');
      try { res.setHeader('Last-Modified', new Date(updatedAt).toUTCString()); } catch {}
      const inm = String(req.headers['if-none-match']||'').trim();
      if (inm && inm === etag) { return res.status(304).end(); }
    }
    return res.json({ ok:true, model, voice, version, instructions, tools, updated_at: updatedAt });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Expose Realtime tools and instructions separately (optional)
if (false) app.get('/realtime/tools', (req, res) => {
  try { return res.json({ ok:true, tools: getRealtimeTools() }); } catch (e) { return res.status(500).json({ ok:false, error: e?.message || 'error' }); }
});

if (false) app.get('/realtime/instructions', (req, res) => {
  try { return res.json({ ok:true, instructions: readRealtimeInstructions() }); } catch (e) { return res.status(500).json({ ok:false, error: e?.message || 'error' }); }
});

// Execute simple Realtime tool calls from the browser and return results
if (false) app.post('/realtime/tool-call', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error: 'forbidden' });
    }
    const body = req.body || {};
    const name = String(body.name||'');
    const args = body.args || {};
    async function uiFetch(path, init){
      const url = new URL(`http://localhost:${PORT}${path}`);
      const r = await fetch(url, init);
      const txt = await r.text();
      try { return { ok: r.ok, status: r.status, body: JSON.parse(txt) }; } catch { return { ok: r.ok, status: r.status, body: txt }; }
    }
    // Helper: generic MCP bridge (HTTP)
    async function mcpCall(toolName, toolArgs){
      const MCP_PORT = Number(process.env.TOKEN_AI_MCP_PORT || 3928);
      const TOKEN = process.env.TOKEN_AI_MCP_TOKEN || '';
      const XUSER = String((req.headers['x-user-token']||'')).trim();
      const initBody = JSON.stringify({ jsonrpc:'2.0', id: '1', method:'initialize', params:{ clientInfo:{ name:'voice-bridge', version:'0.1' }, protocolVersion:'2024-11-05', capabilities:{} } });
      const ctrl = new AbortController();
      const initResp = await fetch(`http://localhost:${MCP_PORT}/mcp`, {
        method:'POST',
        headers: { 'Authorization': TOKEN ? `Bearer ${TOKEN}` : '', ...(XUSER? { 'X-User-Token': XUSER } : {}), 'Accept':'application/json, text/event-stream', 'Content-Type':'application/json' },
        body: initBody,
        signal: ctrl.signal,
      }).catch(e=>({ ok:false, headers:new Headers(), statusText:String(e?.message||e) }));
      let sid = '';
      try { sid = initResp?.headers?.get?.('mcp-session-id') || ''; } catch {}
      try { ctrl.abort(); } catch {}
      if (!sid) return { ok:false, error:'mcp_no_session' };
      const callBody = JSON.stringify({ jsonrpc:'2.0', id:'2', method:'tools/call', params:{ name: toolName, arguments: toolArgs || {} } });
      const r2 = await fetch(`http://localhost:${MCP_PORT}/mcp`, {
        method:'POST',
        headers: { 'Authorization': TOKEN ? `Bearer ${TOKEN}` : '', ...(XUSER? { 'X-User-Token': XUSER } : {}), 'Accept':'application/json', 'Content-Type':'application/json', 'Mcp-Session-Id': sid },
        body: callBody,
      });
      const txt = await r2.text();
      try { return JSON.parse(txt); } catch { return { ok:false, error:'mcp_bad_json', raw: txt.slice(0,2000) }; }
    }

    if (name === 'run_agent') {
      const mint = String(args?.mint||'').trim();
      if (!mint || mint.length < 32) return res.status(400).json({ ok:false, error:'bad_mint' });
      const r = await uiFetch('/run', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ mint }) });
      return res.json({ ok: r.ok, status: r.status, data: r.body });
    }
    if (name === 'get_latest_analysis') {
      const r = await uiFetch('/latest-analysis', { method:'GET' });
      return res.json({ ok: r.ok, status: r.status, data: r.body });
    }
    if (name === 'resolve_token') {
      const q = String(args?.query || args?.symbol || '').trim();
      const chain = String(args?.chain || 'solana').toLowerCase();
      const limit = Number(args?.limit) || 5;
      if (!q) return res.status(400).json({ ok:false, error:'missing_query' });
      try {
        // Fetch SOL price from CoinGecko - NO FALLBACK
        let solPrice = null;
        try {
          const cgr = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
          if (cgr.ok) {
            const cgj = await cgr.json();
            solPrice = cgj?.solana?.usd || null;
          }
        } catch {}
        
        if (!solPrice) {
          return res.status(502).json({ ok:false, error: 'sol_price_unavailable' });
        }

        const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { headers:{ 'accept':'application/json' } });
        const j = await r.json().catch(()=>({}));
        const pairs = Array.isArray(j?.pairs) ? j.pairs : [];
        
        // Build token map with proper scoring
        const tokenMap = new Map();
        const targetSymbol = q.toUpperCase();
        
        for (const p of pairs) {
          if ((p?.chainId||'').toLowerCase() !== chain) continue;
          const base = p.baseToken || p.base || {};
          const quote = p.quoteToken || p.quote || {};
          const addr = base.address;
          if (!addr) continue;
          
          const quoteSymbol = (quote.symbol || '').toUpperCase();
          const quoteLiq = Number(p?.liquidity?.quote || 0) || 0;
          
          // Calculate REAL liquidity from quote side
          let realLiquidityUsd = 0;
          if (quoteSymbol === 'SOL') {
            realLiquidityUsd = quoteLiq * solPrice;
          } else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') {
            realLiquidityUsd = quoteLiq;
          }
          
          const volume24h = Number(p?.volume?.h24 || 0) || 0;
          
          const existing = tokenMap.get(addr) || {
            address: addr,
            symbol: (base.symbol||'').toUpperCase(),
            name: base.name || null,
            liquidity_usd: 0,
            quote_liquidity_usd: 0,
            volume_24h: 0,
            pair_count: 0,
            url: p?.url || null,
            dex_id: p?.dexId || null,
            pair_address: p?.pairAddress || null
          };
          
          existing.liquidity_usd += Number(p?.liquidity?.usd || 0) || 0;
          existing.quote_liquidity_usd += realLiquidityUsd;
          existing.volume_24h += volume24h;
          existing.pair_count++;
          
          tokenMap.set(addr, existing);
        }
        
        // Score and rank tokens
        let tokens = Array.from(tokenMap.values()).map(token => {
          const exactMatch = token.symbol === targetSymbol ? 1000 : 0;
          const partialMatch = (!exactMatch && token.symbol.includes(targetSymbol)) ? 200 : 0;
          
          // Use REAL liquidity for scoring
          const liquidityScore = Math.log10(1 + token.quote_liquidity_usd) * 20;
          const volumeScore = Math.log10(1 + token.volume_24h) * 15;
          
          // Momentum bonus - what's hot RIGHT NOW
          let momentumBonus = 0;
          if (token.volume_24h > 1000000) {
            momentumBonus = 200;  // $1M+ daily volume = very hot
          } else if (token.volume_24h > 500000) {
            momentumBonus = 100;  // $500K+ = hot
          } else if (token.volume_24h > 100000) {
            momentumBonus = 50;   // $100K+ = warming up
          }
          
          // Scam detection
          const liquidityRatio = token.liquidity_usd > 0 ? (token.quote_liquidity_usd / token.liquidity_usd) : 1;
          const scamPenalty = liquidityRatio < 0.001 ? -500 : 0;
          const isLikelyScam = liquidityRatio < 0.001;
          
          // Dead token penalty
          let deadTokenPenalty = 0;
          if (token.volume_24h < 1000) {
            deadTokenPenalty = -200;
          } else if (token.volume_24h < 10000) {
            deadTokenPenalty = -100;
          }
          
          const score = exactMatch + partialMatch + liquidityScore + volumeScore + 
                       momentumBonus + token.pair_count * 5 + scamPenalty + deadTokenPenalty;
          
          return {
            ...token,
            price_usd: 0, // Not available from search endpoint
            confidence: 0, // Will be calculated after filtering
            liquidity_ratio: liquidityRatio,
            is_likely_scam: isLikelyScam,
            score: score,
            score_breakdown: {
              exact_match: exactMatch,
              partial_match: partialMatch,
              liquidity_score: liquidityScore,
              volume_score: volumeScore,
              momentum_bonus: momentumBonus,
              evidence_count: token.pair_count * 5,
              base_role: 0,
              quote_bonus: 0,
              scam_penalty: scamPenalty,
              dead_token_penalty: deadTokenPenalty,
              total: score
            }
          };
        });
        
        // Filter out scams and sort by score
        tokens = tokens.filter(t => !t.is_likely_scam);
        tokens.sort((a, b) => b.score - a.score);
        tokens = tokens.slice(0, limit);
        
        // Calculate confidence percentages
        const totalScore = tokens.reduce((sum, t) => sum + t.score, 0);
        tokens.forEach(t => {
          t.confidence = totalScore > 0 ? Math.round((t.score / totalScore) * 100) : 0;
        });
        
        return res.json({ ok:true, results: tokens });
      } catch (e) {
        return res.status(502).json({ ok:false, error: 'resolve_error', details: e?.message || String(e) });
      }
    }
    if (name === 'voice_debug_save') {
      const session = args?.session || undefined;
      const note = args?.note || undefined;
      const r = await uiFetch('/realtime/debug-save', { method:'POST', headers:{ 'content-type':'application/json', 'x-agent-token': (process.env.TOKEN_AI_EVENTS_TOKEN||'') }, body: JSON.stringify({ session, note }) });
      return res.json({ ok: r.ok, status: r.status, data: r.body });
    }
    if (name === 'voice_health') {
      const session = args?.session ? `?session=${encodeURIComponent(String(args.session))}` : '';
      const r = await uiFetch('/realtime/health'+session, { method:'GET', headers:{ 'x-agent-token': (process.env.TOKEN_AI_EVENTS_TOKEN||'') } });
      return res.json({ ok: r.ok, status: r.status, data: r.body });
    }
    if (name === 'get_token_ohlcv') {
      try {
        const mint = String(args?.mint || '').trim();
        if (!mint || mint.length < 32) return res.status(400).json({ ok:false, error:'invalid_mint' });
        const hours = Math.min(Math.max(parseInt(String(args?.hours||'6'),10)||6, 1), 336);
        
        // Use the existing /ohlcv endpoint
        const url = new URL(`http://localhost:${PORT}/ohlcv`);
        url.searchParams.set('mint', mint);
        url.searchParams.set('hours', String(hours));
        
        const r = await fetch(url.toString());
        const data = await r.json();
        
        if (!r.ok || !data.ok) {
          return res.status(r.status || 500).json({ ok:false, error: data?.error || 'ohlcv_failed' });
        }
        
        // Format response with summary
        const candles = data.candles || [];
        const summary = {
          mint,
          hours,
          candles: candles.length,
          interval: data.interval,
          latest_price: candles[candles.length-1]?.c || null,
          high_24h: Math.max(...candles.map(c => c.h || 0)),
          low_24h: Math.min(...candles.filter(c => c.l > 0).map(c => c.l)),
          change_pct: candles.length >= 2 ? ((candles[candles.length-1].c - candles[0].o) / candles[0].o * 100).toFixed(2) : null
        };
        
        return res.json({ ok:true, mcp: { summary, candles: candles.slice(-20), full_count: candles.length } });
      } catch (e) {
        return res.status(500).json({ ok:false, error:'ohlcv_error', details: e?.message || String(e) });
      }
    }
    if (name === 'list_aliases') {
      if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
      try {
        const items = await prisma.ai_wallet_aliases.findMany({ where: { user_id: req.aiUser.id }, orderBy: { created_at: 'desc' } });
        return res.json({ ok:true, items });
      } catch (e) {
        return res.status(500).json({ ok:false, error:'alias_list_failed', details: e?.message || String(e) });
      }
    }
    if (name === 'add_wallet_alias') {
      if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
      const alias = String(args?.alias || '').trim();
      const walletId = String(args?.wallet_id || '').trim();
      if (!alias || !walletId) return res.status(400).json({ ok:false, error:'missing_fields' });
      try {
        const rec = await prisma.ai_wallet_aliases.upsert({ where: { user_id_alias: { user_id: req.aiUser.id, alias } }, update: { wallet_id: walletId }, create: { user_id: req.aiUser.id, wallet_id: walletId, alias } });
        return res.json({ ok:true, alias: rec });
      } catch (e) {
        return res.status(500).json({ ok:false, error:'alias_upsert_failed', details: e?.message || String(e) });
      }
    }
    if (name === 'set_default_wallet') {
      if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
      // Resolve wallet by explicit id, alias, or hint
      let wid = String(args?.wallet_id || '').trim();
      const hint = String(args?.alias || args?.wallet_alias || args?.wallet_hint || args?.wallet || '').trim();
      try {
        if (!wid && hint) {
          // 1) alias table
          let match = await prisma.ai_wallet_aliases.findFirst({ where: { user_id: req.aiUser.id, alias: { equals: hint, mode: 'insensitive' } } });
          if (!match) match = await prisma.ai_wallet_aliases.findFirst({ where: { user_id: req.aiUser.id, alias: { contains: hint, mode: 'insensitive' } } });
          if (match && match.wallet_id) wid = match.wallet_id;
          // 2) try visible wallets by label/suffix/prefix
          if (!wid) {
            const { listManagedWallets } = await import('./trade-manager/wallet-utils.js');
            const includeAdmin = String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1';
            const externalUserId = (req.aiUser && req.aiUser.extUserId != null) ? req.aiUser.extUserId : null;
            const list = await listManagedWallets({ externalUserId, includeAdmin });
            const canon = (s)=> String(s||'').toLowerCase();
            const h = canon(hint).replace(/^[.]+|[.]+$/g,'');
            const byLabel = list.find(w => canon(w.wallet_name).includes(h));
            const bySuffix = list.find(w => String(w.public_key||'').toLowerCase().endsWith(h));
            const byPrefix = list.find(w => String(w.public_key||'').toLowerCase().startsWith(h));
            const pick = byLabel || bySuffix || byPrefix || null;
            if (pick) wid = String(pick.id);
          }
        }
        if (!wid) return res.status(400).json({ ok:false, error:'unable_to_resolve_wallet' });
        await prisma.ai_user_settings.upsert({ where: { user_id: req.aiUser.id }, update: { default_wallet_id: wid, updated_at: new Date() }, create: { user_id: req.aiUser.id, default_wallet_id: wid, last_used_wallet_id: wid } });
        return res.json({ ok:true, wallet_id: wid });
      } catch (e) {
        return res.status(500).json({ ok:false, error:'persist_failed', details: e?.message || String(e) });
      }
    }
    // Generic MCP bridge for remaining tools
    // Auto-inject default wallet_id for trading tools
    const tradeTools = new Set(['execute_buy','execute_sell','execute_sell_all','trade','execute_buy_preview','execute_sell_preview','list_wallet_token_balances']);
    let callArgs = { ...(args||{}) };
    if (tradeTools.has(name) && !callArgs.wallet_id) {
      // If a human-friendly hint is provided, try to resolve to a wallet_id first
      let hint = null;
      try {
        for (const k of ['wallet_alias','wallet_name','wallet','wallet_hint']) {
          if (typeof args?.[k] === 'string' && args[k].trim()) { hint = String(args[k]).trim(); break; }
        }
      } catch {}
      if (hint && req.aiUser && req.aiUser.id) {
        try {
          // 1) Try alias table (exact or contains, case-insensitive)
          let match = await prisma.ai_wallet_aliases.findFirst({ where: { user_id: req.aiUser.id, alias: { equals: hint, mode: 'insensitive' } } });
          if (!match) match = await prisma.ai_wallet_aliases.findFirst({ where: { user_id: req.aiUser.id, alias: { contains: hint, mode: 'insensitive' } } });
          if (match && match.wallet_id) callArgs.wallet_id = match.wallet_id;
          // 2) Try label/PK match among visible wallets
          if (!callArgs.wallet_id) {
            const { listManagedWallets } = await import('./trade-manager/wallet-utils.js');
            const includeAdmin = String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1';
            const externalUserId = (req.aiUser && req.aiUser.extUserId != null) ? req.aiUser.extUserId : null;
            const list = await listManagedWallets({ externalUserId, includeAdmin });
            const canon = (s)=> String(s||'').toLowerCase();
            const h = canon(hint).replace(/^[.]+|[.]+$/g,'');
            const byLabel = list.find(w => canon(w.wallet_name).includes(h));
            const bySuffix = list.find(w => w.public_key?.toLowerCase().endsWith(h));
            const byPrefix = list.find(w => w.public_key?.toLowerCase().startsWith(h));
            const pick = byLabel || bySuffix || byPrefix || null;
            if (pick) callArgs.wallet_id = String(pick.id);
          }
        } catch {}
      }
      // Try per-user default first
      if (req.aiUser && req.aiUser.id) {
        try {
          const us = await prisma.ai_user_settings.findUnique({ where: { user_id: req.aiUser.id } });
          if (us && us.default_wallet_id) callArgs.wallet_id = us.default_wallet_id;
        } catch {}
      }
      // Fallbacks: runtime, env, then first listed wallet via MCP
      if (!callArgs.wallet_id) {
        const RDEF = RUNTIME_DEFAULT_WALLET_ID || '';
        const DEF = process.env.TOKEN_AI_DEFAULT_WALLET_ID || '';
        if (RDEF) callArgs.wallet_id = RDEF; else if (DEF) callArgs.wallet_id = DEF;
      }
      if (!callArgs.wallet_id) {
        try {
          const wallets = await mcpCall('list_managed_wallets', {});
          const list = wallets?.result?.content ? (()=>{ try { return JSON.parse(wallets.result.content[0]?.text||'[]'); } catch { return []; } })() : (wallets?.structuredContent?.wallets || []);
          const w = (Array.isArray(list) && list.length) ? (list[0].id || list[0].wallet_id || list[0]) : null;
          if (w) callArgs.wallet_id = String(w);
        } catch {}
      }
    }
    const mcp = await mcpCall(name, callArgs);

    // Persist last-used wallet and trade audit for trading actions
    if (tradeTools.has(name) && callArgs.wallet_id && req.aiUser && req.aiUser.id) {
      try {
        await prisma.ai_user_settings.upsert({
          where: { user_id: req.aiUser.id },
          update: { last_used_wallet_id: String(callArgs.wallet_id), updated_at: new Date() },
          create: { user_id: req.aiUser.id, last_used_wallet_id: String(callArgs.wallet_id) }
        });
      } catch {}
      try {
        // Best-effort tx hash extraction
        let tx = null;
        try {
          const raw = JSON.stringify(mcp);
          const m = raw.match(/\"(signature|tx|tx_hash)\"\s*:\s*\"([^\"]+)\"/);
          if (m) tx = m[2];
        } catch {}
        const tokenMint = callArgs.token_mint || callArgs.token_address || null;
        const amountUi = callArgs.sol_amount ?? callArgs.token_amount ?? callArgs.percent_of_balance ?? null;
        await prisma.ai_trade_audit.create({
          data: {
            user_id: req.aiUser.id,
            wallet_id: String(callArgs.wallet_id),
            token_mint: tokenMint ? String(tokenMint) : null,
            action: String(name),
            amount_ui: amountUi != null ? String(amountUi) : null,
            tx_hash: tx,
            frames_json: mcp
          }
        });
      } catch {}
    }
    return res.json({ ok: true, mcp });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Lightweight OHLCV proxy for sparkline (Birdeye v3). Keeps API key server-side.
app.get('/ohlcv', async (req, res) => {
  try {
    const mint = String(req.query.mint || '').trim();
    if (!mint || mint.length < 32) return res.status(400).json({ ok:false, error:'invalid_mint' });
    const hours = Math.min(Math.max(parseInt(String(req.query.hours||'6'),10)||6, 1), 336);
    // auto interval: 1m <= 6h, 5m <= 48h, else 15m
    const interval = hours <= 6 ? 1 : hours <= 48 ? 5 : 15;
    const key = process.env.BIRDEYE_API_KEY || '';
    if (!key) return res.status(503).json({ ok:false, error:'missing_birdeye_key' });
    // Support custom timeframe anchoring: accept end (unix seconds) or explicit from/to
    let to = Math.floor(Date.now()/1000);
    let from = to - hours*3600;
    try {
      const qTo = req.query.to != null ? Math.floor(Number(req.query.to)) : null;
      const qFrom = req.query.from != null ? Math.floor(Number(req.query.from)) : null;
      const qEnd = req.query.end != null ? Math.floor(Number(req.query.end)) : null; // alias for 'to'
      if (qFrom && qTo && qFrom > 0 && qTo > 0 && qTo > qFrom) { from = qFrom; to = qTo; }
      else if (qEnd && qEnd > 0) { to = qEnd; from = to - hours*3600; }
    } catch {}
    const type = interval <= 1 ? '1m' : (interval <= 5 ? '5m' : '15m');
    const cacheKey = `ohlcv|${mint}|${type}|${from}|${to}`;
    const cached = cacheGet(cacheKey, 30_000);
    if (cached) return res.json({ ok:true, ...cached });
    const url = `https://public-api.birdeye.so/defi/v3/ohlcv?address=${encodeURIComponent(mint)}&type=${encodeURIComponent(type)}&currency=native&time_from=${from}&time_to=${to}&ui_amount_mode=both&mode=range`;
    const r = await fetch(url, { headers: { 'X-API-KEY': key, 'accept':'application/json', 'x-chain':'solana' } });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ ok:false, error:`birdeye_${r.status}`, details: t.slice(0,200) });
    }
    const j = await r.json();
    const items = Array.isArray(j?.data?.items) ? j.data.items : [];
    const series = items.map(it => ({ t: it.unix_time || it.time || 0, c: it.c })).filter(x => x.t && x.c!=null);
    const payload = { mint, hours, interval_minutes: interval, points: series.length, series };
    cacheSet(cacheKey, payload);
    return res.json({ ok:true, ...payload });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Simple runner to spawn analyzer processes (max concurrency via env)
const BROADCAST_CHILD_LOGS = String(process.env.TOKEN_AI_BROADCAST_CHILD_LOGS || '0') === '1';

// Hook run-manager events to broadcast logs/exits over WS when enabled
try {
  setRunLogListener(({ pid, mint, stream, line }) => {
    if (!BROADCAST_CHILD_LOGS) return;
    // Filter noisy Logtail errors (optional)
    try { if (stream === 'stderr') { const lc = String(line||'').toLowerCase(); if (lc.includes('not allowed') || lc.includes('logtail')) return; } } catch {}
    broadcast({ type:'DATA', topic:'terminal', subtype:'runner', event:'runner:log', data:{ pid, mint, stream, line, at: new Date().toISOString() } });
    // Also mirror to server console so PM2 logs include child output (useful for SSH tail)
    try {
      const short = mint ? String(mint).slice(0,8)+'…' : '-';
      const prefix = stream === 'stderr' ? '[runner:stderr]' : '[runner:stdout]';
      console.log(`${prefix} pid=${pid} mint=${short} ${line}`);
    } catch {}
  });
  setRunExitListener(({ pid, mint, code, signal }) => {
    broadcast({ type:'DATA', topic:'terminal', subtype:'runner', event:'runner:ended', data:{ mint, pid, code, signal, ended_at:new Date().toISOString() } });
  });
} catch {}

// Backward‑compat start endpoint
app.post('/run', async (req, res) => {
  try {
    const { mint } = req.body || {};
    if (!mint || typeof mint !== 'string' || mint.length < 32) {
      return res.status(400).json({ ok:false, error:'invalid mint' });
    }
    const normalizedMint = String(mint).trim();
    // Prevent duplicate runs for the same mint while one is active
    for (const [pid, v] of activeRuns.entries()) {
      try { if ((v?.mint || '') === normalizedMint) {
        return res.status(409).json({ ok:false, error:'already_running', pid });
      } } catch {}
    }
    if (activeRuns.size >= RUN_LIMIT) {
      console.warn(`[ai-ui] RUN rejected (limit reached ${RUN_LIMIT}) mint=${String(mint).slice(0,8)}…`);
      return res.status(429).json({ ok:false, error:`concurrency_limit (${RUN_LIMIT})` });
    }
    const TOKEN_AI_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
    const childEnv = { ...process.env, TOKEN_AI_EVENTS_URL: `http://localhost:${PORT}/events` };
    const pid = spawnAnalyzer('agent', [normalizedMint], { cwd: path.resolve(TOKEN_AI_DIR, '..'), env: childEnv, mint: normalizedMint });
    console.log(`[ai-ui] RUN started pid=${pid} mint=${String(mint).slice(0,8)}… (active=${activeRuns.size}/${RUN_LIMIT})`);
    broadcast({ type:'DATA', topic:'terminal', subtype:'runner', event:'runner:started', data:{ mint, pid, started_at: new Date().toISOString() } });
    return res.json({ ok:true, pid });
  } catch (e) {
    console.error('[ai-ui] RUN error', e?.message || e);
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// New alias matching the Live UI module (public/js/live/runs.js)
// Accepts the same payload as POST /run and returns { ok, pid }
app.post('/runs', async (req, res) => {
  try {
    const { mint } = req.body || {};
    if (!mint || typeof mint !== 'string' || mint.length < 32) {
      return res.status(400).json({ ok:false, error:'invalid mint' });
    }
    const normalizedMint = String(mint).trim();
    for (const [pid, v] of activeRuns.entries()) {
      try { if ((v?.mint || '') === normalizedMint) {
        return res.status(409).json({ ok:false, error:'already_running', pid });
      } } catch {}
    }
    if (activeRuns.size >= RUN_LIMIT) {
      console.warn(`[ai-ui] RUN rejected (limit reached ${RUN_LIMIT}) mint=${String(mint).slice(0,8)}…`);
      return res.status(429).json({ ok:false, error:`concurrency_limit (${RUN_LIMIT})` });
    }
    const TOKEN_AI_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
    const childEnv = { ...process.env, TOKEN_AI_EVENTS_URL: `http://localhost:${PORT}/events` };
    const pid = spawnAnalyzer('agent', [normalizedMint], { cwd: path.resolve(TOKEN_AI_DIR, '..'), env: childEnv, mint: normalizedMint });
    console.log(`[ai-ui] RUN started pid=${pid} mint=${String(mint).slice(0,8)}… (active=${activeRuns.size}/${RUN_LIMIT})`);
    broadcast({ type:'DATA', topic:'terminal', subtype:'runner', event:'runner:started', data:{ mint, pid, started_at: new Date().toISOString() } });
    return res.json({ ok:true, pid });
  } catch (e) {
    console.error('[ai-ui] RUN (/runs) error', e?.message || e);
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

app.get('/runs', (req,res) => {
  console.log(`[ai-ui] GET /runs -> ${activeRuns.size} active`);
  const list = Array.from(activeRuns.entries()).map(([pid, v]) => ({ pid, mint: v.mint, startedAt: v.startedAt }));
  res.json({ ok:true, active: list, limit: RUN_LIMIT });
});

// Fetch recent logs for a specific run (pid)
app.get('/runs/:pid/logs', (req,res) => {
  const pid = Number(req.params.pid);
  const out = getRunLogs(pid, LOGS_PER_RUN_LIMIT);
  if (!out) return res.status(404).json({ ok:false, error:'not_found' });
  res.json({ ok:true, pid: out.pid, mint: out.mint, logs: out.logs });
});

// Kill a running child process (admin utility)
app.delete('/runs/:pid', (req,res) => {
  const pid = Number(req.params.pid);
  const ok = killRun(pid);
  if (!ok) return res.status(404).json({ ok:false, error: 'not_found' });
  console.log(`[ai-ui] Killing run pid=${pid}`);
  return res.json({ ok:true });
});

// List recent persisted analyses from disk so the dashboard has history after restarts
app.get('/recent-analyses', (req, res) => {
  try {
    const lim = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '12'), 10) || 12));
    let files = [];
    try {
      files = (fs.readdirSync(REPORTS_DIR) || [])
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          file: path.join(REPORTS_DIR, f),
          name: f,
          mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs || 0; } catch { return 0; } })()
        }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, lim);
    } catch {}
    const out = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(f.file, 'utf8');
        const j = JSON.parse(raw);
        const mint = j.tokenAddress || j.mint || j?.metadata?.token_address || j?.metadata?.tokenAddress || null;
        const name = j?.metadata?.name || j?.name || null;
        const symbol = j?.metadata?.symbol || j?.symbol || null;
        const branchScore = (typeof j.branchScore === 'number') ? j.branchScore : null;
        const riskScore = (typeof j.riskScore === 'number') ? j.riskScore : null;
        const duration_ms = j?.metadata?.timings?.total_ms || null;
        out.push({ mint, name, symbol, branchScore, riskScore, duration_ms, file: f.name, mtime: f.mtime });
      } catch {}
    }
    return res.json({ ok: true, items: out });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Return the most recent full analysis JSON (for recap on live page)
app.get('/latest-analysis', (req, res) => {
  try {
    let files = [];
    try {
      files = (fs.readdirSync(REPORTS_DIR) || [])
        .filter(f => f.endsWith('.json'))
        .map(f => ({ file: path.join(REPORTS_DIR, f), name: f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs || 0; } catch { return 0; } })() }))
        .sort((a,b)=> b.mtime - a.mtime)
        .slice(0,1);
    } catch {}
    if (!files.length) return res.json({ ok:true, file:null, data:null });
    const f = files[0];
    let data = null;
    try { data = JSON.parse(fs.readFileSync(f.file, 'utf8')); } catch {}
    return res.json({ ok:true, file: f.name, mtime: f.mtime, data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Serve a specific persisted analysis JSON by filename (from REPORTS_DIR)
app.get('/report/:name', (req, res) => {
  try {
    const name = String(req.params.name || '');
    // Basic sanitization: allow alnum, dash/underscore/dot, must end with .json
    if (!/^[A-Za-z0-9._-]+\.json$/.test(name)) {
      return res.status(400).json({ ok:false, error: 'bad_name' });
    }
    const file = path.join(REPORTS_DIR, name);
    try { fs.accessSync(file, fs.constants.R_OK); } catch {
      return res.status(404).json({ ok:false, error: 'not_found' });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const stream = fs.createReadStream(file);
    stream.on('error', () => { try { res.status(500).end(); } catch {} });
    stream.pipe(res);
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Serve a specific persisted analysis JSON by filename via query param (robust path for prod routers)
app.get('/report-json', (req, res) => {
  try {
    const name = String(req.query.file || '');
    // Basic sanitization: allow alnum, dash/underscore/dot, must end with .json
    if (!/^[A-Za-z0-9._-]+\.json$/.test(name)) {
      return res.status(400).json({ ok:false, error: 'bad_name' });
    }
    const file = path.join(REPORTS_DIR, name);
    try { fs.accessSync(file, fs.constants.R_OK); } catch {
      return res.status(404).json({ ok:false, error: 'not_found' });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const stream = fs.createReadStream(file);
    stream.on('error', () => { try { res.status(500).end(); } catch {} });
    stream.pipe(res);
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

server.listen(PORT, () => {
  console.log(`Token-AI UI listening on http://localhost:${PORT}`);
  console.log(`Live Terminal: http://localhost:${PORT}/agent-live.html`);
  console.log(`Dashboard:    http://localhost:${PORT}/agent-dashboard.html`);
  console.log(`WebSocket:    ws://localhost:${PORT}/ws`);
  console.log('Agent events endpoint: POST http://localhost:'+PORT+'/events');
  console.log('  Tip: run the analyzer with TOKEN_AI_EVENTS_URL=http://localhost:'+PORT+'/events');
  console.log(`Concurrency limit: ${RUN_LIMIT}`);
  console.log(`Child memory cap: ${CHILD_MAX_MB} MB`);
});

// Small client env bootstrap for the Live page
app.get('/agent-env.js', (req, res) => {
  try {
    const token = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const openaiPresent = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN);
    const base = process.env.TOKEN_AI_PUBLIC_BASE || '';
    const defaultWallet = process.env.TOKEN_AI_DEFAULT_WALLET_ID || '';
    const mcpUrl = process.env.TOKEN_AI_MCP_URL || '';
    let userToken = process.env.TOKEN_AI_DEV_USER_TOKEN || DEV_X_USER_TOKEN || '';
    if (!userToken) { DEV_X_USER_TOKEN = 'dev_' + Math.random().toString(36).slice(2, 10); userToken = DEV_X_USER_TOKEN; }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.end(`(function(){ try { ${token ? `window.AGENT_TOKEN=${JSON.stringify(token)};` : ''} ${base ? `window.AGENT_BASE=${JSON.stringify(base)};` : ''} ${defaultWallet ? `window.DEFAULT_WALLET_ID=${JSON.stringify(defaultWallet)};` : ''} ${userToken ? `window.X_USER_TOKEN=${JSON.stringify(userToken)};` : ''} ${mcpUrl ? `window.MCP_URL=${JSON.stringify(mcpUrl)};` : ''} window.OPENAI_KEY_PRESENT=${openaiPresent ? 'true':'false'}; } catch(e){} })();`);
  } catch (e) {
    try { res.status(500).end('// agent-env error'); } catch {}
  }
});

// Expose minimal Supabase client config to the browser
app.get('/auth/config', (req, res) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:true, supabaseUrl: supabaseUrl || null, supabaseAnonKey: supabaseAnonKey || null }));
  } catch (e) {
    try { res.status(500).json({ ok:false, error:'auth_config_error' }); } catch {}
  }
});

// OAuth metadata for ChatGPT MCP (served at host root for compatibility)
function buildUiOauthMeta(basePath = '') {
  // Force unified base per Option B to avoid drift from env
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

if (false) app.get('/.well-known/oauth-authorization-server', (req, res) => {
  try {
    try { console.log(`[oauth-meta] UI serve auth metadata ua=${req.headers['user-agent']||''}`); } catch {}
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify(buildUiOauthMeta()));
  } catch (e) {
    try { res.status(500).json({ error: 'oauth_meta_error' }); } catch {}
  }
});

if (false) app.get('/.well-known/openid-configuration', (req, res) => {
  try {
    try { console.log(`[oauth-meta] UI serve oidc metadata ua=${req.headers['user-agent']||''}`); } catch {}
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const meta = buildUiOauthMeta();
    res.end(JSON.stringify({ issuer: meta.issuer, authorization_endpoint: meta.authorization_endpoint, token_endpoint: meta.token_endpoint, userinfo_endpoint: meta.userinfo_endpoint }));
  } catch (e) {
    try { res.status(500).json({ error: 'oidc_meta_error' }); } catch {}
  }
});

// Mirror OAuth metadata under /mcp-proxy/.well-known for ChatGPT base URLs pointing to the proxy
if (false) app.get('/mcp-proxy/.well-known/oauth-authorization-server', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify(buildUiOauthMeta('/mcp-proxy')));
  } catch (e) {
    try { res.status(500).json({ error: 'oauth_meta_error' }); } catch {}
  }
});

if (false) app.get('/mcp-proxy/.well-known/openid-configuration', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const meta = buildUiOauthMeta('/mcp-proxy');
    res.end(JSON.stringify({ issuer: meta.issuer, authorization_endpoint: meta.authorization_endpoint, token_endpoint: meta.token_endpoint, userinfo_endpoint: meta.userinfo_endpoint }));
  } catch (e) {
    try { res.status(500).json({ error: 'oidc_meta_error' }); } catch {}
  }
});

// Proxy OAuth flows under /mcp-proxy to the local MCP server endpoints
if (false) app.all('/mcp-proxy/authorize', async (req, res) => {
  try {
    const port = Number(process.env.TOKEN_AI_MCP_PORT || 3928);
    const qs = req.originalUrl.split('?')[1] || '';
    const target = `http://127.0.0.1:${port}/mcp/authorize${qs ? ('?' + qs) : ''}`;
    const r = await fetch(target, { method: 'GET', headers: { 'accept': 'text/html' }, redirect: 'manual' });
    // Mirror redirect to /mcp-proxy/callback
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
    // Rewrite form action to stay under /mcp-proxy so ChatGPT doesn't need direct /mcp routing
    try { html = html.replaceAll('/mcp/authorize', '/mcp-proxy/authorize'); } catch {}
    res.end(html);
  } catch (e) {
    try { res.status(500).send('authorize_proxy_error'); } catch {}
  }
});

if (false) app.all('/mcp-proxy/token', async (req, res) => {
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

if (false) app.all('/mcp-proxy/userinfo', async (req, res) => {
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

// OAuth callback helper to satisfy ChatGPT popup flow when using /mcp-proxy base
if (false) app.get('/mcp-proxy/callback', (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!DOCTYPE html><html><head><title>OAuth Success</title></head><body>
      <h1>Authorization Successful</h1>
      <p>You can close this window and return to ChatGPT.</p>
      <script>if (window.opener) { try { window.opener.postMessage({ type: 'oauth-callback', url: window.location.href }, '*'); } catch(e){} window.close(); }</script>
    </body></html>`);
  } catch (e) { try { res.status(500).end('callback_error'); } catch {} }
});

// Public MCP proxy: forwards Realtime MCP traffic to the actual MCP with server-side bearer auth
// This keeps the MCP token off the client and allows OpenAI to reach a protected MCP endpoint.
if (false) app.all('/mcp-proxy', async (req, res) => {
  try {
    const target = String(process.env.TOKEN_AI_MCP_URL || '').trim();
    if (!target) { return res.status(503).json({ ok:false, error:'mcp_url_not_configured' }); }
    const token = String(process.env.TOKEN_AI_MCP_TOKEN || '').trim();
    const url = target; // already absolute
    const method = req.method || 'GET';
    // Build headers: pass through Accept and MCP session headers; add Authorization
    const hdr = new Headers();
    try {
      for (const [k,v] of Object.entries(req.headers||{})) {
        // Skip hop-by-hop and content length; fetch sets them
        if (k.toLowerCase() === 'host' || k.toLowerCase() === 'content-length') continue;
        if (v != null) hdr.set(k, Array.isArray(v)? v.join(',') : String(v));
      }
    } catch {}
    // Authorization forwarding: if TOKEN_AI_MCP_PROXY_FORWARD_AUTH=1, pass through incoming Authorization
    // Otherwise inject server-side bearer to keep tokens off clients
    const FORWARD_AUTH = String(process.env.TOKEN_AI_MCP_PROXY_FORWARD_AUTH || '').toLowerCase();
    const shouldForward = (FORWARD_AUTH === '1' || FORWARD_AUTH === 'true' || FORWARD_AUTH === 'yes' || FORWARD_AUTH === 'on');
    let authMode = 'none';
    if (shouldForward) {
      const incomingAuth = req.headers['authorization'];
      if (incomingAuth) {
        hdr.set('Authorization', Array.isArray(incomingAuth) ? incomingAuth.join(',') : String(incomingAuth));
        authMode = 'forward';
      }
      // When forwarding auth, do NOT inject server token if missing to allow 401 + WWW-Authenticate
    } else {
      if (token) { hdr.set('Authorization', `Bearer ${token}`); authMode = 'inject'; }
    }
    // Enforce per-user token for wallet mapping (validate short-lived MCP user token if present)
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
        // Allow explicit header in dev/testing
        uTok = hTok;
      } else {
        return res.status(401).json({ ok:false, error:'missing_user_token' });
      }
      hdr.set('X-User-Token', uTok);
      const dbg = String(process.env.DEBUG_MCP_PROXY || '').toLowerCase();
      const debug = dbg === '1' || dbg === 'true' || dbg === 'yes' || dbg === 'on';
      if (debug) {
        try {
          const sid = req.headers['mcp-session-id'] || '';
          const ua = String(req.headers['user-agent']||'');
          const ah = req.headers['authorization'] ? 'yes' : 'no';
          const ct = String(req.headers['content-type']||'');
          console.log(`[mcp-proxy] ${method} -> ${url} auth:${ah} ct:${ct||'-'} x-user-token:${uTok ? 'yes' : 'no'} sid:${sid ? String(sid) : ''} ua:${ua.slice(0,40)} fwd:${authMode}`);
        } catch {}
      }
    } catch {}
    // Normalize Accept for MCP transport
    const accept = hdr.get('accept') || '';
    if (!(accept.includes('application/json') && accept.includes('text/event-stream'))) {
      hdr.set('accept', 'application/json, text/event-stream');
    }
    // Body
    let body = undefined;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      // Re-serialize JSON; our express.json parsed it already
      body = req.body ? JSON.stringify(req.body) : undefined;
      if (!hdr.get('content-type')) hdr.set('content-type', 'application/json');
    }
    const r = await fetch(url, { method, headers: hdr, body, duplex: 'half' });
    // Mirror status and headers; stream body
    res.status(r.status);
    r.headers.forEach((val, key) => { try { res.setHeader(key, val); } catch {} });
    // Expose session id header
    try { res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id'); } catch {}
    if (!r.body) { return res.end(); }
    // Stream
    const reader = r.body.getReader();
    const encoder = new TextEncoder();
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

// List managed wallets (labels + public keys) via local DB (no secrets exposed)
if (false) app.get('/managed-wallets', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    const { listManagedWallets } = await import('./trade-manager/wallet-utils.js');
    const includeAdmin = String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1';
    const externalUserId = (req.aiUser && req.aiUser.extUserId != null) ? req.aiUser.extUserId : null;
    const list = await listManagedWallets({ externalUserId, includeAdmin });
    return res.json({ ok:true, wallets: list });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// List aliases for current AI user (optionally filter by wallet_id)
if (false) app.get('/managed-wallets/aliases', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
    const walletId = String(req.query.wallet_id || '').trim();
    const where = walletId ? { user_id: req.aiUser.id, wallet_id: walletId } : { user_id: req.aiUser.id };
    const items = await prisma.ai_wallet_aliases.findMany({ where, orderBy: { created_at: 'desc' } });
    return res.json({ ok:true, items });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Add or update an alias for a wallet (per current AI user)
if (false) app.post('/managed-wallets/aliases', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
    const alias = String(req.body?.alias || '').trim();
    const walletId = String(req.body?.wallet_id || '').trim();
    if (!alias || !walletId) return res.status(400).json({ ok:false, error:'missing_fields' });
    // Ensure wallet is visible to this user or allowed by dev flag
    const { listManagedWallets } = await import('./trade-manager/wallet-utils.js');
    const includeAdmin = String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1';
    const externalUserId = (req.aiUser && req.aiUser.extUserId != null) ? req.aiUser.extUserId : null;
    const list = await listManagedWallets({ externalUserId, includeAdmin });
    const exists = (list || []).some(w => String(w.id) === walletId);
    if (!exists) return res.status(404).json({ ok:false, error:'wallet_not_visible' });
    // Upsert alias unique by (user_id, alias)
    const rec = await prisma.ai_wallet_aliases.upsert({
      where: { user_id_alias: { user_id: req.aiUser.id, alias } },
      update: { wallet_id: walletId },
      create: { user_id: req.aiUser.id, wallet_id: walletId, alias }
    });
    return res.json({ ok:true, alias: rec });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Delete an alias for the current AI user
if (false) app.delete('/managed-wallets/aliases', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
    const alias = String(req.body?.alias || '').trim();
    if (!alias) return res.status(400).json({ ok:false, error:'missing_alias' });
    const out = await prisma.ai_wallet_aliases.deleteMany({ where: { user_id: req.aiUser.id, alias } });
    return res.json({ ok:true, deleted: out.count });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Dev helper: find (?) users by nickname/username (local or token-gated)
app.get('/dev/users/find', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    const q = String(req.query.q || req.query.nickname || '').trim();
    if (!q) return res.status(400).json({ ok:false, error:'missing_query' });
    const where = {
      OR: [
        { nickname: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } }
      ]
    };
    const items = await prisma.users.findMany({
      where,
      select: { id: true, wallet_address: true, nickname: true, username: true, admin_label: true, role: true },
      take: 10
    });
    return res.json({ ok:true, items });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Dev helper: get managed_wallet owner by wallet id
app.get('/dev/wallets/:id/owner', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok:false, error:'missing_id' });
    const w = await prisma.managed_wallets.findUnique({
      where: { id },
      select: { id: true, public_key: true, label: true, ownerId: true, owner: { select: { id: true, nickname: true, username: true, admin_label: true } } }
    });
    if (!w) return res.status(404).json({ ok:false, error:'not_found' });
    return res.json({ ok:true, wallet: w });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Get/set runtime default wallet id (does not persist across restarts)
if (false) app.get('/managed-wallets/default', (req, res) => {
  try {
    const send = async () => {
      // Prefer per-user persisted default when available
      try {
        if (req.aiUser && req.aiUser.id) {
          const us = await prisma.ai_user_settings.findUnique({ where: { user_id: req.aiUser.id } });
          if (us && us.default_wallet_id) return res.json({ ok:true, wallet_id: us.default_wallet_id });
        }
      } catch {}
      const envDefault = process.env.TOKEN_AI_DEFAULT_WALLET_ID || '';
      return res.json({ ok:true, wallet_id: RUNTIME_DEFAULT_WALLET_ID || envDefault || null });
    };
    return send();
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

if (false) app.post('/managed-wallets/default', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
    const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
    const provided = req.headers['x-agent-token'] || '';
    if (!allowLocal && required && provided !== required) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    const wid = String(req.body?.wallet_id || '').trim();
    if (!wid) return res.status(400).json({ ok:false, error:'missing_wallet_id' });
    const { listManagedWallets } = await import('./trade-manager/wallet-utils.js');
    const includeAdmin = String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1';
    const externalUserId = (req.aiUser && req.aiUser.extUserId != null) ? req.aiUser.extUserId : null;
    const list = await listManagedWallets({ externalUserId, includeAdmin });
    const exists = (list || []).some(w => String(w.id) === wid);
    if (!exists) return res.status(404).json({ ok:false, error:'not_found' });
    // Persist per-user when user context is present; otherwise keep runtime default
    if (req.aiUser && req.aiUser.id) {
      try {
        await prisma.ai_user_settings.upsert({
          where: { user_id: req.aiUser.id },
          update: { default_wallet_id: wid, updated_at: new Date() },
          create: { user_id: req.aiUser.id, default_wallet_id: wid, last_used_wallet_id: wid }
        });
      } catch (e) {
        return res.status(500).json({ ok:false, error: 'persist_failed', details: e?.message || String(e) });
      }
    } else {
      RUNTIME_DEFAULT_WALLET_ID = wid;
    }
    return res.json({ ok:true, wallet_id: wid });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'error' });
  }
});

// Helper: read Realtime instructions from prompts file or env
function readRealtimeInstructions() {
  try {
    const envInstr = String(process.env.TOKEN_AI_REALTIME_INSTRUCTIONS || '').trim();
    if (envInstr) return envInstr;
  } catch {}
  try {
    const p = path.join(TOKEN_AI_DIR, 'prompts', 'realtime.instructions.md');
    if (fs.existsSync(p)) return String(fs.readFileSync(p, 'utf8') || '').trim();
  } catch {}
  return '';
}

function computeBootstrapVersion({ model, voice, instructions, tools }) {
  try {
    const h = crypto.createHash('sha1');
    h.update(String(model||''));
    h.update('\n');
    h.update(String(voice||''));
    h.update('\n');
    h.update(String(instructions||''));
    h.update('\n');
    try { h.update(JSON.stringify(tools||[])); } catch { h.update('[]'); }
    return h.digest('hex').slice(0, 12);
  } catch { return null; }
}
