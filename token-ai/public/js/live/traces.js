// public/js/live/traces.js
// Minimal All Traces panel: listens to window 'ai:terminal' events and renders
// a filterable list of normalized trace items.

const ui = {
  panel: document.getElementById('tracesPanel'),
  toggle: document.getElementById('tracesToggle'),
  list: document.getElementById('tracesList'),
  step: document.getElementById('tracesStep'),
  kind: document.getElementById('tracesKind'),
  search: document.getElementById('tracesSearch'),
  pause: document.getElementById('tracesPause'),
  clear: document.getElementById('tracesClear'),
};

const state = {
  items: [], // { at, subtype, kind, step, text, raw }
  paused: false,
  max: 500,
};

function fmtTime(d){
  try { const dt = new Date(d); return dt.toLocaleTimeString(); } catch { return String(d||''); }
}

function normalize(msg){
  try {
    if (!msg || msg.type !== 'DATA' || msg.topic !== 'terminal') return null;
    const { subtype, event, data } = msg;
    const at = Date.now();
    let items = [];
    if (subtype === 'runner' && event === 'runner:log') {
      const line = String(data?.line || '');
      const m = line.match(/^\[trace\]\s+(\{.*\})$/);
      if (m) {
        try { const t = JSON.parse(m[1]); items.push({ at, subtype, kind: `step_${String(t.status||'')}`, step: String(t.step||''), text: line, raw: msg }); } catch {}
      }
      items.push({ at, subtype, kind: 'runner_log', step: '', text: line, raw: msg });
      return items;
    }
    if (subtype === 'ai_session') {
      if (event && event.startsWith('process:')) {
        const k = event.split(':')[1];
        items.push({ at, subtype, kind: k, step: String(data?.step||''), text: k, raw: msg });
        return items;
      }
      if (event === 'agent:status') { items.push({ at, subtype, kind: 'status', step: '', text: String(data?.text||'') || 'status', raw: msg }); return items; }
      if (event === 'agent:error') { items.push({ at, subtype, kind: 'error', step: '', text: String(data?.text||'') || 'error', raw: msg }); return items; }
      if (event === 'agent:tool_call') { items.push({ at, subtype, kind: 'tool_call', step: '', text: String(data?.name||'tool_call'), raw: msg }); return items; }
      if (event === 'agent:tool_result') { items.push({ at, subtype, kind: 'tool_result', step: '', text: String(data?.name||'tool_result'), raw: msg }); return items; }
    }
    return null;
  } catch { return null; }
}

function pushItems(arr){
  if (!Array.isArray(arr) || !arr.length) return;
  for (const it of arr) { state.items.push(it); }
  if (state.items.length > state.max) state.items.splice(0, state.items.length - state.max);
  render();
}

function render(){
  try {
    if (!ui.list) return;
    const fStep = String(ui.step?.value||'');
    const fKind = String(ui.kind?.value||'');
    const q = String(ui.search?.value||'').toLowerCase();
    const rows = [];
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      if (fStep && String(it.step||'') !== fStep) continue;
      if (fKind && String(it.kind||'') !== fKind) continue;
      if (q && !(`${it.kind||''} ${it.step||''} ${it.text||''}`.toLowerCase().includes(q))) continue;
      rows.push(it);
      if (rows.length >= 300) break;
    }
    ui.list.innerHTML='';
    for (const it of rows) {
      const line = document.createElement('div'); line.style.display='grid'; line.style.gridTemplateColumns='70px 110px 110px 1fr'; line.style.gap='8px'; line.style.alignItems='baseline';
      const t = document.createElement('div'); t.textContent=fmtTime(it.at); t.style.color='#9fb2c8'; t.style.fontSize='11px';
      const sub = document.createElement('div'); sub.textContent=it.subtype; sub.style.color='#6b8fb2'; sub.style.fontSize='11px';
      const kd = document.createElement('div'); kd.textContent=it.kind; kd.style.fontSize='11px'; kd.style.color = it.kind==='error' ? '#ff7b7b' : (it.kind==='step_end' ? '#7ce38b' : (it.kind==='step_start' ? '#8ab4ff' : '#b8c6d6'));
      const tx = document.createElement('div'); tx.textContent = it.step ? `[${it.step}] ${it.text}` : it.text;
      line.appendChild(t); line.appendChild(sub); line.appendChild(kd); line.appendChild(tx);
      ui.list.appendChild(line);
    }
  } catch {}
}

function init(){
  try {
    if (ui.toggle && ui.panel) ui.toggle.addEventListener('click', ()=>{ ui.panel.style.display = (ui.panel.style.display==='none'||!ui.panel.style.display) ? 'block' : 'none'; });
    if (ui.step) ui.step.addEventListener('change', render);
    if (ui.kind) ui.kind.addEventListener('change', render);
    if (ui.search) ui.search.addEventListener('input', render);
    if (ui.pause) ui.pause.addEventListener('click', ()=>{ state.paused = !state.paused; ui.pause.textContent = state.paused ? 'Resume' : 'Pause'; });
    if (ui.clear) ui.clear.addEventListener('click', ()=>{ state.items=[]; render(); });
    window.addEventListener('ai:terminal', (e)=>{ if (state.paused) return; const items = normalize(e.detail?.msg); if (items) pushItems(items); });
  } catch {}
}

init();

