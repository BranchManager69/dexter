// token-ai/core/run-manager.js

// Shared child-process run manager for analyzer/social orchestrator
// Centralizes: spawn, tracking, log ring buffer, limits, and termination.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Limits via env (kept in one place)
export const RUN_LIMIT = Number(process.env.TOKEN_AI_MAX_CONCURRENCY || 3);
export const LOGS_PER_RUN_LIMIT = Number(process.env.TOKEN_AI_LOGS_PER_RUN_LIMIT || 200);
export const CHILD_MAX_MB = Number(process.env.TOKEN_AI_CHILD_MAX_MB || 1024);

// In-memory active run tracking
// pid -> { kind, args, mint?: string|null, startedAt: number, logs: [{stream,line,at}] }
export const activeRuns = new Map();
export const childProcs = new Map();

// Optional listeners set by hosts (server or MCP) for cross-cutting effects (e.g., WS broadcast)
let onLogListener = null;   // ({ pid, mint, stream, line, at }) => void
let onExitListener = null;  // ({ pid, mint, code, signal, endedAt }) => void

export function setRunLogListener(fn){ onLogListener = typeof fn === 'function' ? fn : null; }
export function setRunExitListener(fn){ onExitListener = typeof fn === 'function' ? fn : null; }

// Internal helper: push a log line into the ring buffer and notify listener
function pushLog(pid, stream, buf){
  try {
    const text = buf.toString('utf8');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      const rec = activeRuns.get(pid);
      if (rec) {
        rec.logs.push({ stream, line, at: Date.now() });
        if (rec.logs.length > LOGS_PER_RUN_LIMIT) rec.logs.splice(0, rec.logs.length - LOGS_PER_RUN_LIMIT);
        if (onLogListener) {
          try { onLogListener({ pid, mint: rec.mint || null, stream, line, at: Date.now() }); } catch {}
        }
      }
    }
  } catch {}
}

// Resolve repo paths
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_AI_DIR = path.resolve(HERE, '..');

// Spawn a managed run.
// kind: 'agent' | 'socials' | string (tag only)
// args: string[]
// options: { cwd?, env?, entry?, mint?, inheritMemoryCap?: boolean }
export function spawnAnalyzer(kind, args, options = {}){
  const { cwd, env: envIn, entry, mint, inheritMemoryCap = true } = options;
  const entryPath = entry || (kind === 'agent'
    ? path.join(TOKEN_AI_DIR, 'index.js')
    : kind === 'socials'
      ? path.join(TOKEN_AI_DIR, 'socials', 'orchestrator.js')
      : path.join(TOKEN_AI_DIR, 'index.js'));

  // Prepare env and memory cap for child
  const env = { ...process.env, ...(envIn || {}) };
  if (inheritMemoryCap) {
    const existing = env.NODE_OPTIONS ? String(env.NODE_OPTIONS) + ' ' : '';
    env.NODE_OPTIONS = existing + `--max-old-space-size=${CHILD_MAX_MB}`;
  }

  const nodeBin = process.execPath || 'node';
  const child = spawn(nodeBin, [entryPath, ...(Array.isArray(args) ? args : [])], {
    cwd: cwd || path.resolve(TOKEN_AI_DIR, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const pid = child.pid;
  const rec = { kind: String(kind || 'agent'), args: Array.isArray(args) ? args.slice() : [], mint: mint ?? (Array.isArray(args) ? (args[0] || null) : null), startedAt: Date.now(), logs: [] };
  activeRuns.set(pid, rec);
  childProcs.set(pid, child);

  try { child.stdout.on('data', (d)=>pushLog(pid,'stdout',d)); } catch {}
  try { child.stderr.on('data', (d)=>pushLog(pid,'stderr',d)); } catch {}
  child.on('exit', (code, signal) => {
    const info = activeRuns.get(pid) || rec;
    activeRuns.delete(pid);
    childProcs.delete(pid);
    if (onExitListener) {
      try { onExitListener({ pid, mint: info.mint || null, code, signal, endedAt: Date.now() }); } catch {}
    }
  });
  return pid;
}

// Terminate a run by PID (SIGTERM then SIGKILL fallback)
export function killRun(pid){
  const child = childProcs.get(Number(pid));
  if (!child) return false;
  try {
    child.kill('SIGTERM');
    setTimeout(() => { try { if (childProcs.has(Number(pid))) child.kill('SIGKILL'); } catch {} }, 1500);
    return true;
  } catch { return false; }
}

// Get logs for a run (bounded)
export function getRunLogs(pid, limit){
  const rec = activeRuns.get(Number(pid));
  if (!rec) return null;
  const lim = Math.max(1, Math.min(LOGS_PER_RUN_LIMIT, Number(limit)||LOGS_PER_RUN_LIMIT));
  return { pid: Number(pid), mint: rec.mint || null, logs: rec.logs.slice(-lim) };
}
