// public/js/live/tools.js
// Tool calling and confirmation flow handling for Live UI

// Tool state
const toolBuf = new Map(); // key: itemId or callId -> rec
const toolMap = new Map(); // itemId -> callId
const pendingOutputs = new Map(); // itemId -> outputData

function emitFunctionOutput(rec, outputData) {
  try {
    const callId = rec?.callId || toolMap.get(rec?.itemId) || null;
    if (!callId || !String(callId).startsWith('call_')) {
      // Defer until we learn the call_id (from response.done)
      if (rec?.itemId) pendingOutputs.set(rec.itemId, outputData);
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'defer function_call_output', { item_id: rec?.itemId });
      return false;
    }
    if (window.LiveVoice?.voice?.dc) {
      window.LiveVoice.voice.dc.send(JSON.stringify({ 
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(outputData)
        }
      }));
    }
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'sent function_call_output', { call_id: callId });
    // Trigger a response so the model speaks about the result
    if (window.LiveVoice?.voice?.dc) {
      window.LiveVoice.voice.dc.send(JSON.stringify({ type: 'response.create' }));
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'sent response.create');
    }
    return true;
  } catch {
    return false;
  }
}
let pendingConfirm = null; // { address, symbol, name }
let lastResolveList = [];
let pendingCandidates = null; // [{address,symbol,name,liquidity_usd}]

/**
 * Helper functions for confirmation flow
 */
function isYes(text) { 
  const s = String(text || '').toLowerCase(); 
  return /\b(yes|yep|yeah|sure|proceed|go ahead|do it|start|confirm|okay|ok)\b/.test(s); 
}

function isNo(text) { 
  const s = String(text || '').toLowerCase(); 
  return /\b(no|nope|cancel|stop|don\'t|do not|abort)\b/.test(s); 
}

function wordToIndex(s) { 
  const m = String(s).toLowerCase(); 
  if (/^first\b|\b1(st)?\b/.test(m)) return 0; 
  if (/^second\b|\b2(nd)?\b/.test(m)) return 1; 
  if (/^third\b|\b3(rd)?\b/.test(m)) return 2; 
  const n = parseInt(m, 10); 
  return Number.isFinite(n) && n > 0 ? (n - 1) : -1; 
}

function parseLiquidity(text) { 
  try { 
    const m = String(text).toLowerCase().match(/\$?([0-9]+(?:\.[0-9]+)?)(\s*[mk])?/); 
    if (!m) return null; 
    let val = parseFloat(m[1]); 
    const unit = (m[2] || '').trim(); 
    if (unit === 'm') val *= 1_000_000; 
    if (unit === 'k') val *= 1_000; 
    return val; 
  } catch { 
    return null; 
  } 
}

function pickByAddrHint(text, list) { 
  const t = String(text).replace(/[^a-zA-Z0-9]/g, ''); 
  if (t.length < 3) return -1; 
  const L = t.slice(-6); 
  const U = t.toUpperCase(); 
  let best = -1; 
  for (let i = 0; i < list.length; i++) { 
    const a = String(list[i].address || '').toUpperCase(); 
    if (!a) continue; 
    if (a.endsWith(U) || a.startsWith(U) || a.includes(U) || a.endsWith(L.toUpperCase())) { 
      best = i; 
      break; 
    } 
  } 
  return best; 
}

function pickByLiquidity(val, list) { 
  if (!Number.isFinite(val)) return -1; 
  let best = -1, bestDiff = Infinity; 
  for (let i = 0; i < list.length; i++) { 
    const liq = Number(list[i].liquidity_usd || 0) || 0; 
    const diff = Math.abs(liq - val); 
    if (diff < bestDiff) { 
      best = i; 
      bestDiff = diff; 
    } 
  } 
  return best; 
}

function selectCandidate(text, list) { 
  if (!Array.isArray(list) || !list.length) return -1; 
  const idx = wordToIndex(text); 
  if (idx >= 0 && idx < list.length) return idx; 
  const addrIdx = pickByAddrHint(text, list); 
  if (addrIdx >= 0) return addrIdx; 
  const liq = parseLiquidity(text); 
  if (liq != null) { 
    const i = pickByLiquidity(liq, list); 
    if (i >= 0) return i; 
  } 
  return -1; 
}

/**
 * Check pending confirmation flow
 */
async function checkPendingConfirm(text) {
  try {
    if (pendingCandidates && Array.isArray(pendingCandidates) && pendingCandidates.length) {
      const selIdx = selectCandidate(text, pendingCandidates);
      if (selIdx >= 0) {
        const choice = pendingCandidates[selIdx]; 
        pendingCandidates = null; 
        pendingConfirm = { 
          address: choice.address, 
          symbol: choice.symbol || null, 
          name: choice.name || null 
        };
        const addrShort = choice.address ? `${choice.address.slice(0, 4)}…${choice.address.slice(-4)}` : '';
        const lab = `${choice.symbol || choice.name || 'token'} ${addrShort}`;
        
        if (window.LiveVoice?.voice?.dc) {
          window.LiveVoice.voice.dc.send(JSON.stringify({ 
            type: 'response.create', 
            response: { instructions: `Selected ${lab}. Say "yes" to start analysis, or "no" to cancel.` } 
          }));
        }
        
        if (window.LiveDebug?.vd) {
          window.LiveDebug.vd.add('info', 'candidate selected', { 
            index: selIdx, 
            address: choice.address 
          });
        }
        return true;
      }
    }
    
    if (!pendingConfirm) return false;
    
    if (isYes(text)) {
      const sel = pendingConfirm; 
      pendingConfirm = null;
      const hdr = { 'content-type': 'application/json' }; 
      try { 
        if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
        if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN); 
      } catch {}
      // No transcript-based fallback — require proper tool arguments

      try {
        const r = await fetch(window.LiveUtils.api('/realtime/tool-call'), { 
          method: 'POST', 
          headers: hdr, 
          body: JSON.stringify({ name: 'run_agent', args: { mint: sel.address } }) 
        });
        const j = await r.json().catch(() => ({}));
        const addrShort = sel.address ? `${sel.address.slice(0, 4)}…${sel.address.slice(-4)}` : '';
        const lab = `${sel.symbol || sel.name || 'token'} ${addrShort}`;
        const msg = j?.ok ? `Starting analysis for ${lab}.` : `Failed to start analysis for ${lab}.`;
        
        if (window.LiveVoice?.voice?.dc) {
          window.LiveVoice.voice.dc.send(JSON.stringify({ 
            type: 'response.create', 
            response: { instructions: msg } 
          }));
        }
        
        if (window.LiveDebug?.vd) {
          window.LiveDebug.vd.add(j?.ok ? 'info' : 'error', 'confirm->run_agent', { 
            mint: sel.address, 
            result: j 
          });
        }
      } catch (e) {
        if (window.LiveDebug?.vd) {
          window.LiveDebug.vd.add('error', 'confirm->run_agent error', { 
            error: String(e?.message || e) 
          });
        }
      }
      return true;
    }
    
    if (isNo(text)) {
      const sel = pendingConfirm; 
      pendingConfirm = null;
      const addrShort = sel.address ? `${sel.address.slice(0, 4)}…${sel.address.slice(-4)}` : '';
      const lab = `${sel.symbol || sel.name || 'token'} ${addrShort}`;
      
      if (window.LiveVoice?.voice?.dc) {
        window.LiveVoice.voice.dc.send(JSON.stringify({ 
          type: 'response.create', 
          response: { instructions: `Cancelled ${lab}. You can say another token name or symbol.` } 
        }));
      }
      
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('info', 'confirm->cancel', { address: sel.address });
      }
      return true;
    }
  } catch {}
  return false;
}

/**
 * Event normalization function to handle both function_call and mcp_call events
 */
function normalizeToolEvent(msg) {
  if (!msg) return msg;
  
  // MCP call events -> function call events
  if (msg.type === 'response.mcp_call.created') {
    return { ...msg, type: 'response.function_call.created', callType: 'mcp' };
  }
  if (msg.type === 'response.mcp_call.arguments.delta' || 
      msg.type === 'response.mcp_call_arguments.delta') {
    return { ...msg, type: 'response.function_call_arguments.delta', callType: 'mcp' };
  }
  if (msg.type === 'response.mcp_call.completed' || 
      msg.type === 'response.mcp_call.done') {
    return { ...msg, type: 'response.function_call.completed', callType: 'mcp' };
  }
  
  // Pass through regular events
  return msg;
}

/**
 * Handle tool frames from voice messages
 */
async function handleToolFrames(msg) {
  try {
    if (!msg || !msg.type) return;
    
  // Normalize event types to handle both function_call and mcp_call uniformly
  msg = normalizeToolEvent(msg);
  
  // Some streams emit a function_call as an output item; capture id+name here
  if (msg.type === 'response.output_item.added' && msg.item && (msg.item.type === 'function_call' || msg.item.name)) {
    const itemId = msg.item.id || msg.id || null;
    const callId = msg.item.call_id || msg.item.callId || null;
    const name = msg.item.name || null;
    if (itemId && name) {
      const rec = { name, args: '', itemId, callId };
      toolBuf.set(itemId, rec);
      if (callId) toolBuf.set(callId, rec);
      if (itemId && callId) toolMap.set(itemId, callId);
      try { window.LiveTools._currentCallId = itemId; } catch {}
      // Avoid duplicate 'tool created' spam; this event sometimes mirrors 'function_call.created'
      try {
        window.LiveTools._seenToolCreates = window.LiveTools._seenToolCreates || new Set();
        if (!window.LiveTools._seenToolCreates.has(itemId)) {
          window.LiveTools._seenToolCreates.add(itemId);
          if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'tool created', { id: itemId, name });
        }
      } catch {}
    }
  }

  // On response.done, backfill call_id and flush any deferred outputs
  if (msg.type === 'response.done' && msg.response && Array.isArray(msg.response.output)) {
    try {
      for (const it of msg.response.output) {
        if (it && it.type === 'function_call') {
          const itemId = it.id;
          const callId = it.call_id || it.callId;
          if (itemId && callId) {
            toolMap.set(itemId, callId);
            const rec = toolBuf.get(itemId);
            if (rec) rec.callId = callId;
            const pending = pendingOutputs.get(itemId);
            if (pending) {
              emitFunctionOutput({ itemId, callId, name: rec?.name || 'tool' }, pending);
              pendingOutputs.delete(itemId);
            }
          }
        }
      }
    } catch {}
  }

  if (msg.type === 'response.function_call.created') {
    const id = msg.id || msg.call_id || (msg.item?.id) || null; 
    const name = msg.name || msg.function?.name || msg.item?.name || null;
    const callId = msg.call_id || msg.item?.call_id || null;
    if (!id || !name) return; 
    const rec = { name, args: '', itemId: id, callId };
    toolBuf.set(id, rec);
    if (callId) toolBuf.set(callId, rec);
      const callLabel = msg.callType === 'mcp' ? 'MCP tool' : 'tool';
      try {
        window.LiveTools._seenToolCreates = window.LiveTools._seenToolCreates || new Set();
        if (!window.LiveTools._seenToolCreates.has(id)) {
          window.LiveTools._seenToolCreates.add(id);
          if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', `${callLabel} created`, { id, name });
        }
      } catch {}
      return;
    }

  // Some streams emit a final arguments.done frame that includes call_id.
  // Capture it early to avoid deferring function_call_output unnecessarily.
  if (msg.type === 'response.function_call_arguments.done') {
    const itemId = msg.id || msg.item?.id || window.LiveTools?._currentCallId || null;
    const callId = msg.call_id || msg.item?.call_id || null;
    if (itemId && callId) {
      toolMap.set(itemId, callId);
      const rec = toolBuf.get(itemId);
      if (rec) rec.callId = callId;
      const pending = pendingOutputs.get(itemId);
      if (pending) {
        emitFunctionOutput({ itemId, callId, name: rec?.name || 'tool' }, pending);
        pendingOutputs.delete(itemId);
      }
    }
  }
    
  if (msg.type === 'response.function_call.arguments.delta' || msg.type === 'response.function_call_arguments.delta') {
    let id = msg.id || msg.call_id || (msg.item?.id) || null; 
    if (!id) { try { id = window.LiveTools?._currentCallId || null; } catch {} }
    if (!id) return;
    let rec = toolBuf.get(id);
    if (!rec) { rec = { name: 'unknown', args: '' }; toolBuf.set(id, rec); }
    // Be liberal in what we accept: some frames provide `delta` as a string,
    // others may nest it under `arguments.delta`.
    let chunk = '';
    if (typeof msg.delta === 'string') chunk = msg.delta;
    else if (typeof msg.arguments === 'string') chunk = msg.arguments;
    else if (msg.arguments && typeof msg.arguments.delta === 'string') chunk = msg.arguments.delta;
    else if (msg.delta && typeof msg.delta.arguments === 'string') chunk = msg.delta.arguments;
    if (chunk) rec.args += String(chunk);
    return;
  }
    
  if (msg.type === 'response.function_call.completed' || msg.type === 'response.output_item.done') {
    let id = msg.id || msg.call_id || (msg.item?.id) || null; 
    if (!id) { try { id = window.LiveTools?._currentCallId || null; } catch {} }
    if (!id) return; 
    let rec = toolBuf.get(id); 
    if (!rec) return; 
    // If no streamed args were captured, try to read full args off the item
    if (!rec.args) {
      try {
        if (typeof msg.item?.arguments === 'string') rec.args = msg.item.arguments;
        else if (typeof msg.arguments === 'string') rec.args = msg.arguments;
        else if (typeof msg.item?.content?.arguments === 'string') rec.args = msg.item.content.arguments;
      } catch {}
    }
    // Clean up both item and call keys
    try {
      toolBuf.delete(id);
      const mapped = toolMap.get(rec.itemId);
      if (mapped) toolBuf.delete(mapped);
      try { toolMap.delete(rec.itemId); } catch {}
    } catch {}
    try { if (window.LiveTools?._currentCallId === id) window.LiveTools._currentCallId = null; } catch {}
      
      let argsObj = {}; 
      try { 
        argsObj = rec.args ? JSON.parse(rec.args) : {}; 
      } catch { 
        // Tolerant fallback: extract query/symbol by regex from partial JSON stream
        try {
          const raw = String(rec.args || '');
          const q = raw.match(/"query"\s*:\s*"([^"]*)"/i);
          const s = raw.match(/"symbol"\s*:\s*"([^"]*)"/i);
          const query = q && q[1] ? q[1] : (s && s[1] ? s[1] : '');
          if (query) argsObj = { query };
          else argsObj = {};
        } catch { argsObj = {}; }
      }
      
      const callLabel = msg.callType === 'mcp' ? 'MCP tool' : 'tool';
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('info', `${callLabel} completed`, { 
          id, 
          name: rec.name, 
          args: argsObj 
        });
      }
      
      // If this was an MCP call, Realtime executes it server-side and may embed
      // the tool output in the completion frame (e.g., an "output" string).
      // Surface high‑value details (e.g., tx hash) to the debug panel so users
      // get the Solscan link and other metadata without duplicating the call.
      if (msg.callType === 'mcp') {
        try {
          let rawOut = null;
          // Attempt to extract output payload from known fields
          if (typeof msg.output === 'string' && msg.output) rawOut = msg.output;
          else if (typeof msg.result === 'string' && msg.result) rawOut = msg.result;
          else if (typeof msg.item?.output === 'string' && msg.item.output) rawOut = msg.item.output;

          // Heuristics: trading tools return content like "tx=<SIG>" in text output
          // Extract base58-ish signature if present
          let txHash = null;
          if (typeof rawOut === 'string') {
            const m = rawOut.match(/tx=([1-9A-HJ-NP-Za-km-z]{32,88})/);
            if (m && m[1]) txHash = m[1];
          }

          // Build a compact result payload for the debug panel
          const payload = { mcp: {} };
          if (txHash) {
            payload.mcp.tx_hash = txHash;
            payload.mcp.solscan_url = `https://solscan.io/tx/${txHash}`;
          }
          // If we couldn't parse a tx, still emit a marker so the panel shows completion
          if (!txHash && rawOut) payload.mcp.raw = String(rawOut).slice(0, 2000);

          if (window.LiveDebug?.vd) {
            window.LiveDebug.vd.add('info', 'tool result', {
              name: rec.name,
              // Do not truncate: keep JSON intact so the panel can parse tx_hash
              result: JSON.stringify(payload)
            });
          }
        } catch (e) {
          try { if (window.LiveDebug?.vd) window.LiveDebug.vd.add('warn', 'mcp result parse failed', { error: String(e?.message || e) }); } catch {}
        }
        return;
      }

      // Only execute and reply for active local function tools.
      try {
        const active = window.LiveTools?.activeFunctionToolNames;
        if (!active || !active.has(rec.name)) {
          if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'skip local execution (MCP-first)', { name: rec.name });
          return; // Do not send function_call_output for MCP-owned tools
        }
      } catch {}

      // Call server tool endpoint for local function tools
      const hdr = { 'content-type': 'application/json' }; 
      try { 
        if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
        if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN); 
      } catch {}
      
      let result = null;
      try {
        const r = await fetch(window.LiveUtils.api('/realtime/tool-call'), { 
          method: 'POST', 
          headers: hdr, 
          body: JSON.stringify({ name: rec.name, args: argsObj }) 
        });
        const j = await r.json(); 
        result = j;
      } catch (e) { 
        result = { ok: false, error: String(e?.message || e) }; 
      }
      
      const brief = (() => { 
        try { 
          const s = JSON.stringify(result); 
          return s.length > 400 ? s.slice(0, 400) + '…' : s; 
        } catch { 
          return String(result); 
        }
      })();
      
      if (window.LiveDebug?.vd) {
        const payload = { name: rec.name, result: brief };
        try { if (!result?.ok) payload.args_raw = (rec.args || '').slice(0, 240); } catch {}
        window.LiveDebug.vd.add(result?.ok ? 'info' : 'error', 'tool result', payload);
      }
      
      // Confirmation flow for token resolution
      if (rec.name === 'resolve_token') {
        try {
          const items = Array.isArray(result?.results) ? result.results : [];
          lastResolveList = items;

          // Always close out the tool call so the model doesn't retry.
          try {
            const outputData = result?.mcp || result || { ok: false, error: 'no_result' };
            emitFunctionOutput(rec, outputData);
          } catch {}

          if (items.length === 0) {
            if (window.LiveVoice?.voice?.dc) {
              window.LiveVoice.voice.dc.send(JSON.stringify({
                type: 'response.create',
                response: { instructions: `I couldn't find a token for "${argsObj?.query || ''}". Please say a different name or symbol.` }
              }));
            }
          } else {
            pendingCandidates = items.slice(0, 5);
            // Speak top 3 options with distinguishing info
            const top3 = pendingCandidates.slice(0, 3).map((it, i) => {
              const addrShort = it.address ? `${it.address.slice(0, 4)}…${it.address.slice(-4)}` : '';
              const liq = (Number(it.liquidity_usd || 0) || 0);
              const liqTxt = liq >= 1_000_000 ? (`$${(liq / 1_000_000).toFixed(1)}m`) : (liq >= 1_000 ? (`$${(liq / 1_000).toFixed(0)}k`) : (`$${liq.toFixed(0)}`));
              return `${i + 1}) ${it.symbol || it.name || 'token'} ${addrShort} • liq ${liqTxt}`;
            }).join('; ');
            const instr = `I found these: ${top3}. Say a number (1-3), or say the last four of the address, or approximate liquidity (e.g., $2m).`;

            if (window.LiveVoice?.voice?.dc) {
              window.LiveVoice.voice.dc.send(JSON.stringify({
                type: 'response.create',
                response: { instructions: instr }
              }));
            }
          }
        } catch {}
        return;
      }
      
      // Send function_call_output back to OpenAI using the real call_id, or defer
      const outputData = result?.mcp || result || { ok: false, error: 'no_result' };
      if (!emitFunctionOutput(rec, outputData)) {
        // deferred: we'll flush on response.done once call_id is known
      }
    }
  } catch {}
}

// Export tools functionality
window.LiveTools = {
  toolBuf,
  pendingConfirm,
  lastResolveList,
  pendingCandidates,
  checkPendingConfirm,
  handleToolFrames,
  normalizeToolEvent,
  // Helper functions
  isYes,
  isNo,
  wordToIndex,
  parseLiquidity,
  selectCandidate
};
