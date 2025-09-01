// token-ai/agents/store.js

import { loadAgentState as loadFS, saveAgentState as saveFS, pruneMemory } from './registry.js';

// Optional DB-backed state via Prisma. Falls back to FS if unavailable.
let prisma = null;
try {
  const mod = await import('../../config/prisma.js');
  prisma = mod?.prisma || mod?.default || null;
} catch {}

const STORE_MODE = (process.env.TOKEN_AI_AGENT_STORE || 'auto').toLowerCase();

async function dbAvailable() {
  if (!prisma) return false;
  try {
    // Lightweight probe
    await prisma.$queryRawUnsafe('SELECT 1');
    // Check via information_schema to avoid regclass deserialization
    const rows = await prisma.$queryRawUnsafe(
      "SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name='agent_memory'"
    );
    const c = Array.isArray(rows) && rows[0] ? Number(rows[0].c) : 0;
    return c > 0;
  } catch {
    return false;
  }
}

export async function loadAgentStateStore(mint) {
  if (STORE_MODE === 'fs') return loadFS(mint);
  if (STORE_MODE === 'db' || STORE_MODE === 'auto') {
    if (await dbAvailable()) {
      try {
        const row = await prisma.$queryRawUnsafe(
          'SELECT token_address, schema_version, interactions_count, digest_latest, data, created_at, updated_at FROM agent_memory WHERE token_address = $1',
          mint
        );
        if (Array.isArray(row) && row.length) {
          const r = row[0];
          return {
            schema_version: r.schema_version || 'v1',
            mint: r.token_address,
            created_at: r.created_at?.toISOString?.() || r.created_at || null,
            updated_at: r.updated_at?.toISOString?.() || r.updated_at || null,
            interactions_count: r.interactions_count || 0,
            memory: r.data || {}
          };
        }
      } catch {}
    }
  }
  // Fallback to FS
  return loadFS(mint);
}

export async function saveAgentStateStore(mint, state, opts = {}) {
  state = pruneMemory(state);
  if (STORE_MODE === 'fs') return saveFS(mint, state);
  if (STORE_MODE === 'db' || STORE_MODE === 'auto') {
    if (await dbAvailable()) {
      try {
        const digest = opts.digest || '';
        await prisma.$executeRawUnsafe(
          `INSERT INTO agent_memory (token_address, schema_version, interactions_count, digest_latest, data, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
           ON CONFLICT (token_address)
           DO UPDATE SET schema_version = EXCLUDED.schema_version,
                         interactions_count = EXCLUDED.interactions_count,
                         digest_latest = EXCLUDED.digest_latest,
                         data = EXCLUDED.data,
                         updated_at = NOW()`,
          state.mint || mint, state.schema_version || 'v1', state.interactions_count || 0, digest, JSON.stringify(state.memory || {})
        );
        return true;
      } catch {
        // fall through to FS
      }
    }
  }
  return saveFS(mint, state);
}

export const AGENT_MEMORY_DDL = `
CREATE TABLE IF NOT EXISTS agent_memory (
  token_address TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL DEFAULT 'v1',
  interactions_count INTEGER NOT NULL DEFAULT 0,
  digest_latest TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
