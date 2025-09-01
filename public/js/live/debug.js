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
  session: (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
  uploadBuf: [],
  flushing: false,

  init() {
    this.el = document.getElementById('voiceDebug');
    this.logEl = document.getElementById('vdLog');
    this.statusEl = document.getElementById('vdStatus');
    this.verboseBtn = document.getElementById('vdVerbose');
    
    this.setupEventListeners();
    this.add('info', 'Voice debug ready');
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
      const line = { t: ts, level, msg: String(msg || ''), extra: extra || null };
      this.logs.push(line);
      if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500);
      this.render(line);
      // enqueue for server
      this.uploadBuf.push(line); 
      this.scheduleFlush();
    } catch {}
  },

  render(last) {
    try {
      const el = this.logEl; 
      if (!el) return;
      
      // Append only last line for efficiency
      const append = (ln) => {
        const div = document.createElement('div'); 
        div.className = 'vd-line' + (ln.level === 'error' ? ' err' : ln.level === 'warn' ? ' warn' : '');
        
        // Check if this is a trade tool result with a transaction
        if (ln.msg === 'tool result' && ln.extra?.result) {
          try {
            const result = typeof ln.extra.result === 'string' ? 
              JSON.parse(ln.extra.result.replace(/…$/, '}')) : ln.extra.result;
            const toolName = ln.extra.name;
            const isTradeTool = ['execute_buy', 'execute_sell', 'execute_sell_all', 'smart_buy', 'smart_sell', 'trade'].includes(toolName);
            
            if (isTradeTool && result?.mcp?.tx_hash) {
              // Create special rendering for trade results
              div.innerHTML = `[${ln.t}] ${ln.level.toUpperCase()} ${ln.msg} ${toolName}`;
              
              // Add transaction link
              const txLink = document.createElement('a');
              txLink.href = `https://solscan.io/tx/${result.mcp.tx_hash}`;
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
        
        // Default rendering for non-trade results
        const extra = this.verbose && ln.extra ? (' ' + window.LiveUtils.safeJson(ln.extra)) : '';
        div.textContent = `[${ln.t}] ${ln.level.toUpperCase()} ${ln.msg}${extra}`;
        el.appendChild(div); 
        el.scrollTop = el.scrollHeight;
      };
      
      if (last) append(last);
      else { 
        el.innerHTML = ''; 
        for (const ln of this.logs) append(ln); 
      }
    } catch {}
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
      setupButton('vdCopy', () => this.copy());
      setupButton('vdVerbose', (e) => { 
        this.verbose = !this.verbose; 
        e.currentTarget.setAttribute('data-on', this.verbose ? '1' : '0'); 
        e.currentTarget.textContent = 'Verbose: ' + (this.verbose ? 'On' : 'Off'); 
        this.render(); 
      });

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