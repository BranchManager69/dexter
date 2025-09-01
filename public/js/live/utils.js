// public/js/live/utils.js
// Utility functions for the Live UI - API helpers, formatters, and common utilities

// API base detection and utility
let API_BASE = (typeof window !== 'undefined' && window.AGENT_BASE) ? String(window.AGENT_BASE || '') : '';

/**
 * Build API URL with proper base path
 */
function api(path) { 
  return (API_BASE || '') + path; 
}

/**
 * Safe JSON stringify with length limiting
 */
function safeJson(v) { 
  try { 
    const s = JSON.stringify(v); 
    return s.length > 600 ? s.slice(0, 600) + '…' : s; 
  } catch { 
    return ''; 
  } 
}

/**
 * Minimal HTML escaper for safe label injection
 */
function esc(s) { 
  return String(s || '').replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c])); 
}

/**
 * Show toast notification
 */
function showToast(msg) {
  try {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = String(msg || '');
    t.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => { t.classList.remove('show'); }, 1200);
  } catch {}
}

/**
 * Shorten public key for display
 */
function shortPk(pk) { 
  if (!pk) return ''; 
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`; 
}

/**
 * Format USD value with appropriate decimals
 */
function fmtUSD(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const dec = abs >= 1 ? 2 : (abs >= 0.01 ? 4 : 8);
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/**
 * Pad number with leading zero
 */
function pad(n) { 
  return n < 10 ? '0' + n : '' + n; 
}

/**
 * Auto-detect API base prefix for reverse proxies
 */
async function detectApiBase() {
  const candidates = ['', '/token-ai', '/ai-ui'];
  for (const p of candidates) {
    try {
      const hdr = {};
      if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN);
      if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN);
      const r = await fetch(p + '/realtime/health?ping=1', { headers: hdr });
      if (r.ok) { 
        const j = await r.json().catch(() => null); 
        if (j && typeof j === 'object' && ('ok' in j)) { 
          API_BASE = p; 
          window.dispatchEvent(new CustomEvent('ai:api-base-detected', { detail: { base: API_BASE || '/' } }));
          return; 
        } 
      }
    } catch {}
  }
  console.warn('API base autodetect failed; using root');
}

/**
 * Format time for display
 */
function fmtTime(d) {
  try { 
    const dt = new Date(d); 
    return dt.toLocaleTimeString(); 
  } catch { 
    return String(d || ''); 
  }
}

// Initialize API base detection
detectApiBase();

// Export utilities
window.LiveUtils = {
  api,
  safeJson,
  esc,
  showToast,
  shortPk,
  fmtUSD,
  pad,
  fmtTime,
  detectApiBase
};