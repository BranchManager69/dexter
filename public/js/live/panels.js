// public/js/live/panels.js
// Panel management functionality for Live UI - handles Panel class and tab management

// Panel state
const panels = new Map();
const suppressedMints = new Set();
let activePanel = null;

// DOM elements
let panelsEl = null;
let tabsContainer = null;

/**
 * Initialize panels functionality
 */
function initPanels() {
  panelsEl = document.getElementById('panels');
  tabsContainer = document.getElementById('panelTabs');
  
  // Listen for terminal events to create/update panels
  window.addEventListener('ai:terminal', handleTerminalMessage);
}

/**
 * Handle terminal messages for panel updates
 */
function handleTerminalMessage(e) {
  try {
    const msg = e.detail?.msg;
    if (!msg || msg.type !== 'DATA' || msg.topic !== 'terminal') return;
    const { subtype, event, data } = msg;

    // Route runner lifecycle/logs to panels
    if (subtype === 'runner') {
      if (event === 'runner:started') {
        try {
          if (data?.mint) {
            const p = getOrCreatePanel(data.mint);
            if (p && data.pid) p.pid = data.pid;
          }
        } catch {}
      }
      if (event === 'runner:log') {
        try {
          const logMint = data?.mint;
          if (logMint && !suppressedMints.has(logMint)) {
            const p = getOrCreatePanel(logMint);
            if (p) {
              const stream = data?.stream || 'stdout';
              const line = data?.line || '';
              // Try to route [trace] JSON to step details
              try {
                const m = line.match(/^\[trace\]\s+(\{.*\})$/);
                if (m) {
                  const j = JSON.parse(m[1]);
                  const step = String(j?.step || '');
                  const status = String(j?.status || '');
                  if (step) {
                    if (status === 'start') p.addStepLog?.(step, `▶ start ${step}${j.url ? ` url=${j.url}` : ''}`);
                    else if (status === 'end') { const ms = (typeof j.ms === 'number') ? j.ms : null; const ok = !!j.ok; p.addStepLog?.(step, `✓ end ${step}${ms != null ? ` (${ms}ms)` : ''} ok=${ok}`); }
                    else if (status === 'skip') p.addStepLog?.(step, `⏭ skipped ${step}${j.reason ? ` (${j.reason})` : ''}`);
                  }
                }
              } catch {}
              const cls = stream === 'stderr' ? 't-red' : '';
              p.log?.(`[${stream}] ${line}`, cls);
            }
          }
        } catch {}
      }
      return; // handled
    }

    if (subtype === 'ai_session') {
      const mint = data?.mint || null;
      if (!mint) return;
      if (!panels.has(mint) && suppressedMints.has(mint)) return;

      const panel = getOrCreatePanel(mint);
      if (!panel) return;

      // Initial meta
      if (event === 'session:meta') {
        if (data) {
          if (data.pid) panel.pid = data.pid;
          if (data.name || data.symbol) panel.updateTokenMeta(data);
          if (data.started_at) panel.setStart(data.started_at);
          if (data.phase) panel.setPhase(data.phase);
        }
        return;
      }

      // Context/memory digest & token meta
      if (event === 'agent:memory') { panel.setContext?.(data?.text || ''); return; }
      if (event === 'token:meta') { panel.updateTokenMeta?.({ name: data?.name, symbol: data?.symbol, address: data?.address || mint }); return; }

      // Session lifecycle
      if (event === 'agent:session_start') {
        try {
          if (data?.started_at) panel.setStart(data.started_at);
          if (panel.initSteps) { panel.initSteps(); panel.setStepState('bootstrap','active'); panel.setPhase('Init'); }
          panel.log?.(`▶ session_start ${mint} model=${data?.model || ''}`, 't-grey');
        } catch {}
        return;
      }
      if (event === 'agent:status') {
        try {
          const t = data?.text || '';
          if (t.includes('llm_round1')) { panel.setPhase('Socials'); panel.setStepState?.('bootstrap','done'); panel.setStepState?.('socials','active'); }
          if (t.includes('finalize_round_start')) { panel.setPhase('Synthesis'); panel.setStepState?.('synthesis','active'); }
          if (t.includes('finalize_stream_completed')) { panel.setPhase('Finalizing'); panel.setStepState?.('synthesis','done'); panel.setStepState?.('finalize','active'); }
          panel.log?.('… ' + t, 't-grey');
        } catch {}
        return;
      }
      if (event === 'agent:tool_call') { panel.log?.('↪ tool_call ' + (data?.name || ''), 't-yellow'); if ((data?.name === 'analyze_token_ohlcv' || data?.name === 'analyze_token_ohlcv_range')) panel.setStepState?.('market','active'); return; }
      if (event === 'agent:tool_result') { panel.log?.('✔ tool_result ' + (data?.name || '') + ' ' + (data?.elapsed_ms || 0) + 'ms', 't-green'); if (data?.name === 'socials_orchestrate') panel.setStepState?.('socials','done', data?.elapsed_ms || 0); if ((data?.name === 'analyze_token_ohlcv' || data?.name === 'analyze_token_ohlcv_range')) panel.setStepState?.('market','done', data?.elapsed_ms || 0); return; }
      if (event === 'agent:partial_output') { const t = (data && data.text) ? String(data.text) : ''; if (t) panel.appendNarrative?.(t); return; }
      if (event === 'agent:error') { const t = (data && data.text) ? String(data.text) : 'error'; panel.log?.(t, 't-red'); return; }
      if (event === 'agent:final_json') {
        try {
          const a = data?.data || {};
          if (a?.metadata?.market) panel.updateMarket?.(a.metadata.market);
          panel.updateScores?.(a);
          try { panel.renderTimeline?.(a); } catch {}
          try { panel.renderFinalReport?.(a, data?.file || null); } catch {}
          try { const u = new URL(window.location.href); const dbg = u.searchParams.get('debug')==='1'; if (dbg && data?.file) panel.log?.('■ final_json saved ' + data.file, ''); } catch {}
        } catch {}
        return;
      }
      if (event && String(event).startsWith('process:')) {
        const e2 = String(event).split(':')[1];
        if (e2 === 'step_start') { const s = data?.step; if (s) { panel.setStepState?.(s,'active'); panel.addStepLog?.(s, `▶ start ${s}`); } return; }
        if (e2 === 'step_end') {
          const s = data?.step; if (!s) return;
          if (data && data.skipped) { panel.setStepState?.(s,'skipped',0); panel.addStepLog?.(s, `⏭ skipped ${s}`); }
          else { panel.setStepState?.(s,'done', data?.elapsed_ms || 0, { ok: (data?.ok !== false) }); panel.addStepLog?.(s, `✓ end ${s}${data?.elapsed_ms!=null?` (${data.elapsed_ms}ms)`:''}${data?.ok===false?' failed':''}`); }
          return;
        }
        if (e2 === 'status') { if (data?.text) panel.appendSignal?.(data.text, 'status'); return; }
        if (e2 === 'rationale') { if (data?.text) panel.appendSignal?.(data.text, data?.kind || 'why'); return; }
        if (e2 === 'signal') { if (data?.label) panel.appendSignal?.(`${data.label}: ${data.value}`, 'signal'); return; }
        if (e2 === 'source') { if (data?.url) panel.appendSourceLink?.(String(data.url), data?.title || '', data?.domain || ''); return; }
      }
      if (event && String(event).startsWith('metrics:')) { if (data) panel.updateMarket?.({ fdv:data.fdv, liquidity:data.liquidity, volume24h:data.volume24h }); return; }
      if (event === 'agent:session_end') { panel.setPhase?.('Idle'); panel.log?.('■ session_end ok=' + (data?.ok?'true':'false'), data?.ok ? 't-green' : 't-red'); panel.finish?.(); return; }
    }
    
  } catch {}
}

/**
 * Panel class
 */
class Panel {
  constructor(mint) {
    this.mint = mint;
    this.pid = null;
    this.startedAt = 0; 
    this.timerIv = null; 
    this.active = true; 
    this.finishedAt = 0;
    
    // Initialize timeline data structure
    this.timelineData = {
      ohlcv: [],
      tweets: [],
      raidZones: [],
      startTime: null,
      endTime: null
    };
    
    this.el = document.createElement('div'); 
    this.el.className = 'panel';
    
    // Create tab for this panel
    this.tab = document.createElement('div');
    this.tab.className = 'panel-tab';
    this.tabLabel = document.createElement('span');
    this.tabLabel.textContent = mint ? mint.slice(0, 6) + '…' : 'Token';
    this.tab.appendChild(this.tabLabel);
    
    const tabClose = document.createElement('span');
    tabClose.className = 'close';
    tabClose.textContent = '×';
    tabClose.onclick = (e) => {
      e.stopPropagation();
      if (this.mint) suppressedMints.add(this.mint);
      this.collapse();
      removePanel(this);
    };
    this.tab.appendChild(tabClose);
    
    this.tab.onclick = () => switchToPanel(this);
    if (tabsContainer) tabsContainer.appendChild(this.tab);
    
    this.createElements();
    this.setupEventListeners();
    
    // Add to panels container
    if (panelsEl) panelsEl.prepend(this.el);
    
    // Initialize state
    this.twQueue = []; 
    this.twriting = false; 
    this.twCurrentLineEl = null; 
    this.twBuf = '';
    this.sigItems = [];
    this.linkSet = new Set();
  }

  createElements() {
    // Header
    const h = document.createElement('header');
    const titleWrap = document.createElement('div'); 
    titleWrap.className = 'titlewrap';
    
    this.h_name = document.createElement('span'); 
    this.h_name.className = 'title'; 
    this.h_name.textContent = 'Token'; 
    titleWrap.appendChild(this.h_name);
    
    this.h_symbol = document.createElement('span'); 
    this.h_symbol.className = 'symbol'; 
    this.h_symbol.textContent = '—'; 
    titleWrap.appendChild(this.h_symbol);
    
    h.appendChild(titleWrap);
    
    this.h_addr = document.createElement('span'); 
    this.h_addr.className = 'addr'; 
    this.h_addr.style.cursor = 'pointer'; 
    this.h_addr.title = 'Click to copy'; 
    this.h_addr.textContent = (this.mint || '').slice(0, 6) + '…'; 
    h.appendChild(this.h_addr);
    
    this.h_phase = document.createElement('span'); 
    this.h_phase.className = 'status'; 
    this.h_phase.textContent = 'Idle'; 
    h.appendChild(this.h_phase);
    
    this.h_timer = document.createElement('span'); 
    this.h_timer.className = 'timer'; 
    this.h_timer.textContent = '00:00'; 
    h.appendChild(this.h_timer);
    
    // Minimal header: remove inline scores; keep resolver signal if needed later
    this.h_conf = document.createElement('span'); 
    this.h_conf.className = 'p-badge'; 
    this.h_conf.style.display = 'none'; 
    h.appendChild(this.h_conf);
    
    const spacer = document.createElement('div'); 
    spacer.className = 'spacer'; 
    h.appendChild(spacer);
    
    // External links (hidden until mint set)
    this.link_sol = document.createElement('a'); 
    this.link_sol.textContent = 'Solscan'; 
    this.link_sol.className = 'iconbtn'; 
    this.link_sol.style.display = 'none'; 
    this.link_sol.target = '_blank'; 
    h.appendChild(this.link_sol);
    
    this.link_dex = document.createElement('a'); 
    this.link_dex.textContent = 'Dex'; 
    this.link_dex.className = 'iconbtn'; 
    this.link_dex.style.display = 'none'; 
    this.link_dex.target = '_blank'; 
    h.appendChild(this.link_dex);
    
    // Controls: Hide and Kill
    const hideBtn = document.createElement('button'); 
    hideBtn.className = 'iconbtn warn'; 
    hideBtn.textContent = '–';
    hideBtn.title = 'Hide panel';
    hideBtn.addEventListener('click', () => { 
      if (this.mint) suppressedMints.add(this.mint); 
      this.collapse(); 
      removePanel(this); 
    });
    h.appendChild(hideBtn);
    
    const killBtn = document.createElement('button'); 
    killBtn.className = 'iconbtn danger'; 
    killBtn.textContent = '×';
    killBtn.title = 'Kill run';
    killBtn.addEventListener('click', () => this.killRun());
    h.appendChild(killBtn);
    
    this.el.appendChild(h);
    
    // Market snapshot section
    this.createMarketSection();
    
    // Token socials & links
    this.links = document.createElement('div'); 
    this.links.className = 'links'; 
    this.el.appendChild(this.links);
    
    // Memory digest context
    this.context = document.createElement('div'); 
    this.context.className = 'context';
    const ctxTitle = document.createElement('div'); 
    ctxTitle.className = 'title'; 
    ctxTitle.textContent = 'Memory Digest';
    this.ctxBody = document.createElement('div'); 
    this.ctxBody.className = 'body'; 
    this.ctxBody.textContent = '';
    this.context.appendChild(ctxTitle); 
    this.context.appendChild(this.ctxBody);
    
    // Side-by-side body: left (timeline), right (stream: terminal+narr)
    this.timeline = document.createElement('div'); 
    this.timeline.className = 'timeline';
    this.term = document.createElement('div'); 
    this.term.className = 'terminal';
    this.narr = document.createElement('div'); 
    this.narr.className = 'narr';
    this.bodyGrid = document.createElement('div'); 
    this.bodyGrid.className = 'bodygrid';
    this.streamWrap = document.createElement('div'); 
    this.streamWrap.className = 'streamwrap'; 
    this.streamWrap.appendChild(this.term); 
    this.streamWrap.appendChild(this.narr);
    this.bodyGrid.appendChild(this.timeline); 
    this.bodyGrid.appendChild(this.streamWrap); 
    this.el.appendChild(this.bodyGrid);
    
    // Memory Digest below the side-by-side body
    this.el.appendChild(this.context);
    
    // Full-width final report
    this.finalWrap = document.createElement('div'); 
    this.finalWrap.className = 'finalwrap'; 
    this.el.appendChild(this.finalWrap);
    
    // Additional signals
    this.signals = document.createElement('div'); 
    this.signals.className = 'signals'; 
    this.el.appendChild(this.signals);
  }

  createMarketSection() {
    this.market = document.createElement('div'); 
    this.market.className = 'market';
    
    const mkMetric = (label) => { 
      const box = document.createElement('div'); 
      box.className = 'metric'; 
      const l = document.createElement('div'); 
      l.className = 'label'; 
      l.textContent = label; 
      const v = document.createElement('div'); 
      v.className = 'value'; 
      v.textContent = '—'; 
      box.appendChild(l); 
      box.appendChild(v); 
      return { box, v }; 
    };
    
    const mP = mkMetric('Price'), mF = mkMetric('FDV'), mL = mkMetric('Liquidity'), mV = mkMetric('Vol 24h');
    this.market.appendChild(mP.box); 
    this.market.appendChild(mF.box); 
    this.market.appendChild(mL.box); 
    this.market.appendChild(mV.box);
    
    const sparkwrap = document.createElement('div'); 
    sparkwrap.className = 'sparkwrap'; 
    this.spark = document.createElement('canvas'); 
    this.spark.width = 200; 
    this.spark.height = 32; 
    this.spark.style.background = 'transparent'; 
    this.spark.style.border = '1px solid #1a1e27'; 
    this.spark.style.borderRadius = '4px'; 
    this.sparkLabel = document.createElement('div'); 
    this.sparkLabel.className = 'label'; 
    this.sparkLabel.textContent = 'Price (6h)'; 
    sparkwrap.appendChild(this.spark); 
    sparkwrap.appendChild(this.sparkLabel); 
    this.market.appendChild(sparkwrap);
    
    this.el.appendChild(this.market);
    this.metricEls = { priceEl: mP.v, fdvEl: mF.v, liqEl: mL.v, volEl: mV.v };
  }

  setupEventListeners() {
    try {
      // Copy address on click
      if (this.h_addr) {
        this.h_addr.addEventListener('click', () => {
          if (this.mint) {
            navigator.clipboard.writeText(this.mint).then(() => {
              window.LiveUtils.showToast('Address copied');
            }).catch(() => {
              window.LiveUtils.showToast('Copy failed');
            });
          }
        });
      }
    } catch {}
  }

  // Minimal terminal logger
  log(text, cls) {
    try {
      if (!this.term) return;
      const line = document.createElement('div');
      line.className = 'line' + (cls ? (' ' + cls) : '');
      line.textContent = String(text || '');
      this.term.appendChild(line);
      this.term.scrollTop = this.term.scrollHeight;
    } catch {}
  }

  // Minimal narrative appender
  appendNarrative(chunk) {
    try {
      if (!chunk) return;
      if (!this.narr) return;
      if (!this.narrLineEl) { this.narrLineEl = document.createElement('div'); this.narr.appendChild(this.narrLineEl); }
      this.narrLineEl.textContent = (this.narrLineEl.textContent || '') + String(chunk);
      this.narr.scrollTop = this.narr.scrollHeight;
    } catch {}
  }

  async killRun() {
    try {
      // Resolve PID if unknown
      let pid = this.pid;
      if (!pid && this.mint) {
        try {
          const url = new URL(window.location.href); 
          url.pathname = '/runs';
          const res = await fetch(url.toString()); 
          const j = await res.json();
          if (j?.ok && Array.isArray(j.active)) {
            const hit = j.active.find(r => String(r.mint || '') === String(this.mint || ''));
            if (hit) pid = hit.pid;
          }
        } catch {}
      }
      
      if (!pid) { 
        window.LiveUtils.showToast('No PID for this run'); 
        return; 
      }
      
      const short = (this.mint || '').slice(0, 8) + '…';
      if (!window.confirm(`Kill analysis for ${short}?`)) return;
      
      const delUrl = new URL(window.location.href); 
      delUrl.pathname = `/runs/${pid}`;
      const r = await fetch(delUrl.toString(), { method: 'DELETE' });
      
      if (r.ok) {
        window.LiveUtils.showToast('Run killed');
        this.collapse(); 
        removePanel(this);
      } else {
        const j = await r.json().catch(() => ({}));
        window.LiveUtils.showToast('Kill failed: ' + (j.error || r.status));
      }
    } catch (e) {
      window.LiveUtils.showToast('Kill error');
    }
  }

  reset(mint) {
    this.mint = mint; 
    this.h_name.textContent = 'Token'; 
    this.h_symbol.textContent = '—'; 
    this.h_addr.textContent = (mint || '').slice(0, 6) + '…';
    this.h_phase.textContent = 'Idle'; 
    this.h_timer.textContent = '00:00';
    this.setLinks();
    this.timeline.innerHTML = ''; 
    this.term.innerHTML = ''; 
    this.narr.innerHTML = ''; 
    if (this.signals) this.signals.innerHTML = ''; 
    if (this.links) this.links.innerHTML = '';
    this.startedAt = 0; 
    this.active = true; 
    this.finishedAt = 0; 
    this.twQueue = []; 
    this.twriting = false; 
    this.twCurrentLineEl = null; 
    this.twBuf = '';
    this.initSteps();
    this.sigItems = []; 
    this.renderSignals();
  }

  updateTokenMeta(meta) {
    try {
      if (meta?.name) this.h_name.textContent = meta.name;
      if (meta?.symbol) {
        this.h_symbol.textContent = meta.symbol;
        // Update tab label with symbol
        if (this.tabLabel) this.tabLabel.textContent = meta.symbol;
      }
      if (meta?.address) this.h_addr.textContent = (meta.address || '').slice(0, 6) + '…';
    } catch {}
  }

  initSteps() {
    this.steps = new Map();
    const order = ['bootstrap', 'socials', 'website', 'twitter', 'telegram', 'market', 'synthesis', 'finalize', 'persist'];
    this.timeline.innerHTML = '';
    
    for (const s of order) {
      const row = document.createElement('div'); 
      row.className = 'step'; 
      row.dataset.step = s;
      row.innerHTML = `<span class="dot">○</span><span class="label">${s}</span><span class="ms"></span>`;
      const details = document.createElement('div'); 
      details.className = 'details';
      
      // Toggle details on label click
      try { 
        row.querySelector('.label').addEventListener('click', () => { 
          details.classList.toggle('open'); 
        }); 
      } catch {}
      
      this.timeline.appendChild(row); 
      this.timeline.appendChild(details);
      this.steps.set(s, { state: 'pending', el: row, detailsEl: details, start: 0, end: 0 });
    }
  }

  setStepState(step, state, elapsed, opts = {}) {
    const st = this.steps?.get(step); 
    if (!st) return; 
    st.state = state; 
    const el = st.el; 
    const dot = el.querySelector('.dot'); 
    const ms = el.querySelector('.ms');
    
    el.classList.remove('active', 'done', 'skipped', 'failed');
    
    if (state === 'active') {
      el.classList.add('active');
      if (dot) { 
        dot.innerHTML = ''; 
        const sp = document.createElement('span'); 
        sp.className = 'spinner'; 
        dot.appendChild(sp); 
      }
      if (ms) ms.textContent = '';
    } else if (state === 'done') {
      if (opts && opts.ok === false) { 
        el.classList.add('failed'); 
        if (dot) dot.textContent = '✖'; 
      } else { 
        el.classList.add('done'); 
        if (dot) dot.textContent = '✓'; 
      }
      if (ms) ms.textContent = (typeof elapsed === 'number' && elapsed >= 0) ? `(${Math.round(elapsed)}ms)` : '';
    } else if (state === 'skipped') {
      el.classList.add('skipped'); 
      if (dot) dot.textContent = '⏭'; 
      if (ms) ms.textContent = '(skipped)';
    } else {
      if (dot) dot.textContent = '○'; 
      if (ms) ms.textContent = '';
    }
    
    if (opts && opts.title && ms) { 
      ms.title = String(opts.title); 
    }
  }

  addStepLog(step, text, cls) { 
    try { 
      const st = this.steps?.get(step); 
      if (!st || !st.detailsEl) return; 
      const line = document.createElement('div'); 
      line.className = 'logline'; 
      if (cls) line.classList.add(cls); 
      line.textContent = String(text || ''); 
      st.detailsEl.appendChild(line); 
    } catch {} 
  }

  ensureStepOpen(step) { 
    try { 
      const st = this.steps?.get(step); 
      if (!st || !st.detailsEl) return; 
      st.detailsEl.classList.add('open'); 
    } catch {} 
  }

  appendSignal(text, tag) {
    const t = String(text || '');
    // Pull out resolver confidence if present
    try {
      if (/^Resolved\b/i.test(t)) {
        const m = t.match(/\((\d+)\%\)/);
        if (m) { 
          const pct = parseInt(m[1], 10); 
          if (!Number.isNaN(pct)) { 
            this.h_conf.textContent = `Resolver ${pct}%`; 
            this.h_conf.style.display = 'inline-block'; 
          } 
        }
      }
    } catch {}
    
    this.sigItems.unshift({ text: t, tag: String(tag || '') });
    this.renderSignals();
  }

  appendSourceLink(url, title, domain) {
    try {
      if (!this.links) return;
      if (this.linkSet && this.linkSet.has(url)) return;
      if (this.linkSet) this.linkSet.add(url);
      
      let display = title || '';
      try {
        const u = new URL(url, window.location.origin);
        const host = (domain || u.hostname || '').replace(/^www\./, '');
        const seg = (u.pathname || '/').split('/').filter(Boolean);
        const first = seg[0] || '';
        const second = seg[1] || '';
        const hostLc = host.toLowerCase();
        const ignore = new Set(['i', 'home', 'explore', 'settings', 'messages', 'notifications', 'status']);
        
        if (!display) {
          if (hostLc === 'x.com' || hostLc === 'twitter.com') {
            // Special-case X Communities: /i/communities/<id>
            if (first === 'i' && (second === 'communities' || second === 'community')) {
              display = title ? title : 'X Community';
            } else if (first && !ignore.has(first)) {
              display = '@' + first; // Profile handle
            } else {
              display = host || url;
            }
          } else if ((hostLc === 't.me' || hostLc === 'telegram.me' || hostLc === 'telegram.org') && first) {
            display = '@' + first;
          } else if (hostLc === 'discord.gg' && first) {
            display = 'discord/' + first;
          } else {
            display = host || url;
          }
        }
        
        const d = document.createElement('div'); 
        d.className = 'sig';
        const img = document.createElement('img'); 
        img.className = 'fav'; 
        img.loading = 'lazy';
        const favDomain = host || u.hostname || '';
        img.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(favDomain)}`;
        img.alt = (host || '');
        const a = document.createElement('a'); 
        a.href = url; 
        a.target = '_blank'; 
        a.rel = 'noopener noreferrer'; 
        a.textContent = display;
        a.title = title ? `${title} — ${host}` : url;
        d.appendChild(img);
        d.appendChild(a);
        this.links.appendChild(d);
      } catch {
        const a = document.createElement('a'); 
        a.href = url; 
        a.target = '_blank'; 
        a.rel = 'noopener noreferrer'; 
        a.textContent = title || domain || url;
        const d = document.createElement('div'); 
        d.className = 'sig'; 
        d.appendChild(a); 
        this.links.appendChild(d);
      }
    } catch {}
  }

  renderSignals() {
    if (!this.signals) return;
    // Expert is always ON: show all signals by default
    const allowed = null;
    const maxItems = 40;
    this.signals.innerHTML = '';
    let count = 0;
    for (const item of this.sigItems) {
      if (allowed && !allowed.has(item.tag || '')) continue;
      const d = document.createElement('div'); 
      d.className = 'sig'; 
      d.innerHTML = (item.tag ? `<span class="tag">${item.tag}</span>` : '') + (item.text || '');
      this.signals.appendChild(d);
      count++; 
      if (count >= maxItems) break;
    }
  }

  pad(n) { 
    return n < 10 ? '0' + n : '' + n; 
  }

  startTimer() { 
    if (this.timerIv) clearInterval(this.timerIv); 
    this.timerIv = setInterval(() => { 
      if (!this.startedAt) return; 
      const s = Math.floor((Date.now() - this.startedAt) / 1000); 
      const m = Math.floor(s / 60), r = s % 60; 
      this.h_timer.textContent = this.pad(m) + ':' + this.pad(r); 
    }, 1000); 
  }

  setPhase(p) { 
    this.h_phase.textContent = p; 
  }

  setStart(ts) { 
    this.startedAt = Date.parse(ts || new Date()); 
    this.startTimer(); 
    this.setLinks(); 
  }

  updateMarket(m) {
    if (!m) return;
    const fmtUSD = (v) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
      const abs = Math.abs(v);
      const dec = abs >= 1 ? 2 : (abs >= 0.01 ? 4 : 8);
      return '$' + v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };
    
    if (m.price != null) { this.metricEls.priceEl.textContent = fmtUSD(m.price); }
    if (m.fdv != null) { this.metricEls.fdvEl.textContent = fmtUSD(m.fdv); }
    if (m.liquidity != null) { this.metricEls.liqEl.textContent = fmtUSD(m.liquidity); }
    if (m.volume24h != null) { this.metricEls.volEl.textContent = fmtUSD(m.volume24h); }
  }

  badgeClassForScore(val, kind) {
    try {
      if (typeof val !== 'number') return '';
      if (kind === 'risk') { 
        if (val <= 3) return 'ok'; 
        if (val <= 6) return 'warn'; 
        return 'bad'; 
      }
      if (kind === 'branch') { 
        if (val >= 70) return 'ok'; 
        if (val >= 40) return 'warn'; 
        return 'bad'; 
      }
    } catch {}
    return '';
  }

  updateScores(a) { 
    this.latestScores = { branch: a?.branchScore ?? null, risk: a?.riskScore ?? null }; 
  }

  setLinks() {
    try {
      const m = this.mint || '';
      if (m && m.length > 20) {
        this.link_sol.href = 'https://solscan.io/token/' + encodeURIComponent(m);
        this.link_dex.href = 'https://dexscreener.com/solana/' + encodeURIComponent(m);
        this.link_sol.style.display = 'inline-block';
        this.link_dex.style.display = 'inline-block';
        // Kick off sparkline fetch/animate
        this.loadSpark();
      } else {
        this.link_sol.style.display = 'none';
        this.link_dex.style.display = 'none';
      }
    } catch {}
  }

  setContext(text) {
    try {
      if (!text) { 
        this.context.style.display = 'none'; 
        return; 
      }
      this.context.style.display = 'block';
      const raw = String(text || '').trim();
      const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const kv = {};
      for (const ln of lines) {
        const m = ln.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
        if (m) { kv[m[1].toLowerCase()] = m[2]; }
      }
      
      // Build formatted view if we detected keys; else fallback to plain text
      if (Object.keys(kv).length) {
        const esc = (s) => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const wrap = document.createElement('div');
        const kvWrap = document.createElement('div'); 
        kvWrap.className = 'kv';
        const addRow = (label, valueEl) => {
          const l = document.createElement('div'); 
          l.className = 'label'; 
          l.textContent = label; 
          const v = document.createElement('div'); 
          v.className = 'value'; 
          if (valueEl instanceof HTMLElement) v.appendChild(valueEl); 
          else v.innerHTML = esc(valueEl); 
          kvWrap.appendChild(l); 
          kvWrap.appendChild(v);
        };
        
        if (kv.type) addRow('Type', kv.type);
        if (kv.scores) addRow('Scores', kv.scores);
        if (kv.narrative) {
          const chips = document.createElement('div'); 
          chips.className = 'chips';
          const parts = kv.narrative.split(/[,|]/).map(s => s.trim()).filter(Boolean).slice(0, 8);
          for (const p of parts) { 
            const c = document.createElement('span'); 
            c.className = 'chip'; 
            c.textContent = p; 
            chips.appendChild(c); 
          }
          addRow('Narrative', chips);
        }
        if (kv.pros) {
          const ul = document.createElement('ul'); 
          ul.className = 'pros-list';
          kv.pros.split(/;|\u2022|\n/).map(s => s.trim()).filter(Boolean).slice(0, 10).forEach(it => { 
            const li = document.createElement('li'); 
            li.textContent = it; 
            ul.appendChild(li); 
          });
          addRow('Pros', ul);
        }
        if (kv.cons) {
          const ul = document.createElement('ul'); 
          ul.className = 'cons-list';
          kv.cons.split(/;|\u2022|\n/).map(s => s.trim()).filter(Boolean).slice(0, 10).forEach(it => { 
            const li = document.createElement('li'); 
            li.textContent = it; 
            ul.appendChild(li); 
          });
          addRow('Cons', ul);
        }
        if (kv.mkt || kv.market) addRow('Market', kv.mkt || kv.market);
        if (kv.notes) {
          const ul = document.createElement('ul');
          kv.notes.split(/\s*\|\s*|\n/).map(s => s.trim()).filter(Boolean).slice(0, 6).forEach(it => { 
            const li = document.createElement('li'); 
            li.textContent = it; 
            ul.appendChild(li); 
          });
          addRow('Notes', ul);
        }
        
        wrap.appendChild(kvWrap);
        this.ctxBody.innerHTML = '';
        this.ctxBody.appendChild(wrap);
      } else {
        this.ctxBody.textContent = raw;
      }
    } catch {}
  }

  loadSpark() {
    // Placeholder for sparkline loading - implement based on your needs
    try {
      if (window.LiveMarket?.drawSparkline && this.spark && this.mint) {
        // You would fetch sparkline data and draw it here
        // This is a simplified version
        window.LiveMarket.drawSparkline(this.spark, [], { 
          color: '#79e08f', 
          lineWidth: 1.5 
        });
      }
    } catch {}
  }

  collapse() {
    try {
      if (this.timerIv) {
        clearInterval(this.timerIv);
        this.timerIv = null;
      }
      this.active = false;
      this.finishedAt = Date.now();
    } catch {}
  }

  // Mark finished (compat with pre-refactor)
  finish() {
    try {
      this.setPhase?.('Idle');
      this.collapse();
    } catch {}
  }
}

/**
 * Switch to panel
 */
function switchToPanel(panel) {
  // Hide all panels
  panels.forEach(p => {
    p.el.classList.remove('active');
    if (p.tab) p.tab.classList.remove('active');
  });
  
  // Show selected panel
  if (panel) {
    panel.el.classList.add('active');
    if (panel.tab) panel.tab.classList.add('active');
    activePanel = panel;
  }
  
  // Show/hide tabs container
  if (tabsContainer) {
    tabsContainer.style.display = panels.size > 0 ? 'flex' : 'none';
  }
}

/**
 * Get or create panel for mint
 */
function getOrCreatePanel(mint) {
  if (!mint) return null;
  
  // Check if panel already exists
  for (const [key, panel] of panels) {
    if (panel.mint === mint) {
      return panel;
    }
  }
  
  // Create new panel
  const panel = new Panel(mint);
  panels.set(mint, panel);
  
  // Switch to new panel if it's the first one
  if (panels.size === 1) {
    switchToPanel(panel);
  }
  
  return panel;
}

/**
 * Remove panel
 */
function removePanel(panel) {
  if (!panel) return;
  
  try {
    // Remove from DOM
    if (panel.el && panel.el.parentNode) {
      panel.el.parentNode.removeChild(panel.el);
    }
    if (panel.tab && panel.tab.parentNode) {
      panel.tab.parentNode.removeChild(panel.tab);
    }
    
    // Clean up
    panel.collapse();
    
    // Remove from panels map
    for (const [key, p] of panels) {
      if (p === panel) {
        panels.delete(key);
        break;
      }
    }
    
    // Switch to another panel if this was active
    if (activePanel === panel) {
      const remainingPanels = Array.from(panels.values());
      if (remainingPanels.length > 0) {
        switchToPanel(remainingPanels[0]);
      } else {
        activePanel = null;
      }
    }
    
    // Update tabs visibility
    if (tabsContainer) {
      tabsContainer.style.display = panels.size > 0 ? 'flex' : 'none';
    }
  } catch {}
}

/**
 * Create run and associated panel
 */
function createRun(mint, pid = null) {
  if (!mint) return null;
  
  const panel = getOrCreatePanel(mint);
  if (panel && pid) {
    panel.pid = pid;
  }
  
  return panel;
}

/**
 * Handle run completion
 */
function onRunCompleted(pid, mint) {
  // Find panel by PID or mint
  let panel = null;
  for (const [key, p] of panels) {
    if ((pid && p.pid === pid) || (mint && p.mint === mint)) {
      panel = p;
      break;
    }
  }
  
  if (panel) {
    panel.setPhase('Completed');
    panel.collapse();
    
    // You could add completion-specific logic here
    // Like showing a final report or changing styling
  }
}

// Export panels functionality
window.LivePanels = {
  Panel,
  panels,
  suppressedMints,
  activePanel,
  switchToPanel,
  getOrCreatePanel,
  removePanel,
  createRun,
  onRunCompleted,
  init: initPanels
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPanels);
} else {
  initPanels();
}
