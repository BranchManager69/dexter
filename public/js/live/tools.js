// public/js/live/tools.js
// Tool calling and confirmation flow handling for Live UI

// Tool state
const toolBuf = new Map();
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
    
    if (msg.type === 'response.function_call.created') {
      const id = msg.id || msg.call_id || (msg.item?.id) || null; 
      const name = msg.name || msg.function?.name || msg.item?.name || null;
      if (!id || !name) return; 
      toolBuf.set(id, { name, args: '' }); 
      const callLabel = msg.callType === 'mcp' ? 'MCP tool' : 'tool';
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('info', `${callLabel} created`, { id, name });
      }
      return;
    }
    
    if (msg.type === 'response.function_call.arguments.delta' || msg.type === 'response.function_call_arguments.delta') {
      const id = msg.id || msg.call_id || (msg.item?.id) || null; 
      if (!id) return; 
      const rec = toolBuf.get(id); 
      if (!rec) return; 
      const delta = msg.delta || msg.arguments || ''; 
      rec.args += String(delta); 
      return;
    }
    
    if (msg.type === 'response.function_call.completed') {
      const id = msg.id || msg.call_id || (msg.item?.id) || null; 
      if (!id) return; 
      const rec = toolBuf.get(id); 
      if (!rec) return; 
      toolBuf.delete(id);
      
      let argsObj = {}; 
      try { 
        argsObj = rec.args ? JSON.parse(rec.args) : {}; 
      } catch { 
        argsObj = {}; 
      }
      
      const callLabel = msg.callType === 'mcp' ? 'MCP tool' : 'tool';
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('info', `${callLabel} completed`, { 
          id, 
          name: rec.name, 
          args: argsObj 
        });
      }
      
      // If this was an MCP call, Realtime executes it server-side.
      // We only log completion and do NOT duplicate the call or send outputs.
      if (msg.callType === 'mcp') {
        if (window.LiveDebug?.vd) {
          window.LiveDebug.vd.add('info', 'mcp tool handled by realtime', {
            id,
            name: rec.name
          });
        }
        return;
      }

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
        window.LiveDebug.vd.add(result?.ok ? 'info' : 'error', 'tool result', { 
          name: rec.name, 
          result: brief 
        });
      }
      
      // Confirmation flow for token resolution
      if (rec.name === 'resolve_token') {
        try {
          const items = Array.isArray(result?.results) ? result.results : [];
          lastResolveList = items;
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
      
      // Send function_call_output back to OpenAI, then trigger response
      try {
        // First send the function output with the actual result data
        const outputData = result?.mcp || result || { ok: false, error: 'no_result' };
        
        if (window.LiveVoice?.voice?.dc) {
          window.LiveVoice.voice.dc.send(JSON.stringify({ 
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: id,
              output: JSON.stringify(outputData)
            }
          }));
        }
        
        if (window.LiveDebug?.vd) {
          window.LiveDebug.vd.add('info', 'sent function_call_output', { call_id: id });
        }
        
        // Then trigger response generation so the AI speaks about what happened
        if (window.LiveVoice?.voice?.dc) {
          window.LiveVoice.voice.dc.send(JSON.stringify({ type: 'response.create' }));
        }
        
        if (window.LiveDebug?.vd) {
          window.LiveDebug.vd.add('info', 'sent response.create');
        }
      } catch (e) {
        if (window.LiveDebug?.vd) {
          window.LiveDebug.vd.add('error', 'failed to send function output', { 
            error: String(e?.message || e) 
          });
        }
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
