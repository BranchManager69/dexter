// public/js/auth.js
// Lightweight auth widget shared by live + dashboard pages.
// - Shows logged in/out status (Supabase, if configured)
// - Inline modal for magic-link sign in
// - Sign out control

(function(){
  const state = {
    supabase: null,
    session: null,
    configured: false,
    initStarted: false,
    el: null,
    modal: null,
    statusText: 'Auth: …'
  };

  function $(id){ return document.getElementById(id); }

  function ensureSlot(){
    let el = $('authbar');
    if (!el) {
      // Try to inject into header right-most area
      try {
        const header = document.querySelector('header .row:last-child') || document.querySelector('header');
        if (header) {
          el = document.createElement('span');
          el.id = 'authbar';
          el.className = 'badge dim';
          el.textContent = 'Auth: …';
          header.appendChild(el);
        }
      } catch {}
    }
    state.el = el || null;
  }

  function setBadge(text, cls){
    if (!state.el) return;
    state.el.textContent = text;
    state.el.classList.remove('ok','warn','bad','dim');
    state.el.classList.add(cls || 'dim');
  }

  function buildModal(){
    if (state.modal) return state.modal;
    const wrap = document.createElement('div');
    wrap.id = 'authModal';
    wrap.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:10000; align-items:center; justify-content:center;';
    wrap.innerHTML = `
      <div style="background:#0b0f14; color:#d8e0ea; border:1px solid #1c2733; border-radius:8px; width:min(420px, 95vw); display:flex; flex-direction:column; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.6)">
        <div style="display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid #1c2733; background:#0d1319;">
          <strong style="font-size:14px">Sign in</strong>
          <button id="authClose" style="margin-left:auto; background:#0f161f; color:#9fb2c8; border:1px solid #2a3b4d; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:12px">Close</button>
        </div>
        <div style="padding:10px 12px; display:grid; gap:8px;">
          <div style="font-size:12px; color:#9fb2c8">Enter your email. We’ll send a magic link.</div>
          <input id="authEmail" type="email" placeholder="you@example.com" style="background:#0a1016; color:#c7d1dc; border:1px solid #203042; border-radius:4px; padding:6px 8px; font-size:12px" />
          <button id="authSend" style="background:#0f161f; color:#e6edf3; border:1px solid #2a3b4d; border-radius:4px; padding:6px 8px; cursor:pointer; font-size:12px">Send magic link</button>
          <div id="authMsg" style="font-size:12px; color:#9fb2c8"></div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = $('authClose');
    const send = $('authSend');
    close.onclick = () => { wrap.style.display='none'; };
    send.onclick = async () => {
      const email = String(($('authEmail')||{}).value||'').trim();
      const msg = $('authMsg');
      if (!email) { if (msg) msg.textContent = 'Enter your email.'; return; }
      if (!state.supabase) { if (msg) msg.textContent = 'Auth not configured.'; return; }
      try {
        if (msg) msg.textContent = 'Sending link…';
        const redir = location.origin + location.pathname;
        const { error } = await state.supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redir, shouldCreateUser: true } });
        if (error) { if (msg) msg.textContent = 'Error: '+error.message; return; }
        if (msg) msg.textContent = 'Check your email for the sign‑in link.';
      } catch (e) {
        if (msg) msg.textContent = 'Error: '+(e?.message||e);
      }
    };
    state.modal = wrap;
    return wrap;
  }

  function openModal(){ buildModal(); try { state.modal.style.display = 'flex'; } catch {} }

  async function refreshSession(){
    try {
      if (!state.supabase) { state.session = null; setBadge('Auth: disabled', 'dim'); return; }
      const { data } = await state.supabase.auth.getSession();
      state.session = data?.session || null;
      updateUiFromSession();
    } catch {}
  }

  function updateUiFromSession(){
    const s = state.session;
    if (!state.supabase) { setBadge('Auth: disabled', 'dim'); return; }
    if (s) {
      const email = s.user?.email || s.user?.id || 'user';
      setBadge(`Signed in: ${email}`, 'ok');
      state.el.style.cursor = 'pointer';
      state.el.title = 'Click to sign out';
      state.el.onclick = async () => {
        try { await state.supabase.auth.signOut(); } catch {}
        await refreshSession();
      };
    } else {
      setBadge('Sign in', 'warn');
      state.el.style.cursor = 'pointer';
      state.el.title = 'Click to sign in';
      state.el.onclick = () => openModal();
    }
  }

  async function initSupabaseFromConfig(){
    if (state.initStarted) return; state.initStarted = true;
    // Reuse existing client if present
    try {
      if (window.SUPABASE && window.SUPABASE.client) {
        state.supabase = window.SUPABASE.client;
        state.configured = true;
        try { state.supabase.auth.onAuthStateChange((_evt, session) => { state.session = session || null; updateUiFromSession(); }); } catch {}
        await refreshSession();
        return;
      }
    } catch {}
    // Fetch config and load UMD if available
    try {
      const r = await fetch('/auth/config', { cache: 'no-cache' });
      const j = await r.json().catch(()=>null);
      const url = j?.supabaseUrl || '';
      const key = j?.supabaseAnonKey || '';
      if (!j?.ok || !url || !key) { state.configured = false; setBadge('Auth: disabled', 'dim'); return; }
      state.configured = true;
      const el = document.createElement('script');
      el.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      el.async = true; el.onload = async () => {
        try {
          const sb = window.supabase.createClient(url, key, { auth: { persistSession:true, autoRefreshToken:true } });
          state.supabase = sb;
          try { sb.auth.onAuthStateChange((_evt, session)=>{ state.session = session||null; updateUiFromSession(); }); } catch {}
          await refreshSession();
        } catch {
          setBadge('Auth: error', 'bad');
        }
      };
      document.head.appendChild(el);
    } catch {
      setBadge('Auth: error', 'bad');
    }
  }

  function init(){
    ensureSlot();
    if (!state.el) return; // nothing to do
    // Build modal once so it’s ready when needed
    buildModal();
    // Kick off supabase init (reuses existing if live page already bootstrapped it)
    initSupabaseFromConfig();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

