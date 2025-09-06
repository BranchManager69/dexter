// public/js/live/debug.js
// Voice debug panel functionality for Live UI

// Debug helpers object
const vd = {
  el: null,
  logEl: null,
  statusEl: null,
  verboseBtn: null,
  logs: [],
  verbose: true,
  // Filters
  timeline: true,
  showTools: true,
  showErrors: true,
  showTranscripts: true,
  showFrames: false,
  search: '',
  // Call summaries by id
  calls: new Map(), // id -> { name, args, result, t }
  session: (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
  uploadBuf: [],
  flushing: false,
  initialized: false,
  _lastHash: null,
  _repeatCount: 0,
  _lastDiv: null,

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.el = document.getElementById('voiceDebug');
    this.logEl = document.getElementById('vdLog');
    this.statusEl = document.getElementById('vdStatus');
    this.verboseBtn = document.getElementById('vdVerbose');
    
    this.setupEventListeners();
    try { if (this.verboseBtn) { this.verboseBtn.setAttribute('data-on', this.verbose ? '1' : '0'); this.verboseBtn.textContent = 'Verbose: ' + (this.verbose ? 'On' : 'Off'); } } catch {}
    this.add('info', 'Voice debug ready');
  },

  // Tools overlay state
  functionTools: [],
  mcpTools: [],
  suppressedTools: [],
  setTools({ functionTools = [], mcpTools = [], suppressedTools = [] } = {}) {
    try {
      if (Array.isArray(functionTools)) this.functionTools = functionTools;
      if (Array.isArray(mcpTools)) this.mcpTools = mcpTools;
      if (Array.isArray(suppressedTools)) this.suppressedTools = suppressedTools;
      this.renderToolsOverlay();
    } catch {}
  },
  renderToolsOverlay() {
    try {
      const ov = document.getElementById('toolsOverlay');
      const list = document.getElementById('toolsList');
      const count = document.getElementById('toolsCount');
      if (!ov || !list) return;
      const rows = [];
      const add = (src, t) => {
        try {
          const name = t?.name || t?.tool?.name || '(unnamed)';
          const desc = t?.description || t?.tool?.description || '';
          const params = t?.parameters || t?.tool?.inputSchema || t?.tool?.parameters || null;
          rows.push(`<div class="tool-row" style="border-bottom:1px solid #1a1e27;padding:6px 0">
            <div style="display:flex;gap:8px;align-items:center">
              <span class="vd-badge" style="background:#0f1117">${src}</span>
              <code style="font-size:12px">${name}</code>
              <div style="margin-left:auto;display:flex;gap:6px">
                <button class="vd-btn" data-copy-name="${encodeURIComponent(name)}">Copy Name</button>
                <button class="vd-btn" data-copy-schema='${encodeURIComponent(JSON.stringify(params||{}, null, 2))}'>Copy Schema</button>
              </div>
            </div>
            ${desc ? `<div style="color:#9fb2c8;font-size:12px;margin-top:4px">${desc}</div>` : ''}
          </div>`);
        } catch {}
      };
      const section = (title, src, items) => {
        if (!Array.isArray(items) || !items.length) return;
        rows.push(`<div style="margin:6px 0 2px; color:#9fb2c8; font-size:12px">${title}</div>`);
        for (const t of items) add(src, t);
      };
      section('MCP Tools', 'mcp', this.mcpTools || []);
      section('Function Tools (active)', 'function', this.functionTools || []);
      section('Suppressed (overlapped by MCP)', 'suppressed', this.suppressedTools || []);
      list.innerHTML = rows.join('') || '<div style="color:#9fb2c8">No tools loaded yet.</div>';
      if (count) {
        const fn = (this.functionTools?.length||0);
        const mc = (this.mcpTools?.length||0);
        const sp = (this.suppressedTools?.length||0);
        count.textContent = `${fn+mc} (suppressed ${sp})`;
      }
      // Wire copy buttons
      list.querySelectorAll('[data-copy-name]').forEach(btn => {
        btn.addEventListener('click', () => {
          try { navigator.clipboard.writeText(decodeURIComponent(btn.getAttribute('data-copy-name')||'')); window.LiveUtils.showToast('Tool name copied'); } catch {}
        });
      });
      list.querySelectorAll('[data-copy-schema]').forEach(btn => {
        btn.addEventListener('click', () => {
          try { navigator.clipboard.writeText(decodeURIComponent(btn.getAttribute('data-copy-schema')||'')); window.LiveUtils.showToast('Schema copied'); } catch {}
        });
      });
    } catch {}
  },

  scheduleFlush() { 
    try { 
      clearTimeout(this._ft); 
      this._ft = setTimeout(() => this.flush(), 150); 
    } catch {} 
  },

  async flush() {
    if (this.flushing) return; 
    this.flushing = true;
    try {
      const batch = this.uploadBuf.splice(0, 50);
      if (!batch.length) { 
        this.flushing = false; 
        return; 
      }
      const hdr = { 'content-type': 'application/json' }; 
      try { 
        if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
      } catch {}
      await fetch(window.LiveUtils.api('/realtime/debug-log'), { 
        method: 'POST', 
        headers: hdr, 
        body: JSON.stringify({ session: this.session, lines: batch }) 
      }).catch(() => {});
    } finally {
      this.flushing = false; 
      if (this.uploadBuf.length) this.scheduleFlush();
    }
  },

  add(level, msg, extra) {
    try {
      const ts = new Date().toISOString().slice(11, 19);
      const line = { t: ts, level, msg: String(msg || ''), extra: this._sanitize(extra) };
      this.logs.push(line);
      if (this.logs.length > 300) this.logs.splice(0, this.logs.length - 300);
      this.render(line);
      // enqueue for server
      this.uploadBuf.push(line); 
      this.scheduleFlush();
    } catch {}
  },

  // Redact tokens/SDP/large blobs from logs
  _sanitize(data, depth = 0) {
    if (!data) return data;
    if (depth > 3) return '[…]';
    try {
      if (typeof data === 'string') {
        // Redact ek_ ephemeral tokens and long JWTs
        let s = data.replace(/ek_[A-Za-z0-9_-]{10,}/g, 'ek_…').replace(/eyJ[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{10,}/g, 'jwt…');
        // Redact userToken query param
        s = s.replace(/(userToken=)[^&\s]+/g, '$1***');
        // Truncate huge SDP blobs
        if (s.length > 800) s = s.slice(0, 800) + '…';
        return s;
      }
      if (Array.isArray(data)) return data.map(v => this._sanitize(v, depth + 1));
      if (typeof data === 'object') {
        const out = {}; 
        for (const [k, v] of Object.entries(data)) {
          const key = String(k).toLowerCase();
          if (key.includes('token') || key.includes('client_secret')) { out[k] = '***'; continue; }
          if (key === 'sdp') { out[k] = '[sdp…]'; continue; }
          if (key === 'url' && typeof v === 'string') { out[k] = String(v).replace(/(userToken=)[^&\s]+/g, '$1***'); continue; }
          out[k] = this._sanitize(v, depth + 1);
        }
        return out;
      }
      return data;
    } catch { return data; }
  },

  render(last) {
    try {
      const el = this.logEl; 
      if (!el) return;
      
      const matchesFilters = (ln) => {
        const s = this.search ? String(this.search).toLowerCase() : '';
        const asText = (() => { try { return (ln.msg + ' ' + JSON.stringify(ln.extra||{})).toLowerCase(); } catch { return ln.msg.toLowerCase(); }})();
        if (s && !asText.includes(s)) return false;
        const cat = this.classify(ln);
        if (cat === 'error') return this.showErrors;
        if (cat === 'tool') return this.showTools;
        if (cat === 'transcript') return this.showTranscripts;
        if (cat === 'frame') return this.showFrames;
        return true; // other
      };

      // Append only last line for efficiency
      const append = (ln) => {
        // Simple de-duplication: if same msg+extra repeats consecutively, compress
        const hash = (() => { try { return `${ln.level}|${ln.msg}|${JSON.stringify(ln.extra||{})}`; } catch { return `${ln.level}|${ln.msg}`; }})();
        if (this._lastHash && this._lastHash === hash && this._lastDiv) {
          this._repeatCount = (this._repeatCount || 1) + 1;
          try {
            const mark = ` ×${this._repeatCount}`;
            if (!this._lastDiv.textContent.endsWith(mark)) {
              this._lastDiv.textContent = this._lastDiv.textContent.replace(/ ×\d+$/,'') + mark;
            }
          } catch {}
          return;
        } else {
          this._lastHash = hash;
          this._repeatCount = 1;
        }
        if (!matchesFilters(ln)) return;
        const div = document.createElement('div'); 
        div.className = 'vd-line' + (ln.level === 'error' ? ' err' : ln.level === 'warn' ? ' warn' : '');
        
        // Check if this is a trade tool result with a transaction
        if (ln.msg === 'tool result' && ln.extra?.result) {
          try {
            const result = typeof ln.extra.result === 'string' ? 
              JSON.parse(ln.extra.result.replace(/…$/, '}')) : ln.extra.result;
            const toolName = ln.extra.name;
            const isTradeTool = ['execute_buy', 'execute_sell', 'execute_sell_all'].includes(toolName);
            
            if (isTradeTool && (result?.mcp?.tx_hash || result?.mcp?.solscan_url)) {
              // Create special rendering for trade results
              div.innerHTML = `[${ln.t}] ${ln.level.toUpperCase()} ${ln.msg} ${toolName}`;
              
              // Add transaction link
              const txLink = document.createElement('a');
              const href = result?.mcp?.solscan_url || (result?.mcp?.tx_hash ? `https://solscan.io/tx/${result.mcp.tx_hash}` : null);
              txLink.href = href || '#';
              txLink.target = '_blank';
              txLink.style.cssText = 'margin-left:8px;color:#79e08f;text-decoration:underline';
              txLink.textContent = '→ View Transaction';
              div.appendChild(txLink);
              
              // Add brief summary without tx_hash
              if (this.verbose) {
                const summary = document.createElement('span');
                summary.style.cssText = 'margin-left:8px;color:#98a6b3;font-size:11px';
                const details = [];
                if (result.mcp.sol_spent) details.push(`${result.mcp.sol_spent} SOL spent`);
                if (result.mcp.sol_received) details.push(`${result.mcp.sol_received} SOL received`);
                if (result.mcp.tokens_received) details.push(`tokens received`);
                summary.textContent = details.length ? ` (${details.join(', ')})` : '';
                div.appendChild(summary);
              }
              
              el.appendChild(div); 
              el.scrollTop = el.scrollHeight;
              return;
            }
          } catch {}
        }
        
        // Timeline summary lines for tool calls
        if (this.timeline && ln.msg === 'tool completed' && ln.extra && ln.extra.name) {
          try {
            const name = ln.extra.name;
            const args = ln.extra.args || {};
            const argsBrief = (() => { try { const s=JSON.stringify(args); return s.length>120? s.slice(0,120)+'…': s; } catch { return ''; }})();
            div.textContent = `[${ln.t}] CALL ${name} args=${argsBrief}`;
            div.style.color = '#9fb2c8';
            el.appendChild(div);
            this._lastDiv = div;
            el.scrollTop = el.scrollHeight;
            return;
          } catch {}
        }

        // Special rendering for transcripts
        if (ln.msg === 'assistant.transcript' && ln.extra && ln.extra.text) {
          div.style.color = '#d4e157';
          div.textContent = `[${ln.t}] ASSISTANT: ${ln.extra.text}`;
          el.appendChild(div); this._lastDiv = div; el.scrollTop = el.scrollHeight; return;
        }
        if (ln.msg === 'user.transcript' && ln.extra && ln.extra.text) {
          div.style.color = '#80cbc4';
          div.textContent = `[${ln.t}] YOU: ${ln.extra.text}`;
          el.appendChild(div); this._lastDiv = div; el.scrollTop = el.scrollHeight; return;
        }

        // Special rendering for generic tool result lines
        if (ln.msg === 'tool result' && ln.extra) {
          const name = ln.extra.name || '';
          const argsStr = ln.extra.args != null ? window.LiveUtils.safeJson(ln.extra.args) : '';
          const resStr = ln.extra.result != null ? window.LiveUtils.safeJson(ln.extra.result) : '';
          div.style.color = '#8ab4ff';
          div.textContent = `[${ln.t}] TOOL ${name} args=${argsStr} result=${resStr}`;
          el.appendChild(div); this._lastDiv = div; el.scrollTop = el.scrollHeight; return;
        }

        // Expanded rendering for realtime error frames
        if (ln.msg === 'realtime error') {
          try {
            let summary = '';
            const e = ln.extra || {};
            const code = e.code || e.type || e.error || '';
            const msg = e.message || e.msg || e.detail || '';
            if (code || msg) {
              summary = `${code || 'error'}${msg ? (': ' + msg) : ''}`;
            }
            const details = window.LiveUtils.safeJson(e);
            div.style.color = '#ff9b9b';
            div.textContent = `[${ln.t}] ERROR realtime error ${summary ? ('(' + summary + ') ') : ''}${details ? details : ''}`;
            el.appendChild(div); this._lastDiv = div; el.scrollTop = el.scrollHeight; return;
          } catch {}
        }

        // Default rendering for non-trade results
        const extra = ln.extra ? (' ' + window.LiveUtils.safeJson(ln.extra)) : '';
        div.textContent = `[${ln.t}] ${ln.level.toUpperCase()} ${ln.msg}${extra}`;
        
        // Click-to-copy convenience
        try {
          div.style.cursor = 'copy';
          div.title = 'Click to copy this line';
          div.addEventListener('click', () => {
            try {
              const txt = `[${ln.t}] ${ln.level.toUpperCase()} ${ln.msg}${extra}`;
              navigator.clipboard.writeText(txt);
              window.LiveUtils.showToast('Copied log line');
            } catch {}
          });
        } catch {}
        el.appendChild(div);
        this._lastDiv = div;
        el.scrollTop = el.scrollHeight;
      };
      
      if (last) append(last);
      else { 
        el.innerHTML = ''; 
        for (const ln of this.logs) append(ln); 
      }
    } catch {}
  },

  classify(ln){
    try {
      if (ln.level === 'error') return 'error';
      const m = String(ln.msg||'');
      if (m === 'tool-frame' || m === 'frame') return 'frame';
      if (m === 'tool created' || m === 'tool completed' || m === 'tool result' || m.includes('MCP') || m.includes('tools registered') || m.includes('function_call_output') || m.includes('confirm->')) return 'tool';
      if (m === 'assistant.transcript' || m === 'user.transcript') return 'transcript';
      return 'other';
    } catch { return 'other'; }
  },

  clear() { 
    try { 
      this.logs = []; 
      this.render(); 
    } catch {} 
  },

  copy() { 
    try { 
      const txt = this.logs.map(l => `[${l.t}] ${l.level.toUpperCase()} ${l.msg}${this.verbose && l.extra ? (' ' + window.LiveUtils.safeJson(l.extra)) : ''}`).join('\n'); 
      navigator.clipboard.writeText(txt); 
      window.LiveUtils.showToast('Voice debug copied'); 
    } catch {} 
  },

  download() { 
    try { 
      const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' }); 
      const a = document.createElement('a'); 
      a.href = URL.createObjectURL(blob); 
      a.download = 'voice-debug-' + Date.now() + '.json'; 
      a.click(); 
    } catch {} 
  },

  setStatus(text, cls) { 
    try { 
      this.statusEl.textContent = text; 
      this.statusEl.classList.remove('ok', 'warn', 'bad'); 
      if (cls) this.statusEl.classList.add(cls); 
    } catch {} 
  },

  setupEventListeners() {
    try {
      // Debug panel menu dropdown toggle
      const menuBtn = document.getElementById('vdMenu');
      const menuDrop = document.getElementById('vdMenuDrop');
      
      if (menuBtn && menuDrop) {
        menuBtn.addEventListener('click', (e) => { 
          e.stopPropagation();
          menuDrop.style.display = menuDrop.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', () => { menuDrop.style.display = 'none'; });
        menuDrop.addEventListener('click', (e) => { e.stopPropagation(); });
      }

      // Debug controls
      const setupButton = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
      };

      setupButton('vdClear', () => this.clear());
      // Traces toggle inside Voice Debug
      setupButton('vdTraces', () => {
        try {
          const pnl = document.getElementById('tracesPanel');
          if (pnl) pnl.style.display = (pnl.style.display === 'none' || !pnl.style.display) ? 'block' : 'none';
        } catch {}
      });
      // Quick Tools overlay button in the Voice Debug header
      setupButton('vdToolsBtn', () => {
        try {
          const ov = document.getElementById('toolsOverlay');
          if (ov) {
            ov.style.display = 'block';
            this.renderToolsOverlay();
          }
        } catch {}
      });
      // Tools overlay toggle
      setupButton('vdToolList', () => {
        try {
          const ov = document.getElementById('toolsOverlay');
          if (ov) {
            ov.style.display = (ov.style.display === 'none' || !ov.style.display) ? 'block' : 'none';
            if (ov.style.display === 'block') this.renderToolsOverlay();
          }
        } catch {}
      });
      setupButton('vdCopy', () => this.copy());
      setupButton('vdVerbose', (e) => { 
        this.verbose = !this.verbose; 
        e.currentTarget.setAttribute('data-on', this.verbose ? '1' : '0'); 
        e.currentTarget.textContent = 'Verbose: ' + (this.verbose ? 'On' : 'Off'); 
        this.render(); 
      });

      // Filters
      const toggleBtn = (id, key, onLabel) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
          this[key] = !this[key];
          e.currentTarget.setAttribute('data-on', this[key] ? '1' : '0');
          e.currentTarget.textContent = `${onLabel.split(':')[0]}: ` + (this[key] ? 'On' : 'Off');
          this.render();
        });
      };
      toggleBtn('vdTimeline', 'timeline', 'Timeline: On');
      toggleBtn('vdTools', 'showTools', 'Tools: On');
      toggleBtn('vdErrors', 'showErrors', 'Errors: On');
      toggleBtn('vdTrans', 'showTranscripts', 'Transcripts: On');
      toggleBtn('vdFrames', 'showFrames', 'Frames: On');

      const searchEl = document.getElementById('vdSearch');
      if (searchEl) {
        const handler = () => { this.search = searchEl.value || ''; this.render(); };
        searchEl.addEventListener('input', handler);
        searchEl.addEventListener('keydown', (e) => { if (e.key === 'Escape'){ searchEl.value=''; handler(); }});
      }

      // Tools overlay close
      try {
        const closeBtn = document.getElementById('toolsClose');
        if (closeBtn) closeBtn.addEventListener('click', () => {
          const ov = document.getElementById('toolsOverlay');
          if (ov) ov.style.display = 'none';
        });
      } catch {}

      // Test Capture button
      setupButton('vdTestCapture', () => {
        try {
          const testData = {
            timestamp: new Date().toISOString(),
            connected: window.LiveVoice?.voice?.connected || false,
            muted: window.LiveVoice?.voice?.muted || false,
            sessionId: window.LiveVoice?.voice?.dc?.id || null,
            logCount: this.logs?.length || 0,
            lastTools: [],
            lastTranscript: null,
            lastError: null
          };
          
          // Get last 5 tool calls
          for (let i = this.logs.length - 1; i >= 0 && testData.lastTools.length < 5; i--) {
            const item = this.logs[i];
            if (item.level === 'info' && (item.msg.includes('tool') || item.msg.includes('MCP'))) {
              testData.lastTools.push({
                msg: item.msg,
                extra: item.extra,
                t: item.t
              });
            }
            if (!testData.lastTranscript && item.msg.includes('transcript')) {
              testData.lastTranscript = item.msg;
            }
            if (!testData.lastError && item.level === 'error') {
              testData.lastError = { msg: item.msg, extra: item.extra };
            }
          }
          
          const output = JSON.stringify(testData, null, 2);
          navigator.clipboard.writeText(output).then(
            () => {
              this.add('info', 'Test capture copied to clipboard');
              console.log('Test Capture:', testData);
            },
            () => {
              this.add('error', 'Failed to copy test capture');
              console.log('Test Capture (manual copy):', output);
            }
          );
        } catch (e) {
          this.add('error', 'Test capture failed', { error: String(e?.message || e) });
        }
      });

      setupButton('vdStop', () => window.LiveVoice?.stopVoice?.());
      setupButton('vdMute', (e) => {
        try { 
          const voice = window.LiveVoice?.voice;
          if (!voice) return;
          
          voice.muted = !voice.muted; 
          const tr = voice?.mic?.getAudioTracks?.()[0]; 
          if (tr) tr.enabled = !voice.muted; 
          e.currentTarget.textContent = voice.muted ? '🔇' : '🎤';
          e.currentTarget.style.color = voice.muted ? '#ff7b7b' : '#79e08f';
          this.add('info', voice.muted ? 'mic muted' : 'mic unmuted'); 
        } catch {}
      });

      setupButton('vdHealth', async () => {
        try { 
          const hdr = {}; 
          if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
          if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN); 
          const r = await fetch(window.LiveUtils.api(`/realtime/health?session=${encodeURIComponent(this.session)}`), { headers: hdr }); 
          const j = await r.json(); 
          this.add(j?.ok ? 'info' : 'error', 'health', j); 
        } catch (e) { 
          this.add('error', 'health failed', { error: String(e?.message || e) }); 
        }
      });

      setupButton('vdSend', async () => {
        try { 
          const hdr = { 'content-type': 'application/json' }; 
          if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
          const note = `manual from UI ${new Date().toISOString()}`; 
          const r = await fetch(window.LiveUtils.api('/realtime/debug-save'), { 
            method: 'POST', 
            headers: hdr, 
            body: JSON.stringify({ session: this.session, note }) 
          }); 
          const j = await r.json(); 
          if (j?.ok) { 
            this.add('info', 'logs saved', { file: j.file, saved: j.saved }); 
            window.LiveUtils.showToast('Logs sent'); 
          } else { 
            this.add('error', 'save failed', j); 
          }
        } catch (e) { 
          this.add('error', 'save error', { error: String(e?.message || e) }); 
        }
      });

      setupButton('vdCheck', async () => {
        this.add('info', 'Check: env + mic + session');
        // Environment
        this.add('info', 'env', { protocol: location.protocol, host: location.host, https: location.protocol === 'https:' });
        // Mic probe
        try {
          const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
          const tr = ms.getAudioTracks()[0]; 
          this.add('info', 'mic probe ok', { label: tr?.label || '', enabled: tr?.enabled, muted: tr?.muted });
          try { for (const t of ms.getTracks()) t.stop(); } catch {}
        } catch (e) { 
          this.add('error', 'mic probe failed', { error: String(e?.message || e) }); 
        }
        // Session probe
        try {
          const tokenHdr = {}; 
          try { if (window.AGENT_TOKEN) tokenHdr['x-agent-token'] = String(window.AGENT_TOKEN); } catch {}
          const r = await fetch(window.LiveUtils.api('/realtime/sessions'), { 
            method: 'POST', 
            headers: { 'content-type': 'application/json', ...tokenHdr }, 
            body: JSON.stringify({}) 
          });
          if (!r.ok) { 
            const e = await r.json().catch(() => null); 
            this.add('error', 'session probe failed', { status: r.status, body: e }); 
            return; 
          }
          const j = await r.json(); 
          this.add('info', 'session probe ok', { model: j?.model, expires_at: j?.expires_at });
        } catch (e) { 
          this.add('error', 'session probe error', { error: String(e?.message || e) }); 
        }
      });

    } catch {}
  }
};

// Export debug functionality
window.LiveDebug = {
  vd,
  init: () => vd.init()
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => vd.init());
} else {
  vd.init();
}
