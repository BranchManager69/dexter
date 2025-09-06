import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import OpenAI from 'openai';
import { getRealtimeTools } from '../../core/realtime-tools.js';

export function registerRealtimeRoutes(app, { port, tokenAiDir }) {
  // Directories
  const VOICE_DIR = path.join(tokenAiDir, 'reports', 'voice-debug');
  const VOICE_LOG_LIMIT = Number(process.env.TOKEN_AI_VOICE_LOG_LIMIT || 1000);

  // In-memory Realtime Voice Debug log (ring buffer)
  const voiceLog = { seq: 0, lines: [] }; // { id, at, ip, ua, session, level, msg, extra, t }
  function pushVoiceLines(ip, ua, session, items) {
    const added = [];
    for (const it of items) {
      const rec = {
        id: ++voiceLog.seq,
        at: Date.now(),
        ip,
        ua,
        session: String(session || '') || null,
        level: String(it?.level || 'info'),
        msg: String(it?.msg || ''),
        extra: (it?.extra != null ? it.extra : null),
        t: String(it?.t || '')
      };
      voiceLog.lines.push(rec);
      added.push(rec);
    }
    if (voiceLog.lines.length > VOICE_LOG_LIMIT) {
      voiceLog.lines.splice(0, voiceLog.lines.length - VOICE_LOG_LIMIT);
    }
    return added.length;
  }

  // JWT-free realtime endpoints (protected by x-agent-token for non-local callers)
  app.post('/realtime/debug-log', (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const ua = req.headers['user-agent'] || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error: 'forbidden' });
      }
      const body = req.body || {};
      const session = String(body.session || '');
      let lines = [];
      if (Array.isArray(body.lines)) lines = body.lines;
      else if (body.line) lines = [body.line];
      else if (body.msg) lines = [{ level: body.level || 'info', msg: body.msg, extra: body.extra }];
      if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ ok:false, error:'no_lines' });
      const n = pushVoiceLines(ip, ua, session, lines);
      return res.json({ ok:true, added:n, size: voiceLog.lines.length, seq: voiceLog.seq });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  app.get('/realtime/debug-log', (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error: 'forbidden' });
      }
      const lim = Math.max(1, Math.min(1000, parseInt(String(req.query.limit||'100'),10)||100));
      const qSession = String(req.query.session||'');
      let items = voiceLog.lines;
      if (qSession) items = items.filter(x => String(x.session||'') === qSession);
      items = items.slice(-lim);
      return res.json({ ok:true, limit: lim, size: voiceLog.lines.length, items });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  app.delete('/realtime/debug-log', (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error: 'forbidden' });
      }
      const qSession = String(req.query.session||'');
      if (qSession) {
        const before = voiceLog.lines.length;
        voiceLog.lines = voiceLog.lines.filter(x => String(x.session||'') !== qSession);
        return res.json({ ok:true, size: voiceLog.lines.length, removed: before - voiceLog.lines.length });
      }
      voiceLog.lines = [];
      return res.json({ ok:true, size: 0 });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  app.post('/realtime/debug-save', (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error: 'forbidden' });
      }
      const session = String(req.body?.session || '').trim();
      const note = String(req.body?.note || '').trim();
      const items = voiceLog.lines.filter(x => !session || String(x.session||'') === session);
      if (!items.length) return res.status(404).json({ ok:false, error:'no_logs' });
      try { fs.mkdirSync(VOICE_DIR, { recursive: true }); } catch {}
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      const sessShort = session ? String(session).slice(0,8) : 'all';
      const file = `voice-debug-${ts}-${sessShort}.json`;
      const abs = path.join(VOICE_DIR, file);
      const payload = { saved_at: new Date().toISOString(), session: session || null, note: note || null, count: items.length, items };
      fs.writeFileSync(abs, JSON.stringify(payload, null, 2), 'utf8');
      return res.json({ ok:true, file, path: abs, saved: items.length });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  app.get('/realtime/health', (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error: 'forbidden' });
      }
      const qSession = String(req.query.session||'');
      const lines = voiceLog.lines.filter(x => !qSession || String(x.session||'') === qSession);
      const sessions = new Map();
      const getS = (sid)=>{ const s=sessions.get(sid)||{ session:sid||null, count:0, errors:0, lastAt:0, lastMsg:null, dcOpenAt:null, dcCloseAt:null, lastIce:null, lastConnState:null, sdpStatus:null, mintedAt:null, on:false }; sessions.set(sid,s); return s; };
      for (const l of lines) {
        const sid = String(l.session||'');
        const s = getS(sid);
        s.count++; s.lastAt = Math.max(s.lastAt, l.at||0); s.lastMsg = l.msg || s.lastMsg;
        const msg = (l.msg||'').toLowerCase();
        if (l.level === 'error') s.errors++;
        if (msg.includes('ws.open')) s.dcOpenAt = l.at;
        if (msg.includes('ws.close')) s.dcCloseAt = l.at;
        if (msg.includes('ice.connection') && l.t) s.lastIce = l.t; // connected/disconnected
        if (msg.includes('pc.connection') && l.t) s.lastConnState = l.t; // connected/disconnected
        if (msg.includes('sdp.')) s.sdpStatus = l.t || null; // offer/answer sent/failed
        if (msg.includes('minted.session')) s.mintedAt = l.at;
        if (msg.includes('voice.on')) s.on = true;
        if (msg.includes('voice.off')) s.on = false;
      }
      const now = Date.now();
      const out = Array.from(sessions.values()).map(s => {
        const since = now - (s.lastAt || now);
        const status = s.errors > 0 ? 'error' : (since > 60000 ? 'warn' : 'ok');
        return { ...s, status, since };
      });
      const total = lines.length;
      const active = out.filter(s=> s.on || s.lastIce==='connected' || s.lastConnState==='connected').length;
      const globalStatus = out.some(s=> s.status==='error') ? 'error' : (out.some(s=> s.status==='warn') ? 'warn' : 'ok');
      return res.json({ ok:true, total, active, status: globalStatus, sessions: out, generated_at: now });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  // Ephemeral OpenAI Realtime session token minting
  app.post('/realtime/sessions', async (req, res) => {
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

      const body = req.body || {};
      const model = String(body.model || process.env.TOKEN_AI_REALTIME_MODEL || 'gpt-realtime');
      const voice = String(body.voice || process.env.TOKEN_AI_REALTIME_VOICE || 'verse');
      const instructions = String(body.instructions || readRealtimeInstructions() || '').trim();
      const modalities = Array.isArray(body.modalities) ? body.modalities : ['audio', 'text'];
      const turnDetection = body.turn_detection || { type: 'server_vad' };

      const payload = {
        model,
        voice,
        modalities,
        turn_detection: turnDetection,
        ...(instructions ? { instructions } : {}),
      };

      const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${OPENAI_API_KEY}`,
          'content-type': 'application/json',
          'openai-beta': 'realtime=v1',
        },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const t = await r.text().catch(()=> '');
        return res.status(502).json({ ok:false, error:`openai_${r.status}`, details: t.slice(0,400) });
      }

      const j = await r.json();
      return res.json({ ok:true, id: j.id, client_secret: j.client_secret, model: j.model, expires_at: j.expires_at, voice });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  // Bootstrap payload: instructions + tools
  app.get('/realtime/bootstrap', (req, res) => {
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
      let updatedAt = Date.now();
      try {
        const instrPath = path.join(tokenAiDir, 'prompts', 'realtime.instructions.md');
        const toolsPath = path.join(tokenAiDir, 'core', 'realtime-tools.js');
        const mt1 = fs.existsSync(instrPath) ? (fs.statSync(instrPath).mtimeMs||0) : 0;
        const mt2 = fs.existsSync(toolsPath) ? (fs.statSync(toolsPath).mtimeMs||0) : 0;
        updatedAt = Math.max(mt1, mt2, updatedAt);
      } catch {}
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

  app.get('/realtime/tools', (req, res) => {
    try { return res.json({ ok:true, tools: getRealtimeTools() }); } catch (e) { return res.status(500).json({ ok:false, error: e?.message || 'error' }); }
  });

  app.get('/realtime/instructions', (req, res) => {
    try { return res.json({ ok:true, instructions: readRealtimeInstructions() }); } catch (e) { return res.status(500).json({ ok:false, error: e?.message || 'error' }); }
  });

  // Lightweight tool-call bridge used by the browser UI
  app.post('/realtime/tool-call', async (req, res) => {
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
      async function uiFetch(urlPath, init){
        const url = new URL(`http://localhost:${port}${urlPath}`);
        const r = await fetch(url, init);
        const txt = await r.text();
        try { return { ok: r.ok, status: r.status, body: JSON.parse(txt) }; } catch { return { ok: r.ok, status: r.status, body: txt }; }
      }
      async function mcpCall(toolName, toolArgs){
        const MCP_BASE = (process.env.TOKEN_AI_MCP_URL || `http://localhost:${Number(process.env.TOKEN_AI_MCP_PORT || 3930)}/mcp`).replace(/\/$/, '');
        const TOKEN = process.env.TOKEN_AI_MCP_TOKEN || '';
        const XUSER = String((req.headers['x-user-token']||'')).trim();
        const initBody = JSON.stringify({ jsonrpc:'2.0', id: '1', method:'initialize', params:{ clientInfo:{ name:'voice-bridge', version:'0.1' }, protocolVersion:'2024-11-05', capabilities:{} } });
        const ctrl = new AbortController();
        const initResp = await fetch(`${MCP_BASE}`, {
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
        const r2 = await fetch(`${MCP_BASE}`, {
          method:'POST',
          headers: { 'Authorization': TOKEN ? `Bearer ${TOKEN}` : '', ...(XUSER? { 'X-User-Token': XUSER } : {}), 'Accept':'application/json', 'Content-Type':'application/json', 'Mcp-Session-Id': sid },
          body: callBody,
        });
        const txt = await r2.text();
        // Parse JSON or SSE-encoded JSON (last data: line)
        try { return JSON.parse(txt); } catch {
          try {
            const idx = txt.lastIndexOf('data: ');
            if (idx >= 0) {
              const json = txt.slice(idx + 6).trim();
              return JSON.parse(json);
            }
          } catch {}
          return { ok:false, error:'mcp_bad_json', raw: txt.slice(0,2000) };
        }
      }

      if (name === 'mcp_tools_list') {
        try {
          const MCP_BASE = (process.env.TOKEN_AI_MCP_URL || `http://localhost:${Number(process.env.TOKEN_AI_MCP_PORT || 3930)}/mcp`).replace(/\/$/, '');
          const TOKEN = process.env.TOKEN_AI_MCP_TOKEN || '';
          const XUSER = String((req.headers['x-user-token']||'')).trim();
          const initBody = JSON.stringify({ jsonrpc:'2.0', id: '1', method:'initialize', params:{ clientInfo:{ name:'voice-bridge', version:'0.1' }, protocolVersion:'2024-11-05', capabilities:{} } });
          const ctrl = new AbortController();
          const initResp = await fetch(`${MCP_BASE}`, {
            method:'POST',
            headers: { 'Authorization': TOKEN ? `Bearer ${TOKEN}` : '', ...(XUSER? { 'X-User-Token': XUSER } : {}), 'Accept':'application/json, text/event-stream', 'Content-Type':'application/json' },
            body: initBody,
            signal: ctrl.signal,
          }).catch(e=>({ ok:false, headers:new Headers(), statusText:String(e?.message||e) }));
          let sid = '';
          try { sid = initResp?.headers?.get?.('mcp-session-id') || ''; } catch {}
          try { ctrl.abort(); } catch {}
          if (!sid) return res.status(502).json({ ok:false, error:'mcp_no_session' });
          const listBody = JSON.stringify({ jsonrpc:'2.0', id:'2', method:'tools/list', params:{} });
          const r2 = await fetch(`${MCP_BASE}`, {
            method:'POST',
            headers: { 'Authorization': TOKEN ? `Bearer ${TOKEN}` : '', ...(XUSER? { 'X-User-Token': XUSER } : {}), 'Accept':'application/json', 'Content-Type':'application/json', 'Mcp-Session-Id': sid },
            body: listBody,
          });
          const txt = await r2.text();
          // Accept either plain JSON or SSE-encoded JSON
          let obj = null;
          try { obj = JSON.parse(txt); } catch {
            try {
              // Extract last data: {...} block from SSE stream
              const idx = txt.lastIndexOf('data: ');
              if (idx >= 0) {
                const json = txt.slice(idx + 6).trim();
                obj = JSON.parse(json);
              }
            } catch {}
          }
          const tools = obj?.result?.tools || obj?.tools || [];
          return res.json({ ok:true, tools, raw: obj });
        } catch (e) {
          return res.status(502).json({ ok:false, error:'mcp_list_failed', details: String(e?.message||e) });
        }
      }

      if (name === 'list_managed_wallets') {
        try {
          if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
          const { listManagedWallets } = await import('../../trade-manager/wallet-utils.js');
          const includeAdmin = String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1';
          const externalUserId = (req.aiUser && req.aiUser.extUserId != null) ? req.aiUser.extUserId : null;
          let wallets = await listManagedWallets({ externalUserId, includeAdmin });
          // Optional filtering
          const s = String((args?.search ?? '')).trim();
          if (s) {
            const q = s.toLowerCase();
            wallets = wallets.filter(w => {
              const name = String(w.wallet_name || '').toLowerCase();
              const pk = String(w.public_key || '').toLowerCase();
              return name.includes(q) || pk.startsWith(q) || pk.endsWith(q);
            });
          }
          // Paging
          let limit = Math.min(100, Math.max(1, parseInt(String(args?.limit ?? '25'), 10) || 25));
          let offset = Math.max(0, parseInt(String(args?.offset ?? '0'), 10) || 0);
          const slice = wallets.slice(offset, offset + limit);
          return res.json({ ok:true, wallets: slice, total: wallets.length, limit, offset });
        } catch (e) {
          return res.status(500).json({ ok:false, error:'wallet_list_failed', details: e?.message || String(e) });
        }
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
        try {
          const q = String(args?.query || args?.symbol || '').trim();
          const chain = String(args?.chain || 'solana').toLowerCase();
          const limit = Number(args?.limit) || 5;
          if (!q) return res.status(400).json({ ok:false, error:'missing_query' });
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
          const tokenMap = new Map();
          const targetSymbol = q.toUpperCase();
          for (const p of pairs) {
            if ((p?.chainId||'').toLowerCase() !== chain) continue;
            const base = p.baseToken || p.base || {};
            const quote = p.quoteToken || p.quote || {};
            const addr = base.address; if (!addr) continue;
            const quoteSymbol = (quote.symbol || '').toUpperCase();
            const quoteLiq = Number(p?.liquidity?.quote || 0) || 0;
            let realLiquidityUsd = 0;
            if (quoteSymbol === 'SOL') realLiquidityUsd = quoteLiq * solPrice;
            else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') realLiquidityUsd = quoteLiq;
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
          let tokens = Array.from(tokenMap.values()).map(token => {
            const exactMatch = token.symbol === targetSymbol ? 1000 : 0;
            const partialMatch = (!exactMatch && token.symbol.includes(targetSymbol)) ? 200 : 0;
            const liquidityScore = Math.log10(1 + token.quote_liquidity_usd) * 20;
            const volumeScore = Math.log10(1 + token.volume_24h) * 15;
            let momentumBonus = 0;
            if (token.volume_24h > 1000000) momentumBonus = 200;
            else if (token.volume_24h > 500000) momentumBonus = 100;
            else if (token.volume_24h > 100000) momentumBonus = 50;
            const liquidityRatio = token.liquidity_usd > 0 ? (token.quote_liquidity_usd / token.liquidity_usd) : 1;
            const scamPenalty = liquidityRatio < 0.001 ? -500 : 0;
            const isLikelyScam = liquidityRatio < 0.001;
            let deadTokenPenalty = 0;
            if (token.volume_24h < 1000) deadTokenPenalty = -200;
            else if (token.volume_24h < 10000) deadTokenPenalty = -100;
            const score = exactMatch + partialMatch + liquidityScore + volumeScore + momentumBonus + token.pair_count * 5 + scamPenalty + deadTokenPenalty;
            return {
              ...token,
              price_usd: 0,
              confidence: 0,
              liquidity_ratio: liquidityRatio,
              is_likely_scam: isLikelyScam,
              score,
              score_breakdown: { exact_match: exactMatch, partial_match: partialMatch, liquidity_score: liquidityScore, volume_score: volumeScore, momentum_bonus: momentumBonus, evidence_count: token.pair_count * 5, base_role: 0, quote_bonus: 0, scam_penalty: scamPenalty, dead_token_penalty: deadTokenPenalty, total: score }
            };
          });
          tokens = tokens.filter(t => !t.is_likely_scam);
          tokens.sort((a, b) => b.score - a.score);
          tokens = tokens.slice(0, limit);
          const totalScore = tokens.reduce((sum, t) => sum + t.score, 0);
          tokens.forEach(t => { t.confidence = totalScore > 0 ? Math.round((t.score / totalScore) * 100) : 0; });
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
      // Wallet tools (thin MCP bridge for local function tools)
      if (name === 'list_managed_wallets') {
        const search = String(args?.search || '');
        const limit = Number.isFinite(Number(args?.limit)) ? Number(args.limit) : 100;
        const offset = Number.isFinite(Number(args?.offset)) ? Number(args.offset) : 0;
        const include_admin = !!args?.include_admin;
        const out = await mcpCall('list_managed_wallets', { search, limit, offset, include_admin });
        return res.json(out);
      }
      if (name === 'list_aliases') {
        const out = await mcpCall('list_aliases', {});
        return res.json(out);
      }
      if (name === 'add_wallet_alias') {
        const wallet_id = String(args?.wallet_id || '');
        const alias = String(args?.alias || '');
        if (!wallet_id || !alias) return res.status(400).json({ ok:false, error:'missing_wallet_or_alias' });
        const out = await mcpCall('add_wallet_alias', { wallet_id, alias });
        return res.json(out);
      }
      if (name === 'set_default_wallet') {
        // Pass through whatever selector the model provides
        const payload = {};
        for (const k of ['wallet_id','alias','wallet_alias','wallet_hint','wallet']) {
          if (args?.[k] != null) payload[k] = args[k];
        }
        const out = await mcpCall('set_default_wallet', payload);
        return res.json(out);
      }
      if (name === 'list_wallet_token_balances') {
        const wallet_id = String(args?.wallet_id || '');
        if (!wallet_id) return res.status(400).json({ ok:false, error:'missing_wallet_id' });
        const min_ui = (args?.min_ui != null) ? Number(args.min_ui) : undefined;
        const limit = (args?.limit != null) ? Number(args.limit) : undefined;
        const payload = { wallet_id };
        if (min_ui != null && Number.isFinite(min_ui)) payload.min_ui = min_ui;
        if (limit != null && Number.isFinite(limit)) payload.limit = limit;
        const out = await mcpCall('list_wallet_token_balances', payload);
        return res.json(out);
      }
      if (name === 'get_wallet_holdings') {
        const wallet_address = String(args?.wallet_address || '');
        if (!wallet_address) return res.status(400).json({ ok:false, error:'missing_wallet_address' });
        const out = await mcpCall('get_wallet_holdings', { wallet_address });
        return res.json(out);
      }
      if (name === 'get_token_ohlcv') {
        try {
          const mint = String(args?.mint || '').trim();
          if (!mint || mint.length < 32) return res.status(400).json({ ok:false, error:'invalid_mint' });
          const hours = Math.min(Math.max(parseInt(String(args?.hours||'6'),10)||6, 1), 336);
          const url = new URL(`http://localhost:${port}/ohlcv`);
          url.searchParams.set('mint', mint);
          url.searchParams.set('hours', String(hours));
          const r = await fetch(url.toString());
          const data = await r.json();
          if (!r.ok || !data.ok) {
            return res.status(r.status || 500).json({ ok:false, error: data?.error || 'ohlcv_failed' });
          }
          const candles = data.candles || [];
          const summary = {
            mint,
            hours,
            candles: candles.length,
            interval: data.interval,
            latest_price: candles[candles.length-1]?.c || null,
            high_24h: Math.max(...candles.map(c => c.h || 0)),
            low_24h: Math.min(...candles.filter(c => c.l > 0).map(c => c.l)),
            change_pct: candles.length >= 2 ? ((candles[candles.length-1].c - candles[0].o) / candles[0].o * 100) : 0,
          };
          return res.json({ ok:true, summary, candles });
        } catch (e) {
          return res.status(500).json({ ok:false, error:'ohlcv_error', details: e?.message || String(e) });
        }
      }

      // Forward common trade and wallet tools to MCP if not handled above
      try {
        const forwardNames = new Set([
          'execute_buy','execute_sell','execute_sell_all',
          'execute_buy_preview','execute_sell_preview',
          'list_wallet_token_balances'
        ]);
        if (forwardNames.has(name)) {
          // Sanitize empty-string search to undefined for MCP schemas that disallow ""
          try { if (name === 'list_managed_wallets' && typeof args?.search === 'string' && args.search.trim() === '') { delete args.search; } } catch {}
          const out = await mcpCall(name, args);
          if (out && (out.result != null || out.ok)) {
            return res.json({ ok:true, mcp: out });
          }
          return res.status(502).json({ ok:false, error: out?.error || 'mcp_forward_failed', mcp: out || null });
        }
      } catch {}

      return res.status(400).json({ ok:false, error:'unknown_tool' });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  function readRealtimeInstructions() {
    try {
      const envInstr = String(process.env.TOKEN_AI_REALTIME_INSTRUCTIONS || '').trim();
      if (envInstr) return envInstr;
    } catch {}
    try {
      const p = path.join(tokenAiDir, 'prompts', 'realtime.instructions.md');
      if (fs.existsSync(p)) return String(fs.readFileSync(p, 'utf8') || '').trim();
    } catch {}
    return '';
  }

  function computeBootstrapVersion({ model, voice, instructions, tools }) {
    try {
      const h = crypto.createHash('sha1');
      h.update(String(model||'')); h.update('\n');
      h.update(String(voice||'')); h.update('\n');
      h.update(String(instructions||'')); h.update('\n');
      try { h.update(JSON.stringify(tools||[])); } catch { h.update('[]'); }
      return h.digest('hex').slice(0, 12);
    } catch { return null; }
  }
}

export default { registerRealtimeRoutes };
