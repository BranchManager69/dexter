// token-ai/agents/registry.js

import fs from 'fs';
import path from 'path';

const AGENTS_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'state');

function ensureDir() {
  try { fs.mkdirSync(AGENTS_DIR, { recursive: true }); } catch {}
}

function safeMint(mint) {
  const s = String(mint || '').trim();
  // Base58-ish guard; also enforce filename safety
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return null;
  return s;
}

export function getAgentPath(mint) {
  const m = safeMint(mint);
  if (!m) return null;
  ensureDir();
  return path.join(AGENTS_DIR, `${m}.json`);
}

export function loadAgentState(mint) {
  const p = getAgentPath(mint);
  if (!p) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const state = JSON.parse(raw);
    return state && typeof state === 'object' ? state : null;
  } catch {
    return {
      schema_version: 'v1',
      mint,
      created_at: new Date().toISOString(),
      updated_at: null,
      interactions_count: 0,
      memory: {
        token_type: null,
        last_scores: { branchScore: null, riskScore: null },
        socials: { x: null, telegram: null, discord: null, websites: [] },
        narrative: { vibe: null, momentum: null, coordination: null },
        red_flags: [],
        green_flags: [],
        notes: [],
        citations: [],
        tags: []
      }
    };
  }
}

export function saveAgentState(mint, state) {
  const p = getAgentPath(mint);
  if (!p) return false;
  try {
    const st = { ...state };
    st.updated_at = new Date().toISOString();
    fs.writeFileSync(p, JSON.stringify(st, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function pruneMemory(state, opts = {}) {
  const maxNotes = opts.maxNotes ?? 50;
  const maxCites = opts.maxCitations ?? 50;
  try {
    if (Array.isArray(state?.memory?.notes) && state.memory.notes.length > maxNotes) {
      state.memory.notes = state.memory.notes.slice(-maxNotes);
    }
    if (Array.isArray(state?.memory?.citations) && state.memory.citations.length > maxCites) {
      state.memory.citations = state.memory.citations.slice(-maxCites);
    }
  } catch {}
  return state;
}

