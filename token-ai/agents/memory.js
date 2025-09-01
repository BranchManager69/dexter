// token-ai/agents/memory.js

import { pruneMemory } from './registry.js';
import { formatMarketLine } from './market.js';

// Build a compact digest string for injection into system prompt.
export function buildMemoryDigest(state, maxChars = 1200) {
  try {
    const m = state?.memory || {};
    const parts = [];
    if (m.token_type) parts.push(`type:${m.token_type}`);
    if (m.last_scores) {
      const bs = m.last_scores.branchScore;
      const rs = m.last_scores.riskScore;
      if (bs != null || rs != null) parts.push(`scores:${bs ?? 'na'}/${rs ?? 'na'}`);
    }
    const socials = [];
    if (m.socials?.x) socials.push(`x:@${m.socials.x}`);
    if (m.socials?.telegram) socials.push(`tg:${m.socials.telegram}`);
    if (m.socials?.discord) socials.push(`dc:${m.socials.discord}`);
    if ((m.socials?.websites || []).length) socials.push(`sites:${(m.socials.websites||[]).slice(0,2).join(',')}`);
    if (socials.length) parts.push(`socials:${socials.join(' ')}`);
    if (m.narrative) {
      const nv = [m.narrative.vibe, m.narrative.momentum, m.narrative.coordination].filter(Boolean).join(',');
      if (nv) parts.push(`narrative:${nv}`);
    }
    const cons = (m.red_flags||[]).slice(-5).join('; ');
    const pros = (m.green_flags||[]).slice(-5).join('; ');
    if (pros) parts.push(`pros:${pros}`);
    if (cons) parts.push(`cons:${cons}`);
    if (m.market) { const line = formatMarketLine(m.market); if (line) parts.push(`mkt:${line}`); }
    const notes = (m.notes||[]).slice(-3).join(' | ');
    if (notes) parts.push(`notes:${notes}`);
    let digest = parts.join('\n');
    if (digest.length > maxChars) digest = digest.slice(0, maxChars);
    return digest;
  } catch {
    return '';
  }
}

// Build a digest with emphasis by scope
export function buildScopedDigest(state, scope = 'general', maxChars = 4000) {
  try {
    const m = state?.memory || {};
    const parts = [];
    const push = (label, val) => { if (val) parts.push(`${label}:${val}`); };
    switch (scope) {
      case 'comms':
        push('type', m.token_type);
        push('scores', fmtScores(m.last_scores));
        push('narrative', [m?.narrative?.vibe, m?.narrative?.momentum, m?.narrative?.coordination].filter(Boolean).join(','));
        push('socials', fmtSocials(m.socials));
        push('notes', (m.notes||[]).slice(-5).join(' | '));
        break;
      case 'pros':
        push('type', m.token_type);
        push('scores', fmtScores(m.last_scores));
        push('pros', (m.green_flags||[]).slice(-8).join('; '));
        break;
      case 'cons':
        push('type', m.token_type);
        push('scores', fmtScores(m.last_scores));
        push('cons', (m.red_flags||[]).slice(-8).join('; '));
        break;
      case 'pros_cons':
        push('type', m.token_type);
        push('scores', fmtScores(m.last_scores));
        push('pros', (m.green_flags||[]).slice(-8).join('; '));
        push('cons', (m.red_flags||[]).slice(-8).join('; '));
        break;
      case 'summary':
        push('type', m.token_type);
        push('scores', fmtScores(m.last_scores));
        push('notes', (m.notes||[]).slice(-8).join(' | '));
        push('cites', (m.citations||[]).slice(-6).map(c=>c.url).join(' '));
        if (m.market) { const ml = formatMarketLine(m.market); if (ml) push('mkt', ml); }
        break;
      case 'full':
        return buildMemoryDigest(state, maxChars);
      case 'general':
      default:
        return buildMemoryDigest(state, maxChars);
    }
    let out = parts.filter(Boolean).join('\n');
    if (out.length > maxChars) out = out.slice(0, maxChars);
    return out;
  } catch {
    return buildMemoryDigest(state, maxChars);
  }
}

// no-op

function fmtScores(s){ if (!s) return ''; const a = s.branchScore ?? 'na'; const b = s.riskScore ?? 'na'; return `${a}/${b}`; }
function fmtSocials(s){
  if (!s) return '';
  const bits = [];
  if (s.x) bits.push(`x:@${s.x}`);
  if (s.telegram) bits.push(`tg:${s.telegram}`);
  if (s.discord) bits.push(`dc:${s.discord}`);
  if ((s.websites||[]).length) bits.push(`sites:${(s.websites||[]).slice(0,2).join(',')}`);
  return bits.join(' ');
}

// Update state from an analysis result
export function updateStateFromAnalysis(state, analysis) {
  try {
    const m = state.memory || (state.memory = {});
    if (analysis.tokenType) m.token_type = analysis.tokenType;
    if (typeof analysis.branchScore === 'number' || typeof analysis.riskScore === 'number') {
      m.last_scores = {
        branchScore: clampInt(analysis.branchScore, 0, 100, m.last_scores?.branchScore ?? null),
        riskScore: clampInt(analysis.riskScore, 0, 10, m.last_scores?.riskScore ?? null)
      };
    }
    if (analysis.memeSignals) {
      const ms = analysis.memeSignals;
      m.narrative = {
        vibe: ms.vibe ?? m.narrative?.vibe ?? null,
        momentum: ms.momentumTrend ?? m.narrative?.momentum ?? null,
        coordination: ms.coordinationStyle ?? m.narrative?.coordination ?? null
      };
    }
    // very light extraction of socials from analysis.metadata if present
    const cites = analysis?.metadata?.web_citations || [];
    if (Array.isArray(cites) && cites.length) {
      const prior = new Set((m.citations||[]).map(c => c.url).filter(Boolean));
      const newC = [];
      for (const c of cites) {
        if (c?.url && !prior.has(c.url)) newC.push({ url: c.url, title: c.title || null });
      }
      m.citations = [...(m.citations||[]), ...newC].slice(-50);
    }
    // Append notable flags (dedup & clamp)
    if (Array.isArray(analysis.redFlags)) m.red_flags = uniqClamp([...(m.red_flags||[]), ...analysis.redFlags], 50);
    if (Array.isArray(analysis.greenFlags)) m.green_flags = uniqClamp([...(m.green_flags||[]), ...analysis.greenFlags], 50);
    // Optional note
    if (analysis.summary) {
      const s = String(analysis.summary).trim();
      if (s) m.notes = uniqClamp([...(m.notes||[]), s.slice(0, 200)], 50);
    }
    state.interactions_count = (state.interactions_count || 0) + 1;
  } catch {}
  return pruneMemory(state);
}

// Mid-run checkpoint: update memory from socials_orchestrate result
export function updateStateFromSocials(state, soc) {
  try {
    if (!state.memory) state.memory = {};
    const m = state.memory;
    if (!m.socials) m.socials = { x: null, telegram: null, discord: null, websites: [] };
    // X handle
    const handle = soc?.twitter?.profile?.handle || soc?.twitter?.handle;
    if (handle) m.socials.x = handle.replace(/^@/, '');
    // Telegram URL (store last path component or URL)
    const tgUrl = soc?.telegram?.url || (Array.isArray(soc?.official_links) ? soc.official_links.find(l=> (l.platform||'').toLowerCase()==='telegram')?.url : null);
    if (tgUrl) m.socials.telegram = tgUrl;
    // Discord (if present)
    const dcUrl = Array.isArray(soc?.official_links) ? soc.official_links.find(l=> (l.platform||'').toLowerCase()==='discord')?.url : null;
    if (dcUrl) m.socials.discord = dcUrl;
    // Websites list (limit 3)
    const sites = [];
    if (soc?.website?.url) sites.push(soc.website.url);
    if (Array.isArray(soc?.websites_from_db)) sites.push(...soc.websites_from_db.map(w=>w.url).filter(Boolean));
    if (Array.isArray(soc?.official_links)) sites.push(...soc.official_links.filter(l=> (l.platform||'').toLowerCase()==='website').map(l=>l.url));
    const uniq = [];
    const seen = new Set();
    for (const u of sites) { const k=String(u); if (!seen.has(k)) { seen.add(k); uniq.push(k); } if (uniq.length>=3) break; }
    m.socials.websites = uniq;
    state.interactions_count = (state.interactions_count || 0) + 1;
  } catch {}
  return pruneMemory(state);
}

function clampInt(v, min, max, def = null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function uniqClamp(arr, max) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x);
    if (!seen.has(k)) { seen.add(k); out.push(x); }
    if (out.length >= max) break;
  }
  return out;
}
