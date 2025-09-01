// Shared MCP server builder: tools, resources, and helpers
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
// NOTE: Trading and wallet utilities pull in heavy deps from the parent monorepo
// and external SDKs. To keep the MCP server bootable in minimal environments,
// we lazy-import those modules inside the specific tool handlers that need them.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_AI_DIR = path.resolve(HERE, '..');
const REPORTS_DIR = path.join(TOKEN_AI_DIR, 'reports', 'ai-token-analyses');
const RESEARCH_DIR = path.join(TOKEN_AI_DIR, 'reports', 'deep-research');
const RESEARCH_NOTES_DIR = path.join(RESEARCH_DIR, 'notes');
const RESEARCH_REPORTS_DIR = path.join(RESEARCH_DIR, 'reports');
const WEBHOOK_URL = process.env.RESEARCH_WEBHOOK_URL || '';
const WEBHOOK_TOKEN = process.env.RESEARCH_WEBHOOK_TOKEN || '';

import { RUN_LIMIT, LOGS_PER_RUN_LIMIT, CHILD_MAX_MB, activeRuns, childProcs, spawnAnalyzer } from '../core/run-manager.js';
const ENABLE_RUN_TOOLS = String(process.env.TOKEN_AI_MCP_ENABLE_RUN_TOOLS || '1') !== '0';

// Per-session wallet overrides (for HTTP sessions) and a shared fallback for stdio
// Keyed by MCP session id when available; otherwise 'stdio'.
const sessionWalletOverrides = new Map(); // sessionKey -> wallet_id

function extractMintFromReport(j, filename){
  try {
    let m = j?.tokenAddress || j?.mint || j?.metadata?.tokenAddress || j?.metadata?.token_address || j?.metadata?.token?.address || j?.token?.address || '';
    if (typeof m === 'string') m = m.trim(); else m = '';
    if (m.startsWith('--mint=')) m = m.slice(7);
    if (m && !m.startsWith('--')) return m;
    // Fallback: filename patterns
    const name = String(filename || '');
    const mintEq = name.match(/mint=([A-Za-z0-9_-]+)/);
    if (mintEq && mintEq[1]) return mintEq[1];
    const base58Matches = name.match(/[1-9A-HJ-NP-Za-km-z]{32,64}/g);
    if (base58Matches && base58Matches.length) {
      return base58Matches.sort((a,b)=> b.length - a.length)[0];
    }
  } catch {}
  return null;
}

function extractMeta(j){
  try {
    const symbol = j?.symbol || j?.ticker || j?.token?.symbol || null;
    const name = j?.name || j?.token?.name || null;
    const created_at = j?.created_at || j?.metadata?.timestamp || j?.metadata?.started_at || null;
    const market = j?.metadata?.market || j?.market || {};
    const fdv = (typeof market?.fdv === 'number') ? market.fdv : null;
    const liquidity = (typeof market?.liquidity === 'number') ? market.liquidity : null;
    const volume24h = (typeof market?.volume24h === 'number' || typeof market?.volume_24h === 'number') ? (market.volume24h ?? market.volume_24h) : null;
    return { symbol: symbol || null, name: name || null, created_at: created_at || null, fdv, liquidity, volume24h };
  } catch {
    return { symbol: null, name: null, created_at: null, fdv: null, liquidity: null, volume24h: null };
  }
}

function reportUriFor(file){
  return `report://ai-token-analyses/${file}`;
}

async function sendResearchWebhook(event, data){
  try {
    if (!WEBHOOK_URL) return;
    const fetch = (await import('node-fetch')).default;
    const body = { event, data, at: Date.now() };
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(WEBHOOK_TOKEN ? { 'x-research-token': WEBHOOK_TOKEN } : {}) },
      body: JSON.stringify(body)
    }).catch(()=>{});
  } catch {}
}

function isValidMint(m){
  try {
    const s = String(m || '').trim();
    if (!s) return false;
    if (s.startsWith('--')) return false;
    // base58-ish length check (32–64)
    return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(s);
  } catch { return false; }
}

// spawnAnalyzer imported from run-manager

function listRecentAnalyses(limit=12){
  let files = [];
  try {
    files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        file: path.join(REPORTS_DIR, f),
        name: f,
        mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs || 0; } catch { return 0; } })()
      }))
      .sort((a,b)=> b.mtime - a.mtime)
      .slice(0, Math.max(1, Math.min(100, Number(limit)||12)));
  } catch {}
  const out = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(f.file, 'utf8');
      const j = JSON.parse(raw);
      const mint = extractMintFromReport(j, f.name);
      const meta = extractMeta(j);
      const branchScore = (typeof j.branchScore === 'number') ? j.branchScore : null;
      const riskScore = (typeof j.riskScore === 'number') ? j.riskScore : null;
      const duration_ms = j?.metadata?.timings?.total_ms || null;
      const price = (meta?.price != null ? meta.price : (j?.metadata?.market?.price ?? null));
      out.push({ mint, branchScore, riskScore, duration_ms, file: f.name, uri: reportUriFor(f.name), mtime: f.mtime, symbol: meta.symbol, name: meta.name, created_at: meta.created_at, fdv: meta.fdv, liquidity: meta.liquidity, volume24h: meta.volume24h, price });
    } catch {}
  }
  return out;
}

function latestAnalysis(){
  let files = [];
  try {
    files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f => f.endsWith('.json'))
      .map(f => ({ file: path.join(REPORTS_DIR, f), name: f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs || 0; } catch { return 0; } })() }))
      .sort((a,b)=> b.mtime - a.mtime)
      .slice(0,1);
  } catch {}
  if (!files.length) return { file:null, mtime:null, data:null };
  const f = files[0];
  let data = null;
  try { data = JSON.parse(fs.readFileSync(f.file, 'utf8')); } catch {}
  return { file: f.name, mtime: f.mtime, data };
}

function findReportByMint(mint){
  try {
    const files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f => f.endsWith('.json'))
      .map(f => ({ file: path.join(REPORTS_DIR, f), name: f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs || 0; } catch { return 0; } })() }))
      .sort((a,b)=> b.mtime - a.mtime);
    const m = String(mint).toLowerCase();
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(f.file, 'utf8'));
        const jm = String(extractMintFromReport(j, f.name) || '').toLowerCase();
        if (jm && (jm === m || jm.includes(m))) {
          return { file: f.name, mtime: f.mtime, data: j };
        }
      } catch {}
    }
  } catch {}
  return { file:null, mtime:null, data:null };
}

export function buildMcpServer(){
  const server = new McpServer({ name: 'token-ai-mcp', version: '0.2.0' }, {
    capabilities: { logging: {}, tools: { listChanged: true } },
    instructions: `Tools and resources for Token-AI analyses.\n- Tools: list_reports_page, list_resource_uris, list_recent_analyses, read_report_uri, get_report, get_latest_analysis${ENABLE_RUN_TOOLS ? ', run_agent, run_socials, list_runs, get_run_logs, kill_run' : ''}.\n- Resources: report://ai-token-analyses/{file} (application/json), report://ai-token-analyses/by-mint/{mint}.\n- Note: set TOKEN_AI_MCP_ENABLE_RUN_TOOLS=0 to hide run/kill tools.`
  });

  // Auth helper: resolve current wallet for this session
  server.registerTool('resolve_wallet', {
    title: 'Resolve Wallet',
    description: 'Returns the effective wallet_id for this caller based on bearer token or env default.',
    outputSchema: { wallet_id: z.string().nullable(), source: z.string() }
  }, async (_args, extra) => {
    const r = resolveWalletForRequest(extra);
    return { structuredContent: r, content:[{ type:'text', text: r.wallet_id || 'none' }] };
  });

  // Session-scoped wallet override (without changing bearer/env)
  server.registerTool('set_session_wallet', {
    title: 'Set Session Wallet',
    description: 'Override the effective wallet_id for this MCP session only. Use resolve_wallet to inspect.',
    inputSchema: { wallet_id: z.string().optional(), clear: z.boolean().optional() },
    outputSchema: { ok: z.boolean(), wallet_id: z.string().nullable(), cleared: z.boolean().optional() }
  }, async ({ wallet_id, clear }, extra) => {
    try {
      const sid = String(extra?.requestInfo?.headers?.['mcp-session-id'] || 'stdio');
      if (clear) {
        sessionWalletOverrides.delete(sid);
        return { structuredContent: { ok: true, wallet_id: null, cleared: true }, content:[{ type:'text', text:'cleared' }] };
      }
      if (!wallet_id) return { content:[{ type:'text', text:'missing wallet_id' }], isError:true };
      sessionWalletOverrides.set(sid, String(wallet_id));
      return { structuredContent: { ok: true, wallet_id: String(wallet_id) }, content:[{ type:'text', text:String(wallet_id) }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'set_failed' }], isError:true };
    }
  });

  // Auth info for diagnostics
  server.registerTool('auth_info', {
    title: 'Auth Info',
    description: 'Diagnostics for wallet resolution and bearer/header state for this session.',
    outputSchema: {
      source: z.string(),
      wallet_id: z.string().nullable(),
      session_id: z.string().nullable(),
      default_wallet: z.string().nullable(),
      bearer_header: z.string().nullable(),
      bearer_preview: z.string().nullable(),
      mapping_hit: z.boolean().optional(),
    }
  }, async (_args, extra) => {
    const headers = extra?.requestInfo?.headers || {};
    const session_id = String(headers['mcp-session-id'] || 'stdio');
    const def = process.env.TOKEN_AI_DEFAULT_WALLET_ID || null;
    const bear = getBearerFromHeaders(headers);
    const bearPrev = bear ? `${bear.slice(0,4)}…${bear.slice(-4)}` : null;
    const map = parseBearerMap();
    const hit = !!(bear && map[bear]);
    const resolved = resolveWalletForRequest(extra);
    return { structuredContent: { source: resolved.source, wallet_id: resolved.wallet_id, session_id, default_wallet: def, bearer_header: bear || null, bearer_preview: bearPrev, mapping_hit: hit }, content:[{ type:'text', text: JSON.stringify({ source: resolved.source, wallet_id: resolved.wallet_id, session_id }, null, 2) }] };
  });

  // Auth + Wallet resolution helpers
  function getBearerFromHeaders(headers){
    try {
      const h = headers || {};
      // Highest priority: explicit user token header
      const xUserToken = String(h['x-user-token'] || h['X-User-Token'] || '');
      if (xUserToken) return xUserToken.trim();
      // Next: X-Authorization (supports either raw token or Bearer <token>)
      const xAuthorization = String(h['x-authorization'] || h['X-Authorization'] || '');
      if (xAuthorization.startsWith('Bearer ')) return xAuthorization.slice(7).trim();
      if (xAuthorization) return xAuthorization.trim();
      // Fallback: standard Authorization header
      const auth = String(h['authorization'] || h['Authorization'] || '');
      if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
      // As a last resort accept X-Api-Key
      const xApiKey = String(h['x-api-key'] || h['X-Api-Key'] || '');
      if (xApiKey) return xApiKey.trim();
    } catch {}
    return null;
  }
  function parseBearerMap(){
    // Supports JSON: { "tokenA": "wallet-id-1", ... } or csv: tokenA:walletA,tokenB:walletB
    try {
      const j = process.env.TOKEN_AI_MCP_BEARER_MAP_JSON;
      if (j) { const obj = JSON.parse(j); if (obj && typeof obj === 'object') return obj; }
    } catch {}
    try {
      const s = process.env.TOKEN_AI_MCP_BEARER_MAP || '';
      if (s) {
        const out = {};
        for (const part of s.split(',')) {
          const [k, v] = part.split(':');
          if (k && v) out[k.trim()] = v.trim();
        }
        return out;
      }
    } catch {}
    return {};
  }
  const BEARER_MAP = parseBearerMap();
  function resolveWalletForRequest(extra){
    // 0) Session override takes precedence when set
    try {
      const sid = String(extra?.requestInfo?.headers?.['mcp-session-id'] || 'stdio');
      if (sessionWalletOverrides.has(sid)) {
        const wid = sessionWalletOverrides.get(sid);
        if (wid) return { wallet_id: wid, source: 'session' };
      }
    } catch {}
    try {
      // HTTP transport: extract from request headers
      const bearer = getBearerFromHeaders(extra?.requestInfo?.headers || {});
      if (bearer && BEARER_MAP[bearer]) {
        return { wallet_id: BEARER_MAP[bearer], source: 'bearer' };
      }
    } catch {}
    // STDIO or fallback: allow env to carry a bearer-like token
    try {
      const envToken = process.env.MCP_BEARER_TOKEN || process.env.TOKEN_AI_BEARER_TOKEN || '';
      if (envToken && BEARER_MAP[envToken]) {
        return { wallet_id: BEARER_MAP[envToken], source: 'bearer' };
      }
    } catch {}
    // Default env wallet id
    const envDefault = process.env.TOKEN_AI_DEFAULT_WALLET_ID || '';
    if (envDefault) return { wallet_id: envDefault, source: 'env' };
    return { wallet_id: null, source: 'none' };
  }

  // =============================
  // Helius Program Accounts V2 tools
  // =============================
  server.registerTool('program_accounts_scan', {
    title: 'Program Accounts Scan (V2)',
    description: 'Paginated scan of accounts owned by a program using Helius getProgramAccountsV2. Supports filters and encoding.',
    inputSchema: {
      program_id: z.string().min(32).describe('Program ID (Pubkey)'),
      limit: z.number().int().min(1).max(10000).optional().describe('Accounts per page (1-10000; default 1000)'),
      pagination_key: z.string().optional().describe('Cursor from previous page (paginationKey)'),
      encoding: z.enum(['base64','jsonParsed']).optional().describe('Account data encoding (default base64)'),
      filters: z.any().optional().describe('getProgramAccounts-style filters: [{ dataSize }, { memcmp: { offset, bytes } }]'),
    },
    outputSchema: {
      accounts: z.array(z.any()),
      paginationKey: z.string().nullable().optional(),
      totalResults: z.number().int().optional(),
      used: z.object({ program_id: z.string(), limit: z.number().int(), encoding: z.string(), hadFilters: z.boolean() })
    }
  }, async ({ program_id, limit, pagination_key, encoding, filters }) => {
    try {
      const params = [ String(program_id), {
        limit: Number(limit)||1000,
        encoding: encoding || 'base64',
        ...(filters ? { filters } : {}),
        ...(pagination_key ? { paginationKey: pagination_key } : {})
      } ];
      const result = await rpcCall('getProgramAccountsV2', params);
      const out = {
        accounts: Array.isArray(result?.accounts) ? result.accounts : [],
        paginationKey: result?.paginationKey ?? null,
        totalResults: typeof result?.totalResults === 'number' ? result.totalResults : null,
        used: { program_id: String(program_id), limit: Number(limit)||1000, encoding: String(encoding||'base64'), hadFilters: !!filters }
      };
      return { structuredContent: out, content: [{ type:'text', text: `accounts=${out.accounts.length}${out.paginationKey? ' more': ''}` }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'scan_failed' }], isError:true };
    }
  });

  server.registerTool('program_accounts_tail', {
    title: 'Program Accounts Tail (changedSinceSlot)',
    description: 'Fetch only accounts modified since a given slot using Helius getProgramAccountsV2 changedSinceSlot.',
    inputSchema: {
      program_id: z.string().min(32).describe('Program ID (Pubkey)'),
      changed_since_slot: z.number().int().min(0).describe('Only accounts changed since this slot'),
      limit: z.number().int().min(1).max(10000).optional().describe('Accounts per page (1-10000; default 1000)'),
      pagination_key: z.string().optional().describe('Cursor from previous page (paginationKey)'),
      encoding: z.enum(['base64','jsonParsed']).optional().describe('Account data encoding (default base64)'),
      filters: z.any().optional().describe('Optional getProgramAccounts filters'),
    },
    outputSchema: {
      accounts: z.array(z.any()),
      paginationKey: z.string().nullable().optional(),
      totalResults: z.number().int().optional(),
      used: z.object({ program_id: z.string(), changed_since_slot: z.number().int(), limit: z.number().int(), encoding: z.string(), hadFilters: z.boolean() })
    }
  }, async ({ program_id, changed_since_slot, limit, pagination_key, encoding, filters }) => {
    try {
      const params = [ String(program_id), {
        limit: Number(limit)||1000,
        encoding: encoding || 'base64',
        changedSinceSlot: Number(changed_since_slot),
        ...(filters ? { filters } : {}),
        ...(pagination_key ? { paginationKey: pagination_key } : {})
      } ];
      const result = await rpcCall('getProgramAccountsV2', params);
      const out = {
        accounts: Array.isArray(result?.accounts) ? result.accounts : [],
        paginationKey: result?.paginationKey ?? null,
        totalResults: typeof result?.totalResults === 'number' ? result.totalResults : null,
        used: { program_id: String(program_id), changed_since_slot: Number(changed_since_slot), limit: Number(limit)||1000, encoding: String(encoding||'base64'), hadFilters: !!filters }
      };
      return { structuredContent: out, content: [{ type:'text', text: `accounts=${out.accounts.length}${out.paginationKey? ' more': ''}` }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'tail_failed' }], isError:true };
    }
  });

  // Tools: runs
  if (ENABLE_RUN_TOOLS) server.registerTool('run_agent', {
    title: 'Run Agent',
    description: 'Spawn the analyzer (index.js) for a token mint',
    inputSchema: {
      mint: z.string().min(32).describe('Token mint address'),
      flags: z.array(z.string()).optional().describe('Extra CLI flags, e.g. ["--web-search","--ohlcv"]'),
      reasoning_level: z.enum(['low','medium','high']).optional().describe('Override global reasoning effort')
    },
    outputSchema: {
      pid: z.number().int(),
      startedAt: z.number().int(),
    }
  }, async ({ mint, flags, reasoning_level }) => {
    for (const [pid, v] of activeRuns.entries()) {
      try { if ((v?.mint || '') === mint) {
        return { structuredContent: { pid, startedAt: v.startedAt }, content: [{ type:'text', text: `already_running pid=${pid}` }], isError: false };
      } } catch {}
    }
    if (activeRuns.size >= RUN_LIMIT) {
      return { content: [{ type:'text', text: `concurrency_limit (${RUN_LIMIT})` }], isError: true };
    }
    const args = [String(mint), ...(Array.isArray(flags)? flags: [])];
    if (reasoning_level) args.push(`--reasoning-level=${reasoning_level}`);
    const pid = spawnAnalyzer('agent', args);
    const rec = activeRuns.get(pid);
    try { await sendResearchWebhook('analysis:run_started', { mint, pid, startedAt: rec?.startedAt || Date.now() }); } catch {}
    return { structuredContent: { pid, startedAt: rec?.startedAt || Date.now() }, content: [{ type:'text', text: `started pid=${pid}` }] };
  });

  if (ENABLE_RUN_TOOLS) server.registerTool('run_socials', {
    title: 'Run Socials Orchestrator',
    description: 'Run socials/orchestrator.js for a token mint',
    inputSchema: {
      mint: z.string().min(32).describe('Token mint address'),
      steps: z.string().optional().describe('Comma list: market,website,telegram,x'),
      x_concurrency: z.number().int().optional().describe('X provider concurrency (1-2 advised)')
    },
    outputSchema: {
      pid: z.number().int(),
      startedAt: z.number().int(),
    }
  }, async ({ mint, steps, x_concurrency }) => {
    if (activeRuns.size >= RUN_LIMIT) {
      return { content: [{ type:'text', text: `concurrency_limit (${RUN_LIMIT})` }], isError: true };
    }
    const args = [String(mint)];
    if (steps) args.push(`--steps=${steps}`);
    if (x_concurrency) args.push(`--x-concurrency=${x_concurrency}`);
    const pid = spawnAnalyzer('socials', args);
    const rec = activeRuns.get(pid);
    return { structuredContent: { pid, startedAt: rec?.startedAt || Date.now() }, content: [{ type:'text', text: `started pid=${pid}` }] };
  });

  // Granular socials: run a single step for faster iterations
  if (ENABLE_RUN_TOOLS) server.registerTool('run_socials_step', {
    title: 'Run Socials (Step)',
    description: 'Run a single socials step: market, website, telegram, or twitter (x).',
    inputSchema: { mint: z.string().min(32), step: z.enum(['market','website','telegram','x','twitter']), x_concurrency: z.number().int().optional() },
    outputSchema: { pid: z.number().int(), startedAt: z.number().int(), step: z.string() }
  }, async ({ mint, step, x_concurrency }) => {
    if (activeRuns.size >= RUN_LIMIT) return { content:[{ type:'text', text:`concurrency_limit (${RUN_LIMIT})` }], isError:true };
    const s = step === 'twitter' ? 'x' : step;
    const args = [String(mint), `--steps=${s}`];
    if (x_concurrency) args.push(`--x-concurrency=${x_concurrency}`);
    const pid = spawnAnalyzer('socials', args);
    const rec = activeRuns.get(pid);
    try { await sendResearchWebhook('analysis:run_started', { kind:'socials', step:s, mint, pid, startedAt: rec?.startedAt || Date.now() }); } catch {}
    return { structuredContent:{ pid, startedAt: rec?.startedAt || Date.now(), step: s }, content:[{ type:'text', text:`started pid=${pid} step=${s}` }] };
  });

  // Convenience wrappers
  for (const NAME of ['market','website','telegram','x']) {
    if (!ENABLE_RUN_TOOLS) break;
    server.registerTool(`run_socials_${NAME}`, {
      title: `Run Socials (${NAME})`,
      description: `Run socials orchestrator ${NAME} step only`,
      inputSchema: { mint: z.string().min(32), x_concurrency: z.number().int().optional() },
      outputSchema: { pid: z.number().int(), startedAt: z.number().int(), step: z.string() }
    }, async ({ mint, x_concurrency }) => {
      if (activeRuns.size >= RUN_LIMIT) return { content:[{ type:'text', text:`concurrency_limit (${RUN_LIMIT})` }], isError:true };
      const args = [String(mint), `--steps=${NAME}`];
      if (x_concurrency) args.push(`--x-concurrency=${x_concurrency}`);
      const pid = spawnAnalyzer('socials', args);
      const rec = activeRuns.get(pid);
      try { await sendResearchWebhook('analysis:run_started', { kind:'socials', step: NAME, mint, pid, startedAt: rec?.startedAt || Date.now() }); } catch {}
      return { structuredContent:{ pid, startedAt: rec?.startedAt || Date.now(), step: NAME }, content:[{ type:'text', text:`started pid=${pid} step=${NAME}` }] };
    });
  }

  // Quick run: minimal analysis (web-search + ohlcv fast path), skips heavy socials
  if (ENABLE_RUN_TOOLS) server.registerTool('run_agent_quick', {
    title: 'Run Agent (Quick)',
    description: 'Spawn the analyzer (index.js) with quick flags (web-search, ohlcv) to speed up Deep Research iterations',
    inputSchema: {
      mint: z.string().min(32).describe('Token mint address'),
      extra_flags: z.array(z.string()).optional().describe('Additional CLI flags to append'),
      reasoning_level: z.enum(['low','medium','high']).optional().describe('Override global reasoning effort')
    },
    outputSchema: { pid: z.number().int(), startedAt: z.number().int() }
  }, async ({ mint, extra_flags, reasoning_level }) => {
    if (activeRuns.size >= RUN_LIMIT) {
      return { content: [{ type:'text', text: `concurrency_limit (${RUN_LIMIT})` }], isError: true };
    }
    const quick = ["--web-search","--ohlcv","--fast-ohlcv=birdeye"];
    const args = [String(mint), ...quick, ...(Array.isArray(extra_flags)? extra_flags: [])];
    if (reasoning_level) args.push(`--reasoning-level=${reasoning_level}`);
    const pid = spawnAnalyzer('agent', args);
    const rec = activeRuns.get(pid);
    try { await sendResearchWebhook('analysis:run_started', { mint, pid, startedAt: rec?.startedAt || Date.now(), quick: true }); } catch {}
    return { structuredContent: { pid, startedAt: rec?.startedAt || Date.now() }, content: [{ type:'text', text: `started pid=${pid}` }] };
  });

  if (ENABLE_RUN_TOOLS) server.registerTool('list_runs', {
    title: 'List Runs',
    description: 'List active analyzer processes',
    outputSchema: {
      active: z.array(z.object({
        pid: z.number().int(),
        mint: z.string().nullable(),
        kind: z.string(),
        startedAt: z.number().int(),
      }))
    }
  }, async () => {
    const active = Array.from(activeRuns.entries()).map(([pid, v]) => ({ pid, mint: v.mint || null, kind: v.kind, startedAt: v.startedAt }));
    return { structuredContent: { active }, content: [{ type:'text', text: JSON.stringify(active) }] };
  });

  if (ENABLE_RUN_TOOLS) server.registerTool('get_run_logs', {
    title: 'Get Run Logs',
    description: 'Fetch recent logs for a running process',
    inputSchema: {
      pid: z.number().int(),
      limit: z.number().int().optional(),
    },
    outputSchema: {
      pid: z.number().int(),
      mint: z.string().nullable(),
      logs: z.array(z.object({ stream: z.string(), line: z.string(), at: z.number().int() })),
    }
  }, async ({ pid, limit }) => {
    const rec = activeRuns.get(Number(pid));
    if (!rec) return { content: [{ type:'text', text: 'not_found' }], isError: true };
    const lim = Math.max(1, Math.min(LOGS_PER_RUN_LIMIT, Number(limit)||LOGS_PER_RUN_LIMIT));
    const logs = rec.logs.slice(-lim);
    return { structuredContent: { pid: Number(pid), mint: rec.mint || null, logs }, content: [{ type:'text', text: logs.map(l=>`[${l.stream}] ${l.line}`).join('\n') }] };
  });

  if (ENABLE_RUN_TOOLS) server.registerTool('kill_run', {
    title: 'Kill Run',
    description: 'Terminate a running analyzer process by PID',
    inputSchema: { pid: z.number().int() },
    outputSchema: { ok: z.boolean() }
  }, async ({ pid }) => {
    const child = childProcs.get(Number(pid));
    if (!child) return { content: [{ type:'text', text: 'not_found' }], isError: true };
    try {
      child.kill('SIGTERM');
      setTimeout(() => { try { if (childProcs.has(Number(pid))) child.kill('SIGKILL'); } catch {} }, 1500);
      return { structuredContent: { ok: true }, content: [{ type:'text', text: 'ok' }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'kill_failed' }], isError: true };
    }
  });

  // Tools: reports
  server.registerTool('list_recent_analyses', {
    title: 'List Recent Analyses',
    description: 'Summarize recent analysis JSON files',
    inputSchema: { limit: z.number().int().optional(), mintedOnly: z.boolean().optional() },
    outputSchema: {
      items: z.array(z.object({
        mint: z.string().nullable(),
        branchScore: z.number().nullable(),
        riskScore: z.number().nullable(),
        duration_ms: z.number().nullable(),
        file: z.string(),
        uri: z.string().optional(),
        mtime: z.number(),
        symbol: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
        created_at: z.any().optional(),
        fdv: z.number().nullable().optional(),
        liquidity: z.number().nullable().optional(),
        volume24h: z.number().nullable().optional(),
        price: z.number().nullable().optional(),
      }))
    }
  }, async ({ limit, mintedOnly }) => {
    let items = listRecentAnalyses(Number(limit)||12);
    if (mintedOnly) items = items.filter(it => isValidMint(it.mint));
    return { structuredContent: { items }, content: [{ type:'text', text: JSON.stringify(items) }] };
  });

  // Tools: resource URIs (simple browse helper)
  server.registerTool('list_resource_uris', {
    title: 'List Resource URIs',
    description: 'Return report resource URIs (report://) for recent analyses',
    inputSchema: { limit: z.number().int().optional() },
    outputSchema: { uris: z.array(z.string()) }
  }, async ({ limit }) => {
    const items = listRecentAnalyses(Number(limit)||24);
    const uris = items.map(it => `report://ai-token-analyses/${it.file}`);
    return { structuredContent: { uris }, content: [{ type:'text', text: uris.join('\n') }] };
  });

  server.registerTool('get_latest_analysis', {
    title: 'Get Latest Analysis',
    description: 'Return the most recent analysis JSON',
    outputSchema: {
      file: z.string().nullable(),
      mtime: z.number().nullable(),
      data: z.any(),
      mint: z.string().nullable().optional(),
      symbol: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      price: z.number().nullable().optional(),
      fdv: z.number().nullable().optional(),
      liquidity: z.number().nullable().optional(),
      volume24h: z.number().nullable().optional(),
      branchScore: z.number().nullable().optional(),
      riskScore: z.number().nullable().optional(),
      duration_ms: z.number().nullable().optional(),
      created_at: z.any().optional(),
      uri: z.string().optional(),
      size_bytes: z.number().nullable().optional(),
      top_pool: z.any().optional(),
    }
  }, async () => {
    const out = latestAnalysis();
    let symbol = null; let name = null; let mint = null; let price = null; let fdv = null; let liquidity = null; let volume24h = null; let created_at = null; let size_bytes = null; let uri = null; let top_pool = null; let branchScore = null; let riskScore = null; let duration_ms = null;
    try {
      const d = out?.data || {};
      const meta = extractMeta(d) || {};
      symbol = meta?.symbol || null;
      name = meta?.name || null;
      price = (meta?.price != null ? meta.price : (d?.metadata?.market?.price ?? null));
      fdv = (meta?.fdv != null ? meta.fdv : (d?.metadata?.market?.fdv ?? null));
      liquidity = (meta?.liquidity != null ? meta.liquidity : (d?.metadata?.market?.liquidity ?? null));
      volume24h = (meta?.volume24h != null ? meta.volume24h : (d?.metadata?.market?.volume24h ?? d?.metadata?.market?.vol24h ?? null));
      created_at = meta?.created_at || d?.metadata?.timestamp || null;
      mint = extractMintFromReport(d, out?.file || '') || null;
      branchScore = (typeof d?.branchScore === 'number') ? d.branchScore : null;
      riskScore = (typeof d?.riskScore === 'number') ? d.riskScore : null;
      duration_ms = d?.metadata?.timings?.total_ms || null;
      top_pool = d?.metadata?.market?.top_pool ? {
        dex: d.metadata.market.top_pool.dex || null,
        pairAddress: d.metadata.market.top_pool.pairAddress || null,
        base: {
          symbol: d.metadata.market.top_pool.baseToken?.symbol || null,
          name: d.metadata.market.top_pool.baseToken?.name || null,
        },
        quote: {
          symbol: d.metadata.market.top_pool.quoteToken?.symbol || null,
          name: d.metadata.market.top_pool.quoteToken?.name || null,
        }
      } : null;
    } catch (e) {
      const diag = {
        error: e?.message || 'prisma_query_failed',
        hasDbUrl: !!process.env.DATABASE_URL,
        hasRpcUrl: !!process.env.RPC_URL,
        hasSolanaRpcEndpoint: !!process.env.SOLANA_RPC_ENDPOINT,
        stack: e?.stack ? String(e.stack).split('\n').slice(0,4).join(' | ') : null
      };
      // Continue to fallback
    }
    try { if (out?.file) { const st = fs.statSync(path.join(REPORTS_DIR, out.file)); size_bytes = st.size || null; } } catch {}
    try { if (out?.file) uri = reportUriFor(out.file); } catch {}
    const dataText = out.data ? JSON.stringify(out.data, null, 2) : (out.file ? `file=${out.file}` : 'none');
    return { structuredContent: { ...out, mint, symbol, name, price, fdv, liquidity, volume24h, branchScore, riskScore, duration_ms, created_at, uri, size_bytes, top_pool }, content: [{ type:'text', text: dataText }] };
  });

  // Tool: get report head (metadata only)
  server.registerTool('get_report_head', {
    title: 'Get Report Head',
    description: 'Return lightweight metadata for a report (by filename, mint, or uri)',
    inputSchema: {
      filename: z.string().optional(),
      mint: z.string().optional(),
      uri: z.string().optional(),
    },
    outputSchema: {
      file: z.string().nullable(),
      uri: z.string().nullable(),
      mint: z.string().nullable(),
      mtime: z.number().nullable(),
      symbol: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      size_bytes: z.number().nullable().optional(),
      fdv: z.number().nullable().optional(),
      liquidity: z.number().nullable().optional(),
      volume24h: z.number().nullable().optional(),
    }
  }, async ({ filename, mint, uri }) => {
    let file = null;
    if (uri) {
      const byFile = String(uri).match(/^report:\/\/ai-token-analyses\/(.+)$/);
      const byMint = String(uri).match(/^report:\/\/ai-token-analyses\/by-mint\/(.+)$/);
      if (byFile) file = byFile[1];
      else if (byMint) {
        const out = findReportByMint(byMint[1]);
        file = out.file || null;
      }
    }
    if (!file && filename) file = filename;
    if (!file && mint) file = findReportByMint(mint).file || null;
    if (!file) return { structuredContent: { file: null, uri: null, mint: mint||null, mtime: null }, content: [{ type:'text', text:'not_found' }], isError: true };
    if (!/^[A-Za-z0-9._-]+\.json$/.test(file)) return { content:[{ type:'text', text:'bad_filename' }], isError:true };
    const abs = path.join(REPORTS_DIR, file);
    try { fs.accessSync(abs, fs.constants.R_OK); } catch { return { content:[{ type:'text', text:'not_found' }], isError:true }; }
    let size = null; let mtime = null; try { const st = fs.statSync(abs); size = st.size; mtime = st.mtimeMs || null; } catch {}
    let mintOut = null; let symbol = null; let name = null; let fdv = null; let liquidity = null; let volume24h = null;
    try { const j = JSON.parse(fs.readFileSync(abs,'utf8')); const meta = extractMeta(j); mintOut = extractMintFromReport(j, file); symbol = meta.symbol; name = meta.name; fdv = meta.fdv; liquidity = meta.liquidity; volume24h = meta.volume24h; } catch {}
    return { structuredContent: { file, uri: reportUriFor(file), mint: mintOut, mtime, symbol, name, size_bytes: size, fdv, liquidity, volume24h }, content: [{ type:'text', text: file }] };
  });

  // Tool: read a report via resource URI
  server.registerTool('read_report_uri', {
    title: 'Read Report by URI',
    description: 'Read a report using its report:// URI',
    inputSchema: { uri: z.string() },
    outputSchema: { file: z.string().nullable(), mtime: z.number().nullable(), data: z.any() }
  }, async ({ uri }) => {
    const m = String(uri||'');
    // Handle by-mint URIs
    const byMint = m.match(/^report:\/\/ai-token-analyses\/by-mint\/(.+)$/);
    if (byMint) {
      const mint = byMint[1];
      const out = findReportByMint(mint);
      if (!out.file) return { content: [{ type:'text', text:'not_found' }], isError:true };
      return { structuredContent: out, content: [{ type:'text', text: out.file }] };
    }
    // Handle by-filename URIs
    const byFile = m.match(/^report:\/\/ai-token-analyses\/(.+)$/);
    if (!byFile) return { content: [{ type:'text', text:'bad_uri' }], isError:true };
    const raw = byFile[1];
    if (!/^[A-Za-z0-9._-]+\.json$/.test(raw)) return { content: [{ type:'text', text:'bad_name' }], isError:true };
    const file = path.join(REPORTS_DIR, raw);
    try { fs.accessSync(file, fs.constants.R_OK); } catch { return { content: [{ type:'text', text:'not_found' }], isError:true };
    }
    let data = null; try { data = JSON.parse(fs.readFileSync(file,'utf8')); } catch {}
    const mtime = (()=>{ try { return fs.statSync(file).mtimeMs || null; } catch { return null; } })();
    return { structuredContent: { file: raw, mtime, data }, content: [{ type:'text', text: JSON.stringify(data, null, 2) }] };
  });

  // Tool: paginated listing of report URIs
  server.registerTool('list_reports_page', {
    title: 'List Reports (Paged)',
    description: 'Paginated report URIs (opaque cursor)',
    inputSchema: { limit: z.number().int().optional(), cursor: z.string().optional(), mintedOnly: z.boolean().optional() },
    outputSchema: { uris: z.array(z.string()), nextCursor: z.string().optional() }
  }, async ({ limit, cursor, mintedOnly }) => {
    const lim = Math.max(1, Math.min(100, Number(limit)||24));
    let files = [];
    try {
      files = (fs.readdirSync(REPORTS_DIR) || [])
        .filter(f => f.endsWith('.json'))
        .map(f => ({ name:f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR,f)).mtimeMs || 0; } catch { return 0; } })() }))
        .sort((a,b)=> b.mtime - a.mtime);
    } catch {}

    if (mintedOnly) {
      const filtered = [];
      for (const it of files) {
        try {
          const j = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR,it.name),'utf8'));
          const mint = extractMintFromReport(j, it.name);
          if (isValidMint(mint)) filtered.push(it);
        } catch {}
        if (filtered.length >= lim * 3) {
          // avoid scanning too many; sufficient headroom for pagination
        }
      }
      files = filtered;
    }
    let offset = 0;
    if (cursor) {
      try {
        if (cursor.startsWith('offset:')) offset = parseInt(cursor.split(':')[1]||'0', 10) || 0;
        else {
          const j = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
          offset = Number(j?.offset || 0);
        }
      } catch {}
    }
    const slice = files.slice(offset, offset+lim);
    const uris = slice.map(it => `report://ai-token-analyses/${it.name}`);
    const nextOffset = offset + slice.length;
    const hasMore = nextOffset < files.length;
    const nextCursor = hasMore ? Buffer.from(JSON.stringify({ offset: nextOffset }), 'utf8').toString('base64url') : undefined;
    return { structuredContent: { uris, ...(nextCursor? { nextCursor } : {}) }, content: [{ type:'text', text: uris.join('\n') }] };
  });

  // Tools: Realtime Voice Debug
  server.registerTool('voice_debug_get', {
    title: 'Voice Debug: Get Logs',
    description: 'Fetch latest Realtime Voice debug lines from the Live UI server',
    inputSchema: { limit: z.number().int().optional(), session: z.string().optional() },
    outputSchema: { ok: z.boolean(), size: z.number().int().optional(), items: z.any().optional(), error: z.string().optional() }
  }, async ({ limit, session }) => {
    const UI_PORT = Number(process.env.TOKEN_AI_UI_PORT || 3013);
    const lim = Math.max(1, Math.min(1000, Number(limit)||100));
    const path = `/realtime/debug-log?limit=${lim}` + (session ? `&session=${encodeURIComponent(session)}` : '');
    const payload = await new Promise((resolve) => {
      const req = http.request({ hostname:'127.0.0.1', port: UI_PORT, path, method:'GET' }, (r) => {
        let data=''; r.on('data', c=> data+=c.toString()); r.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch { resolve({ ok:false, error:'bad_json', raw:data }); } });
      });
      req.on('error', (e)=> resolve({ ok:false, error: String(e?.message||e) }));
      req.end();
    });
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });

  server.registerTool('voice_debug_clear', {
    title: 'Voice Debug: Clear Logs',
    description: 'Clear Realtime Voice debug buffer on Live UI server',
    inputSchema: { session: z.string().optional() },
    outputSchema: { ok: z.boolean(), size: z.number().int().optional(), error: z.string().optional() }
  }, async ({ session }) => {
    const UI_PORT = Number(process.env.TOKEN_AI_UI_PORT || 3013);
    const path = `/realtime/debug-log` + (session ? `?session=${encodeURIComponent(session)}` : '');
    const payload = await new Promise((resolve) => {
      const req = http.request({ hostname:'127.0.0.1', port: UI_PORT, path, method:'DELETE' }, (r) => {
        let data=''; r.on('data', c=> data+=c.toString()); r.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch { resolve({ ok:false, error:'bad_json', raw:data }); } });
      });
      req.on('error', (e)=> resolve({ ok:false, error: String(e?.message||e) }));
      req.end();
    });
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });

  server.registerTool('voice_debug_save', {
    title: 'Voice Debug: Save Logs',
    description: 'Persist Realtime Voice debug logs to server (JSON file)',
    inputSchema: { session: z.string().optional(), note: z.string().optional() },
    outputSchema: { ok: z.boolean(), file: z.string().optional(), saved: z.number().int().optional(), error: z.string().optional() }
  }, async ({ session, note }) => {
    const UI_PORT = Number(process.env.TOKEN_AI_UI_PORT || 3013);
    const payload = await new Promise((resolve) => {
      const body = JSON.stringify({ session: session || undefined, note: note || undefined });
      const req = http.request({ hostname:'127.0.0.1', port: UI_PORT, path:'/realtime/debug-save', method:'POST', headers:{ 'content-type':'application/json' } }, (r) => {
        let data=''; r.on('data', c=> data+=c.toString()); r.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch { resolve({ ok:false, error:'bad_json', raw:data }); } });
      });
      req.on('error', (e)=> resolve({ ok:false, error: String(e?.message||e) }));
      req.write(body); req.end();
    });
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });

  server.registerTool('voice_health', {
    title: 'Voice Debug: Health Summary',
    description: 'Return Realtime Voice health summary from Live UI server',
    inputSchema: { session: z.string().optional() },
    outputSchema: { ok: z.boolean(), total: z.number().int().optional(), sessions: z.any().optional(), error: z.string().optional() }
  }, async ({ session }) => {
    const UI_PORT = Number(process.env.TOKEN_AI_UI_PORT || 3013);
    const path = '/realtime/health' + (session ? `?session=${encodeURIComponent(session)}` : '');
    const payload = await new Promise((resolve) => {
      const req = http.request({ hostname:'127.0.0.1', port: UI_PORT, path, method:'GET' }, (r) => {
        let data=''; r.on('data', c=> data+=c.toString()); r.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch { resolve({ ok:false, error:'bad_json', raw:data }); } });
      });
      req.on('error', (e)=> resolve({ ok:false, error: String(e?.message||e) }));
      req.end();
    });
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });

  // Tool: list all reports for a mint (paged)
  server.registerTool('list_reports_for_mint', {
    title: 'List Reports For Mint',
    description: 'List report files for a given mint (most recent first)',
    inputSchema: { mint: z.string(), limit: z.number().int().optional(), cursor: z.string().optional() },
    outputSchema: { files: z.array(z.string()), uris: z.array(z.string()), nextCursor: z.string().optional() }
  }, async ({ mint, limit, cursor }) => {
    const lim = Math.max(1, Math.min(100, Number(limit)||24));
    let files = [];
    try {
      const all = (fs.readdirSync(REPORTS_DIR) || [])
        .filter(f => f.endsWith('.json'))
        .map(f => ({ name:f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR,f)).mtimeMs || 0; } catch { return 0; } })() }))
        .sort((a,b)=> b.mtime - a.mtime);
      const target = String(mint).toLowerCase();
      for (const it of all) {
        try {
          const j = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR,it.name),'utf8'));
          const jm = String(extractMintFromReport(j, it.name) || '').toLowerCase();
          if (jm && (jm === target || jm.includes(target))) files.push(it);
        } catch {}
      }
    } catch {}
    let offset = 0;
    if (cursor) {
      try { offset = cursor.startsWith('offset:') ? parseInt(cursor.split(':')[1]||'0',10)||0 : JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'))?.offset||0; } catch {}
    }
    const slice = files.slice(offset, offset+lim);
    const names = slice.map(it=>it.name);
    const uris = names.map(reportUriFor);
    const nextOffset = offset + slice.length;
    const hasMore = nextOffset < files.length;
    const nextCursor = hasMore ? Buffer.from(JSON.stringify({ offset: nextOffset }), 'utf8').toString('base64url') : undefined;
    return { structuredContent: { files: names, uris, ...(nextCursor? { nextCursor } : {}) }, content: [{ type:'text', text: names.join('\n') }] };
  });

  // Tool: resolve a report identifier (file|uri|mint|id)
  server.registerTool('resolve_report_id', {
    title: 'Resolve Report ID',
    description: 'Resolve any of {filename|uri|mint|id} to {file, uri, mint}',
    inputSchema: { id: z.string() },
    outputSchema: { file: z.string().nullable(), uri: z.string().nullable(), mint: z.string().nullable() }
  }, async ({ id }) => {
    let file = null; let mint = null;
    const s = String(id||'');
    if (s.startsWith('report://')) {
      const m = s.match(/^report:\/\/ai-token-analyses\/(.+)$/);
      const byMint = s.match(/^report:\/\/ai-token-analyses\/by-mint\/(.+)$/);
      if (m) file = m[1]; else if (byMint) { const out = findReportByMint(byMint[1]); file = out.file; }
    } else if (/^[A-Za-z0-9._-]+\.json$/.test(s)) {
      file = s;
    } else if (/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(s)) {
      mint = s;
      const out = findReportByMint(s);
      file = out.file;
    } else {
      // Treat as basename id without .json
      const candidate = `${s}.json`;
      try { fs.accessSync(path.join(REPORTS_DIR,candidate), fs.constants.R_OK); file = candidate; } catch {}
    }
    if (!file && mint) { const out = findReportByMint(mint); file = out.file; }
    let mintOut = null;
    if (file) {
      try { const j = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR,file),'utf8')); mintOut = extractMintFromReport(j, file); } catch {}
    }
    return { structuredContent: { file: file||null, uri: file? reportUriFor(file): null, mint: mintOut || mint || null }, content: [{ type:'text', text: file||'not_found' }] };
  });

  // Tool: basic search across recent reports
  server.registerTool('search_reports', {
    title: 'Search Reports',
    description: 'Substring search over recent report JSON files',
    inputSchema: { query: z.string(), limit: z.number().int().optional() },
    outputSchema: { results: z.array(z.object({ file: z.string(), uri: z.string(), match_index: z.number().nullable() })) }
  }, async ({ query, limit }) => {
    const lim = Math.max(1, Math.min(50, Number(limit)||10));
    const files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f=>f.endsWith('.json'))
      .map(f=>({ name:f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR,f)).mtimeMs || 0; } catch { return 0; } })() }))
      .sort((a,b)=> b.mtime - a.mtime)
      .slice(0, 200);
    const q = String(query||'').toLowerCase();
    const results = [];
    for (const it of files) {
      try {
        const txt = fs.readFileSync(path.join(REPORTS_DIR,it.name),'utf8');
        const idx = txt.toLowerCase().indexOf(q);
        if (idx >= 0) { results.push({ file: it.name, uri: reportUriFor(it.name), match_index: idx }); }
        if (results.length >= lim) break;
      } catch {}
    }
    return { structuredContent: { results }, content: [{ type:'text', text: results.map(r=>r.file).join('\n') }] };
  });

  // ChatGPT-compatible: search tool (returns content[0].text as JSON-encoded { results: [{id,title,url}] })
  server.registerTool('search', {
    title: 'Search',
    description: 'Return a list of relevant reports matching the query (ChatGPT-compatible schema).',
    inputSchema: { query: z.string() },
    outputSchema: { results: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })) }
  }, async ({ query }) => {
    const q = String(query||'').toLowerCase();
    const files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f=>f.endsWith('.json'))
      .map(f=>({ name:f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR,f)).mtimeMs || 0; } catch { return 0; } })() }))
      .sort((a,b)=> b.mtime - a.mtime)
      .slice(0, 200);
    const results = [];
    for (const it of files) {
      try {
        const full = fs.readFileSync(path.join(REPORTS_DIR,it.name),'utf8');
        const j = JSON.parse(full);
        const meta = extractMeta(j);
        const hay = `${it.name}\n${JSON.stringify(j)}`.toLowerCase();
        if (q && hay.indexOf(q) < 0) continue;
        const title = meta.symbol || meta.name || it.name.replace(/\.json$/, '');
        const url = `https://clanka.win/report/${encodeURIComponent(it.name)}`;
        results.push({ id: it.name, title, url });
        if (results.length >= 10) break;
      } catch {}
    }
    const payload = { results };
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });

  // ChatGPT-compatible: fetch tool (returns content[0].text as JSON-encoded { id,title,text,url,metadata })
  server.registerTool('fetch', {
    title: 'Fetch',
    description: 'Fetch the full contents of a search result by id (report filename). Returns ChatGPT-compatible schema.',
    inputSchema: { id: z.string() },
    outputSchema: { id: z.string(), title: z.string(), text: z.string(), url: z.string(), metadata: z.any().optional() }
  }, async ({ id }) => {
    const safe = String(id||'');
    if (!/^[A-Za-z0-9._-]+\.json$/.test(safe)) {
      return { content:[{ type:'text', text: JSON.stringify({ error:'bad_id' }) }], isError:true };
    }
    const file = path.join(REPORTS_DIR, safe);
    try { fs.accessSync(file, fs.constants.R_OK); } catch { return { content:[{ type:'text', text: JSON.stringify({ error:'not_found' }) }], isError:true }; }
    let data = null; try { data = JSON.parse(fs.readFileSync(file,'utf8')); } catch { data = null; }
    const meta = extractMeta(data||{});
    const title = meta.symbol || meta.name || safe.replace(/\.json$/, '');
    const url = `https://clanka.win/report/${encodeURIComponent(safe)}`;
    const doc = { id: safe, title, text: JSON.stringify(data ?? {}), url, metadata: { symbol: meta.symbol, name: meta.name, created_at: meta.created_at } };
    return { structuredContent: doc, content: [{ type:'text', text: JSON.stringify(doc) }] };
  });

  server.registerTool('get_report', {
    title: 'Get Report',
    description: 'Fetch a specific analysis by filename or mint',
    inputSchema: {
      filename: z.string().optional(),
      mint: z.string().optional(),
    },
    outputSchema: {
      file: z.string().nullable(),
      mtime: z.number().nullable(),
      data: z.any(),
    }
  }, async ({ filename, mint }) => {
    if (!filename && !mint) {
      return { content: [{ type:'text', text: 'provide filename or mint' }], isError: true };
    }
    if (filename) {
      const safe = String(filename);
      if (!/^[A-Za-z0-9._-]+\.json$/.test(safe)) {
        return { content: [{ type:'text', text: 'bad filename' }], isError: true };
      }
      const file = path.join(REPORTS_DIR, safe);
      try { fs.accessSync(file, fs.constants.R_OK); } catch { return { content: [{ type:'text', text: 'not_found' }], isError: true }; }
      let data = null; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
      const mtime = (()=>{ try { return fs.statSync(file).mtimeMs || null; } catch { return null; } })();
      // Build header fields
      let header = {};
      try {
        const meta = extractMeta(data)||{};
        header = {
          mint: extractMintFromReport(data, safe) || null,
          symbol: meta.symbol || null,
          name: meta.name || null,
          price: (meta.price != null ? meta.price : (data?.metadata?.market?.price ?? null)),
          fdv: (meta.fdv != null ? meta.fdv : (data?.metadata?.market?.fdv ?? null)),
          liquidity: (meta.liquidity != null ? meta.liquidity : (data?.metadata?.market?.liquidity ?? null)),
          volume24h: (meta.volume24h != null ? meta.volume24h : (data?.metadata?.market?.volume24h ?? data?.metadata?.market?.vol24h ?? null)),
          branchScore: (typeof data?.branchScore === 'number') ? data.branchScore : null,
          riskScore: (typeof data?.riskScore === 'number') ? data.riskScore : null,
          duration_ms: data?.metadata?.timings?.total_ms || null,
          created_at: meta?.created_at || data?.metadata?.timestamp || null,
          uri: reportUriFor(safe),
          size_bytes: (()=>{ try { return fs.statSync(file).size || null; } catch { return null; } })(),
          top_pool: data?.metadata?.market?.top_pool ? {
            dex: data.metadata.market.top_pool.dex || null,
            pairAddress: data.metadata.market.top_pool.pairAddress || null,
            base: { symbol: data.metadata.market.top_pool.baseToken?.symbol || null, name: data.metadata.market.top_pool.baseToken?.name || null },
            quote: { symbol: data.metadata.market.top_pool.quoteToken?.symbol || null, name: data.metadata.market.top_pool.quoteToken?.name || null },
          } : null,
        };
      } catch {}
      return { structuredContent: { file: safe, mtime, data, ...header }, content: [{ type:'text', text: JSON.stringify(data, null, 2) }] };
    }
    const out = findReportByMint(mint);
    if (!out.file) return { content: [{ type:'text', text: 'not_found' }], isError: true };
    // Build header for mint branch
    let header2 = {};
    try {
      const meta = extractMeta(out?.data||{})||{};
      header2 = {
        mint: extractMintFromReport(out?.data||{}, out.file) || null,
        symbol: meta.symbol || null,
        name: meta.name || null,
        price: (meta.price != null ? meta.price : (out?.data?.metadata?.market?.price ?? null)),
        fdv: (meta.fdv != null ? meta.fdv : (out?.data?.metadata?.market?.fdv ?? null)),
        liquidity: (meta.liquidity != null ? meta.liquidity : (out?.data?.metadata?.market?.liquidity ?? null)),
        volume24h: (meta.volume24h != null ? meta.volume24h : (out?.data?.metadata?.market?.volume24h ?? out?.data?.metadata?.market?.vol24h ?? null)),
        branchScore: (typeof out?.data?.branchScore === 'number') ? out.data.branchScore : null,
        riskScore: (typeof out?.data?.riskScore === 'number') ? out.data.riskScore : null,
        duration_ms: out?.data?.metadata?.timings?.total_ms || null,
        created_at: meta?.created_at || out?.data?.metadata?.timestamp || null,
        uri: reportUriFor(out.file),
        size_bytes: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, out.file)).size || null; } catch { return null; } })(),
        top_pool: out?.data?.metadata?.market?.top_pool ? {
          dex: out.data.metadata.market.top_pool.dex || null,
          pairAddress: out.data.metadata.market.top_pool.pairAddress || null,
          base: { symbol: out.data.metadata.market.top_pool.baseToken?.symbol || null, name: out.data.metadata.market.top_pool.baseToken?.name || null },
          quote: { symbol: out.data.metadata.market.top_pool.quoteToken?.symbol || null, name: out.data.metadata.market.top_pool.quoteToken?.name || null },
        } : null,
      };
    } catch {}
    return { structuredContent: { ...out, ...header2 }, content: [{ type:'text', text: JSON.stringify(out.data, null, 2) }] };
  });

  // Deep Research: web_search using Tavily API
  server.registerTool('web_search', {
    title: 'Web Search',
    description: 'Search the web using Tavily (or compatible) and return organic results.',
    inputSchema: {
      query: z.string(),
      topN: z.number().int().optional(),
      timeRange: z.string().optional(), // e.g., 'd', 'w', 'm'
    },
    outputSchema: {
      items: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string().nullable(), source: z.string().optional() }))
    }
  }, async ({ query, topN, timeRange }) => {
    try {
      const key = process.env.TAVILY_API_KEY || '';
      if (!key) return { content:[{ type:'text', text:'missing_TAVILY_API_KEY' }], isError:true };
      const fetch = (await import('node-fetch')).default;
      const body = {
        api_key: key,
        query: String(query||'').slice(0, 2000),
        search_depth: 'basic',
        max_results: Math.max(1, Math.min(20, Number(topN)||8)),
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        time_range: timeRange || null,
      };
      const resp = await fetch('https://api.tavily.com/search', {
        method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body)
      });
      if (!resp.ok) return { content:[{ type:'text', text:`search_failed ${resp.status}` }], isError:true };
      const j = await resp.json();
      const items = (j?.results || []).map(r => ({ title: r.title || '', url: r.url || '', snippet: r.content || null, source: 'tavily' }));
      return { structuredContent: { items }, content:[{ type:'text', text: items.map(i=>`- ${i.title}\n  ${i.url}`).join('\n') }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'search_error' }], isError:true };
    }
  });

  // Deep Research: fetch_url with Readability extraction
  server.registerTool('fetch_url', {
    title: 'Fetch URL',
    description: 'Fetch a web page and extract readable text with Readability.',
    inputSchema: { url: z.string().url(), mode: z.enum(['readability','raw']).optional() },
    outputSchema: { url: z.string(), title: z.string().nullable(), text: z.string().nullable(), html: z.string().nullable().optional(), links: z.array(z.string()).optional(), meta: z.any().optional() }
  }, async ({ url, mode }) => {
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(url, { headers: { 'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' } });
      if (!res.ok) return { content:[{ type:'text', text:`fetch_failed ${res.status}` }], isError:true };
      const html = await res.text();
      if (String(mode||'readability') === 'raw') {
        return { structuredContent: { url, title: null, text: null, html, links: [], meta: {} }, content:[{ type:'text', text: 'raw_html' }] };
      }
      const { JSDOM } = await import('jsdom');
      const { Readability } = await import('@mozilla/readability');
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      const links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(a => a.href).slice(0, 200);
      const title = article?.title || dom.window.document.title || null;
      const text = article?.textContent || null;
      return { structuredContent: { url, title, text, html: null, links, meta: { byline: article?.byline || null } }, content:[{ type:'text', text: title || url }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'fetch_error' }], isError:true };
    }
  });

  // Deep Research: fetch URL with headless browser (Playwright) for dynamic sites
  server.registerTool('fetch_url_rendered', {
    title: 'Fetch URL (Rendered)',
    description: 'Use a headless browser to render the page, then extract readable text.',
    inputSchema: { url: z.string().url(), wait_ms: z.number().int().optional(), scroll_steps: z.number().int().optional(), scroll_delay_ms: z.number().int().optional() },
    outputSchema: { url: z.string(), title: z.string().nullable(), text: z.string().nullable(), html: z.string().nullable().optional(), links: z.array(z.string()).optional(), meta: z.any().optional() }
  }, async ({ url, wait_ms, scroll_steps, scroll_delay_ms }) => {
    try {
      let browser;
      try {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({ headless: true });
      } catch (e) {
        const msg = 'playwright_missing: install with `npm i -D playwright` and `npx playwright install`';
        return { content:[{ type:'text', text: msg }], isError:true };
      }
      const page = await browser.newPage({ userAgent: process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
      if (Number(wait_ms)||0) { await page.waitForTimeout(Math.max(0, Number(wait_ms))); }
      const steps = Math.max(0, Math.min(50, Number(scroll_steps)||0));
      const delay = Math.max(0, Math.min(2000, Number(scroll_delay_ms)||200));
      for (let i=0;i<steps;i++) { try { await page.evaluate(() => window.scrollBy(0, window.innerHeight)); } catch {}; if (delay) await page.waitForTimeout(delay); }
      const html = await page.content();
      const title = await page.title().catch(()=>null);
      let text = null; let links = [];
      try {
        const { JSDOM } = await import('jsdom');
        const { Readability } = await import('@mozilla/readability');
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        text = article?.textContent || null;
        links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(a=>a.href).slice(0,200);
      } catch {}
      if (!text) {
        try { text = await page.evaluate(() => document.body?.innerText || '') || null; } catch {}
      }
      try { await page.close(); } catch {}
      try { await browser.close(); } catch {}
      return { structuredContent: { url, title: title || null, text, html: null, links, meta: {} }, content:[{ type:'text', text: text || `Failed to extract text from ${url}` }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'render_fetch_error' }], isError:true };
    }
  });

  // Smart fetch: try static first; if too short, fall back to rendered
  server.registerTool('smart_fetch', {
    title: 'Smart Fetch',
    description: 'Fetch a URL; if static text is too short, retry with headless-rendered fetch.',
    inputSchema: { url: z.string().url(), min_len: z.number().int().optional(), rendered_wait_ms: z.number().int().optional(), rendered_scroll_steps: z.number().int().optional(), rendered_scroll_delay_ms: z.number().int().optional() },
    outputSchema: { url: z.string(), title: z.string().nullable(), text: z.string().nullable(), fallback_used: z.boolean().optional() }
  }, async ({ url, min_len, rendered_wait_ms, rendered_scroll_steps, rendered_scroll_delay_ms }) => {
    const threshold = Math.max(0, Number(min_len)||200);
    // 1) Try static
    const staticRes = await (async () => {
      try {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(url, { headers: { 'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' } });
        if (!res.ok) throw new Error(`fetch_status_${res.status}`);
        const html = await res.text();
        const { JSDOM } = await import('jsdom');
        const { Readability } = await import('@mozilla/readability');
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        const title = article?.title || dom.window.document.title || null;
        const text = article?.textContent || null;
        return { url, title, text };
      } catch { return { url, title: null, text: null }; }
    })();
    if ((staticRes.text || '').length >= threshold) {
      return { structuredContent: { url, title: staticRes.title, text: staticRes.text, fallback_used: false }, content:[{ type:'text', text: staticRes.title || url }] };
    }
    // 2) Fallback to rendered
    const rendered = await (async () => {
      try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ userAgent: process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
        const w = Number(rendered_wait_ms)||800; if (w) await page.waitForTimeout(w);
        const steps = Math.max(0, Math.min(50, Number(rendered_scroll_steps)||2));
        const delay = Math.max(0, Math.min(2000, Number(rendered_scroll_delay_ms)||300));
        for (let i=0;i<steps;i++){ try { await page.evaluate(()=>window.scrollBy(0, window.innerHeight)); } catch {}; if (delay) await page.waitForTimeout(delay); }
        const html = await page.content();
        const title = await page.title().catch(()=>null);
        let text = null;
        try {
          const { JSDOM } = await import('jsdom');
          const { Readability } = await import('@mozilla/readability');
          const dom = new JSDOM(html, { url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();
          text = article?.textContent || null;
        } catch {}
        if (!text) { try { text = await page.evaluate(()=>document.body?.innerText || '') || null; } catch {} }
        try { await page.close(); } catch {}
        try { await browser.close(); } catch {}
        return { url, title, text };
      } catch { return { url, title: null, text: null }; }
    })();
    return { structuredContent: { url, title: rendered.title || staticRes.title, text: rendered.text || staticRes.text, fallback_used: true }, content:[{ type:'text', text: (rendered.title || staticRes.title || url) }] };
  });

  // Deep Research: crawl_site - BFS crawl within a site (same-origin by default)
  server.registerTool('crawl_site', {
    title: 'Crawl Site',
    description: 'Crawl a website from a root URL using Readability extraction.',
    inputSchema: { root_url: z.string().url(), max_pages: z.number().int().optional(), same_origin: z.boolean().optional(), depth: z.number().int().optional(), delay_ms: z.number().int().optional() },
    outputSchema: { items: z.array(z.object({ url: z.string(), title: z.string().nullable(), text: z.string().nullable(), links: z.array(z.string()) })) }
  }, async ({ root_url, max_pages, same_origin, depth, delay_ms }) => {
    try {
      const fetch = (await import('node-fetch')).default;
      const { JSDOM } = await import('jsdom');
      const { Readability } = await import('@mozilla/readability');
      const normalize = (u) => { try { const x = new URL(u); x.hash=''; return x.toString(); } catch { return null; } };
      const root = new URL(root_url);
      const limit = Math.max(1, Math.min(50, Number(max_pages)||10));
      const maxDepth = Math.max(0, Math.min(4, Number(depth)||2));
      const same = same_origin === false ? false : true;
      const delay = Math.max(0, Math.min(2000, Number(delay_ms)||Number(process.env.CRAWL_DELAY_MS||200)));
      const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
      const seen = new Set();
      const out = [];
      const q = [{ url: normalize(root.toString()), d:0 }];
      while (q.length && out.length < limit) {
        const { url, d } = q.shift();
        if (!url || seen.has(url)) continue; seen.add(url);
        try {
          const res = await fetch(url, { headers:{ 'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' } });
          if (!res.ok) { await sleep(delay); continue; }
          const html = await res.text();
          const dom = new JSDOM(html, { url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();
          const title = article?.title || dom.window.document.title || null;
          const text = article?.textContent || null;
          const links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(a => a.href).map(normalize).filter(Boolean);
          out.push({ url, title, text, links: links.slice(0,100) });
          if (d < maxDepth) {
            for (const l of links) {
              try { const u = new URL(l); if (u.protocol !== 'http:' && u.protocol !== 'https:') continue; if (same && u.origin !== root.origin) continue; if (!seen.has(l)) q.push({ url: l, d: d+1 }); } catch {}
              if (q.length + out.length >= limit) break;
            }
          }
        } catch {}
        if (delay) await sleep(delay);
      }
      return { structuredContent: { items: out }, content:[{ type:'text', text:`pages=${out.length}` }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'crawl_error' }], isError:true }; }
  });

  // Deep Research: crawl a set of URLs with limited concurrency
  server.registerTool('crawl_urls', {
    title: 'Crawl URLs',
    description: 'Fetch and extract a list of URLs using Readability.',
    inputSchema: { urls: z.array(z.string().url()), concurrency: z.number().int().optional(), delay_ms: z.number().int().optional() },
    outputSchema: { items: z.array(z.object({ url: z.string(), title: z.string().nullable(), text: z.string().nullable(), links: z.array(z.string()) })) }
  }, async ({ urls, concurrency, delay_ms }) => {
    try {
      const fetch = (await import('node-fetch')).default;
      const { JSDOM } = await import('jsdom');
      const { Readability } = await import('@mozilla/readability');
      const normalize = (u) => { try { const x = new URL(u); x.hash=''; return x.toString(); } catch { return null; } };
      const list = (Array.isArray(urls)? urls: []).map(normalize).filter(Boolean);
      const conc = Math.max(1, Math.min(8, Number(concurrency)||Number(process.env.CRAWL_CONCURRENCY||3)));
      const delay = Math.max(0, Math.min(2000, Number(delay_ms)||Number(process.env.CRAWL_DELAY_MS||150)));
      const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
      const out = [];
      let i = 0;
      async function worker(){
        while (true) {
          const idx = i++; if (idx >= list.length) break;
          const url = list[idx];
          try {
            const res = await fetch(url, { headers:{ 'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' } });
            if (!res.ok) { if (delay) await sleep(delay); continue; }
            const html = await res.text();
            const dom = new JSDOM(html, { url });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            const title = article?.title || dom.window.document.title || null;
            const text = article?.textContent || null;
            const links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(a => a.href).map(normalize).filter(Boolean).slice(0,100);
            out.push({ url, title, text, links });
          } catch {}
          if (delay) await sleep(delay);
        }
      }
      await Promise.all(Array.from({length: conc}, ()=> worker()));
      return { structuredContent: { items: out }, content:[{ type:'text', text:`pages=${out.length}` }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'crawl_error' }], isError:true }; }
  });

  // Deep Research: notes store
  server.registerTool('write_note', {
    title: 'Write Note',
    description: 'Save a research note with optional source URI and tags.',
    inputSchema: { text: z.string(), source_uri: z.string().optional(), tags: z.array(z.string()).optional() },
    outputSchema: { id: z.string(), createdAt: z.number().int() }
  }, async ({ text, source_uri, tags }) => {
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const file = path.join(RESEARCH_NOTES_DIR, `${id}.json`);
      const rec = { id, text, source_uri: source_uri||null, tags: Array.isArray(tags)? tags: [], created_at: Date.now() };
      fs.writeFileSync(file, JSON.stringify(rec, null, 2));
      return { structuredContent: { id, createdAt: rec.created_at }, content:[{ type:'text', text: id }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'note_write_failed' }], isError:true }; }
  });

  server.registerTool('list_notes', {
    title: 'List Notes',
    description: 'List saved research notes, optionally filtered by substring.',
    inputSchema: { query: z.string().optional(), limit: z.number().int().optional() },
    outputSchema: { items: z.array(z.object({ id: z.string(), text: z.string(), source_uri: z.string().nullable(), tags: z.array(z.string()), created_at: z.number().int() })) }
  }, async ({ query, limit }) => {
    try {
      const files = (fs.readdirSync(RESEARCH_NOTES_DIR) || []).filter(f=>f.endsWith('.json'))
        .map(f=>({ f, m: (()=>{ try { return fs.statSync(path.join(RESEARCH_NOTES_DIR,f)).mtimeMs||0; } catch { return 0; } })() }))
        .sort((a,b)=> b.m - a.m);
      const out = [];
      for (const it of files) {
        try { const j = JSON.parse(fs.readFileSync(path.join(RESEARCH_NOTES_DIR,it.f),'utf8')); out.push(j); } catch {}
        if (out.length >= Math.max(1, Math.min(200, Number(limit)||50))) break;
      }
      const q = String(query||'').toLowerCase();
      const items = q ? out.filter(r => (r.text||'').toLowerCase().includes(q)) : out;
      return { structuredContent: { items }, content:[{ type:'text', text: `notes=${items.length}` }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'list_failed' }], isError:true }; }
  });

  server.registerTool('read_note', {
    title: 'Read Note',
    description: 'Read a saved note by ID.',
    inputSchema: { id: z.string() },
    outputSchema: { note: z.any() }
  }, async ({ id }) => {
    try {
      const safe = String(id||'').replace(/[^A-Za-z0-9_-]/g,'');
      const file = path.join(RESEARCH_NOTES_DIR, `${safe}.json`);
      const j = JSON.parse(fs.readFileSync(file,'utf8'));
      return { structuredContent: { note: j }, content:[{ type:'text', text: safe }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'read_failed' }], isError:true }; }
  });

  server.registerTool('delete_note', {
    title: 'Delete Note',
    description: 'Delete a saved note by ID.',
    inputSchema: { id: z.string() },
    outputSchema: { ok: z.boolean() }
  }, async ({ id }) => {
    try { const file = path.join(RESEARCH_NOTES_DIR, `${String(id).replace(/[^A-Za-z0-9_-]/g,'')}.json`); fs.unlinkSync(file); return { structuredContent:{ ok:true }, content:[{ type:'text', text:'ok' }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'delete_failed' }], isError:true }; }
  });

  server.registerTool('finalize_report', {
    title: 'Finalize Report',
    description: 'Compose a Deep Research report from notes and context; emits a JSON report.',
    inputSchema: {
      title: z.string(),
      outline: z.array(z.string()).optional(),
      include_notes: z.array(z.string()).optional(),
      extra_context: z.string().optional(),
    },
    outputSchema: { file: z.string(), mtime: z.number().int(), uri: z.string() }
  }, async ({ title, outline, include_notes, extra_context }) => {
    try {
      const safeTitle = String(title||'untitled').replace(/[^A-Za-z0-9._ -]/g,'').slice(0,120);
      const stamp = new Date().toISOString().replace(/[:.]/g,'-');
      const base = `${safeTitle.replace(/\s+/g,'_')}-${stamp}`;
      const file = path.join(RESEARCH_REPORTS_DIR, `${base}.json`);
      const notes = [];
      if (Array.isArray(include_notes)) {
        for (const id of include_notes) {
          try { const j = JSON.parse(fs.readFileSync(path.join(RESEARCH_NOTES_DIR, `${String(id).replace(/[^A-Za-z0-9_-]/g,'')}.json`),'utf8')); notes.push(j); } catch {}
        }
      }
      const data = {
        title: safeTitle,
        outline: Array.isArray(outline) ? outline : null,
        sections: [],
        notes,
        extra_context: extra_context || null,
        citations: [],
        created_at: Date.now(),
      };
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      const uri = `research://deep-research/${base}.json`;
      const mtime = (()=>{ try { return fs.statSync(file).mtimeMs||Date.now(); } catch { return Date.now(); } })();
      try { await sendResearchWebhook('research:report_finalized', { file: `${base}.json`, uri, mtime }); } catch {}
      return { structuredContent: { file: `${base}.json`, mtime, uri }, content:[{ type:'text', text: uri }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'finalize_failed' }], isError:true }; }
  });

  // Ingest an OpenAI webhook event into a research note
  server.registerTool('ingest_openai_webhook', {
    title: 'Ingest OpenAI Webhook',
    description: 'Create a research note from an OpenAI webhook event payload.',
    inputSchema: { event: z.any(), tags: z.array(z.string()).optional() },
    outputSchema: { id: z.string(), createdAt: z.number().int() }
  }, async ({ event, tags }) => {
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const file = path.join(RESEARCH_NOTES_DIR, `${id}.json`);
      const text = `OpenAI Webhook Event: ${String(event?.type||'unknown')}`;
      const rec = { id, text, source_uri: null, tags: Array.isArray(tags)? tags: ['openai','webhook'], created_at: Date.now(), event };
      fs.writeFileSync(file, JSON.stringify(rec, null, 2));
      return { structuredContent: { id, createdAt: rec.created_at }, content:[{ type:'text', text: id }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'ingest_failed' }], isError:true }; }
  });

  // Helper: wait until a new ai-token-analyses report for a mint appears (polling)
  server.registerTool('wait_for_report_by_mint', {
    title: 'Wait For Report By Mint',
    description: 'Poll recent analyses until a report for a mint appears or timeout.',
    inputSchema: { mint: z.string(), timeout_sec: z.number().int().optional(), poll_ms: z.number().int().optional() },
    outputSchema: { file: z.string().nullable(), uri: z.string().nullable(), mtime: z.number().int().nullable() }
  }, async ({ mint, timeout_sec, poll_ms }) => {
    const deadline = Date.now() + (Math.max(5, Math.min(900, Number(timeout_sec)||300)) * 1000);
    const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
    const interval = Math.max(500, Math.min(5000, Number(poll_ms)||1500));
    while (Date.now() < deadline) {
      const out = findReportByMint(mint);
      if (out.file) {
        const mtimeInt = (out.mtime!=null) ? Math.floor(Number(out.mtime)||0) : null;
        try { await sendResearchWebhook('analysis:report_ready', { mint, file: out.file, uri: reportUriFor(out.file), mtime: mtimeInt }); } catch {}
        return { structuredContent: { file: out.file, uri: reportUriFor(out.file), mtime: mtimeInt }, content:[{ type:'text', text: out.file }] };
      }
      await sleep(interval);
    }
    return { structuredContent: { file: null, uri: null, mtime: null }, content:[{ type:'text', text:'timeout' }], isError:true };
  });

  // Jobs helper: list active runs with latest report metadata
  server.registerTool('list_jobs', {
    title: 'List Jobs',
    description: 'List active runs (agent/socials) with latest report info if applicable.',
    outputSchema: { items: z.array(z.object({ pid: z.number().int(), kind: z.string(), mint: z.string().nullable(), startedAt: z.number().int(), latest_file: z.string().nullable(), latest_mtime: z.number().int().nullable() })) }
  }, async () => {
    const items = Array.from(activeRuns.entries()).map(([pid, v]) => {
      const m = v.mint || null;
      const rep = m ? findReportByMint(m) : { file:null, mtime:null };
      const latest_mtime = (rep.mtime!=null) ? Math.floor(Number(rep.mtime)||0) : null;
      return { pid, kind: v.kind, mint: m, startedAt: v.startedAt, latest_file: rep.file || null, latest_mtime };
    });
    return { structuredContent: { items }, content:[{ type:'text', text: JSON.stringify(items) }] };
  });

  // Jobs helper: get analysis status for a mint
  server.registerTool('get_analysis_status', {
    title: 'Get Analysis Status',
    description: 'Return running status and latest report for a mint.',
    inputSchema: { mint: z.string() },
    outputSchema: { running: z.boolean(), pid: z.number().int().nullable(), latest_file: z.string().nullable(), latest_mtime: z.number().int().nullable() }
  }, async ({ mint }) => {
    let running = false; let pid = null;
    for (const [p, v] of activeRuns.entries()) { if ((v.mint||'') === mint) { running = true; pid = p; break; } }
    const rep = findReportByMint(mint);
    const latest_mtime = (rep.mtime!=null) ? Math.floor(Number(rep.mtime)||0) : null;
    return { structuredContent: { running, pid, latest_file: rep.file || null, latest_mtime }, content:[{ type:'text', text: (rep.file||'none') }] };
  });

  // Utility: list SPL token balances for a wallet (parsed)
  // Purpose: Let MCP clients discover what tokens a wallet can sell
  // Inputs: wallet_id (managed_wallets ID), min_ui?, limit?
  server.registerTool('list_wallet_token_balances', {
    title: 'List Wallet Token Balances',
    description: 'List SPL token balances held by a managed wallet (descending by UI amount).',
    inputSchema: {
      wallet_id: z.string().optional(),
      min_ui: z.number().nonnegative().optional(),
      limit: z.number().int().optional(),
    },
    outputSchema: {
      items: z.array(z.object({
        mint: z.string(),
        ata: z.string(),
        decimals: z.number().int(),
        amount_ui: z.number(),
        amount_raw: z.string(),
      }))
    }
  }, async ({ wallet_id, min_ui, limit }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../trade-manager/wallet-utils.js');
      const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      let wid = wallet_id;
      if (!wid) {
        const r = resolveWalletForRequest(extra);
        wid = r.wallet_id;
        if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true };
      }
      const { publicKey } = await loadWallet(wid);
      const resp = await conn.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
      const items = [];
      for (const it of resp.value || []) {
        try {
          const info = it.account?.data?.parsed?.info;
          const amt = info?.tokenAmount;
          if (!amt) continue;
          const ui = Number(amt.uiAmount || 0);
          const dec = Number(amt.decimals || 0);
          if (ui <= Number(min_ui || 0)) continue;
          items.push({
            mint: String(info?.mint || ''),
            ata: String(it.pubkey?.toBase58?.() || ''),
            decimals: dec,
            amount_ui: ui,
            amount_raw: String(amt.amount || '0')
          });
        } catch {}
      }
      items.sort((a,b)=> b.amount_ui - a.amount_ui);
      const out = (limit && Number(limit) > 0) ? items.slice(0, Number(limit)) : items;
      return { structuredContent: { items: out }, content: [{ type:'text', text: JSON.stringify(out) }] };
    } catch (e) {
      const diag = {
        error: e?.message || 'list_failed',
        hasDbUrl: !!process.env.DATABASE_URL,
        hasRpcUrl: !!process.env.RPC_URL,
        hasSolanaRpcEndpoint: !!process.env.SOLANA_RPC_ENDPOINT,
        stack: e?.stack ? String(e.stack).split('\n').slice(0,4).join(' | ') : null
      };
      return { content: [{ type:'text', text: JSON.stringify(diag) }], isError: true };
    }
  });

  // Token resolution
  // Purpose: Resolve token names/symbols to Solana mint addresses using DexScreener
  // Behavior: Searches DexScreener, filters by chain, returns top results by liquidity
  server.registerTool('resolve_token', {
    title: 'Resolve Token',
    description: 'Resolve a token name or symbol to Solana mint addresses using DexScreener search.',
    inputSchema: {
      query: z.string().describe('Token name or symbol to search for (e.g., "BONK", "LABUBU")'),
      chain: z.enum(['solana']).default('solana').optional().describe('Blockchain to search on'),
      limit: z.number().int().min(1).max(10).default(5).optional().describe('Maximum results to return')
    },
    outputSchema: {
      results: z.array(z.object({
        address: z.string(),
        symbol: z.string(),
        name: z.string().nullable(),
        liquidity_usd: z.number(),
        volume_24h: z.number().optional(),
        price_usd: z.number().optional(),
        dex_id: z.string().optional(),
        pair_address: z.string().optional(),
        url: z.string().nullable()
      }))
    }
  }, async ({ query, chain = 'solana', limit = 5 }) => {
    try {
      const fetch = (await import('node-fetch')).default;
      
      // Fetch actual SOL price from CoinGecko
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (!priceResponse.ok) {
        throw new Error('Failed to fetch SOL price from CoinGecko');
      }
      const priceData = await priceResponse.json();
      const solPrice = priceData?.solana?.usd;
      if (!solPrice) {
        throw new Error('Invalid SOL price data from CoinGecko');
      }
      
      const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { 'accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`DexScreener API error: ${response.status}`);
      }
      
      const data = await response.json();
      const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
      
      // Constants for filtering
      const GENERIC_ADDR_SOL = 'So11111111111111111111111111111111111111112'.toLowerCase();
      const GENERIC_SYMS = new Set(['SOL', 'USDC', 'USDT']);
      const targetSymbol = String(query || '').toUpperCase();
      
      // Build token map with roles tracking
      const tokenMap = new Map();
      
      for (const pair of pairs) {
        if ((pair?.chainId || '').toLowerCase() !== chain.toLowerCase()) continue;
        
        // CRITICAL: Use quote-side liquidity to avoid scams
        // Quote liquidity is the REAL money in the pool (SOL/USDC)
        const quoteSymbol = (pair?.quoteToken?.symbol || '').toUpperCase();
        const quoteLiq = Number(pair?.liquidity?.quote || 0);
        
        // Calculate real liquidity value based on quote token
        let realLiquidityUsd = 0;
        if (quoteSymbol === 'SOL') {
          // Use the actual SOL price fetched above
          realLiquidityUsd = quoteLiq * solPrice;
        } else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') {
          realLiquidityUsd = quoteLiq; // Stablecoins are 1:1 with USD
        } else {
          // Skip pairs that aren't against SOL or stablecoins
          continue;
        }
        
        // Process base token
        const base = pair.baseToken || pair.base || {};
        if (base.address) {
          const addr = base.address.toLowerCase();
          const rec = tokenMap.get(addr) || {
            address: base.address,
            symbol: (base.symbol || '').toUpperCase(),
            name: base.name || null,
            liquidity_usd: 0,
            real_liquidity_usd: 0,
            volume_24h: 0,
            evidence_count: 0,
            roles: new Set(),
            pairs: [],
            quote_preference: 0
          };
          
          // Use REAL liquidity for scoring
          rec.real_liquidity_usd += realLiquidityUsd;
          rec.liquidity_usd += Number(pair?.liquidity?.usd || 0); // Keep for reference
          rec.volume_24h += Number(pair?.volume?.h24 || 0);
          rec.evidence_count++;
          rec.roles.add('base');
          
          // Prefer SOL pairs over USDC pairs
          if (quoteSymbol === 'SOL') {
            rec.quote_preference += 2;
          } else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') {
            rec.quote_preference += 1;
          }
          
          if (rec.pairs.length < 3) {
            rec.pairs.push({
              dex_id: pair?.dexId || null,
              pair_address: pair?.pairAddress || null,
              liquidity_usd: Number(pair?.liquidity?.usd || 0),
              real_liquidity_usd: realLiquidityUsd,
              quote_token: quoteSymbol,
              quote_amount: quoteLiq,
              url: pair?.url || null,
              price_usd: (pair?.priceUsd != null ? Number(pair.priceUsd) : null)
            });
          }
          tokenMap.set(addr, rec);
        }
        
        // Process quote token
        const quote = pair.quoteToken || pair.quote || {};
        if (quote.address) {
          const addr = quote.address.toLowerCase();
          const rec = tokenMap.get(addr) || {
            address: quote.address,
            symbol: (quote.symbol || '').toUpperCase(),
            name: quote.name || null,
            liquidity_usd: 0,
            real_liquidity_usd: 0,
            volume_24h: 0,
            evidence_count: 0,
            roles: new Set(),
            pairs: [],
            quote_preference: 0
          };
          rec.liquidity_usd += Number(pair?.liquidity?.usd || 0);
          rec.real_liquidity_usd += realLiquidityUsd;  // Same real liquidity as calculated above
          rec.volume_24h += Number(pair?.volume?.h24 || 0);
          rec.evidence_count++;
          rec.roles.add('quote');
          if (rec.pairs.length < 3) {
            rec.pairs.push({
              dex_id: pair?.dexId || null,
              pair_address: pair?.pairAddress || null,
              liquidity_usd: Number(pair?.liquidity?.usd || 0),
              real_liquidity_usd: realLiquidityUsd,
              quote_token: quoteSymbol,
              quote_amount: quoteLiq,
              url: pair?.url || null,
              price_usd: (pair?.priceUsd != null ? Number(pair.priceUsd) : null)
            });
          }
          tokenMap.set(addr, rec);
        }
      }
      
      // Score and filter tokens
      let candidates = Array.from(tokenMap.values()).map(token => {
        // Calculate scores using REAL liquidity to avoid scams
        const exactMatch = token.symbol === targetSymbol ? 1 : 0;
        const partialMatch = (!exactMatch && token.symbol.includes(targetSymbol)) ? 0.5 : 0;
        
        // USE REAL LIQUIDITY for scoring, not fake total liquidity
        const liquidityScore = Math.log10(1 + token.real_liquidity_usd) * 20;
        const baseRole = token.roles.has('base') ? 1 : 0;
        
        // Volume score - real tokens have trading activity (log scale for big volumes)
        const volumeScore = Math.log10(1 + token.volume_24h) * 15;
        
        // Momentum bonus - what's hot RIGHT NOW gets priority
        let momentumBonus = 0;
        if (token.volume_24h > 1000000) {
          momentumBonus = 200;  // $1M+ daily volume = very hot
        } else if (token.volume_24h > 500000) {
          momentumBonus = 100;  // $500K+ = hot
        } else if (token.volume_24h > 100000) {
          momentumBonus = 50;   // $100K+ = warming up
        }
        
        // Add quote preference bonus (SOL pairs get extra points)
        const quoteBonus = token.quote_preference * 5;
        
        // Scam detection: If real liquidity is < 0.1% of total liquidity, it's likely fake
        const liquidityRatio = token.liquidity_usd > 0 ? 
          (token.real_liquidity_usd / token.liquidity_usd) : 1;
        const scamPenalty = liquidityRatio < 0.001 ? -500 : 0;
        
        // Dead token penalty - sliding scale based on volume
        // < $1K: -200 points (significant), < $10K: -100 points (moderate), >= $10K: no penalty
        let deadTokenPenalty = 0;
        if (token.volume_24h < 1000) {
          deadTokenPenalty = -200;
        } else if (token.volume_24h < 10000) {
          deadTokenPenalty = -100;
        }
        
        const score = exactMatch * 1000 + 
                     partialMatch * 200 + 
                     liquidityScore + 
                     volumeScore +
                     momentumBonus +
                     token.evidence_count * 5 + 
                     baseRole * 10 +
                     quoteBonus +
                     scamPenalty +
                     deadTokenPenalty;
        
        return {
          ...token,
          roles: Array.from(token.roles),
          score,
          liquidity_ratio: liquidityRatio,
          is_likely_scam: scamPenalty < 0,
          score_breakdown: {
            exact_match: exactMatch * 1000,
            partial_match: partialMatch * 200,
            liquidity_score: liquidityScore,
            volume_score: volumeScore,
            momentum_bonus: momentumBonus,
            evidence_count: token.evidence_count * 5,
            base_role: baseRole * 10,
            quote_bonus: quoteBonus,
            scam_penalty: scamPenalty,
            dead_token_penalty: deadTokenPenalty,
            total: score
          }
        };
      });
      
      // Filter out generic tokens and non-base tokens
      candidates = candidates.filter(c => 
        c.address.toLowerCase() !== GENERIC_ADDR_SOL && 
        !GENERIC_SYMS.has(c.symbol)
      );
      candidates = candidates.filter(c => c.roles.includes('base'));
      
      // Filter out likely scams (liquidity ratio < 0.1%)
      candidates = candidates.filter(c => !c.is_likely_scam);
      
      // Sort by score
      candidates.sort((a, b) => b.score - a.score);
      
      // Take only top candidates FIRST, then calculate confidence
      candidates = candidates.slice(0, limit);
      
      // Calculate confidence percentages only among the top candidates
      const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
      candidates = candidates.map(c => ({
        ...c,
        confidence: totalScore > 0 ? (c.score / totalScore) : (1 / candidates.length)
      }));
      
      if (candidates.length === 0) {
        return {
          content: [{ type: 'text', text: `No tokens found for query: ${query}` }]
        };
      }
      
      // Format response
      const topMatch = candidates[0];
      const confPct = Math.round(topMatch.confidence * 100);
      const summary = `Found ${candidates.length} token(s) for "${query}". Top match: ${topMatch.symbol} (${topMatch.address.slice(0, 8)}...) with ${confPct}% confidence, $${Math.round(topMatch.real_liquidity_usd).toLocaleString()} quote liquidity`;
      
      // Include confidence and scoring details in response
      const results = candidates.map(c => ({
        address: c.address,
        symbol: c.symbol,
        name: c.name,
        liquidity_usd: c.liquidity_usd,  // Total liquidity as expected by the schema
        volume_24h: c.volume_24h,
        price_usd: (c.pairs.find(p => typeof p.price_usd === 'number')?.price_usd) ?? 0,
        dex_id: c.pairs[0]?.dex_id || null,
        pair_address: c.pairs[0]?.pair_address || null,
        url: c.pairs[0]?.url || null,
        // Additional fields for detailed analysis
        confidence: Math.round(c.confidence * 100),
        quote_liquidity_usd: c.real_liquidity_usd,  // The REAL money in the pool
        liquidity_ratio: c.liquidity_ratio,
        is_likely_scam: c.is_likely_scam,
        score: c.score,
        score_breakdown: c.score_breakdown
      }));
      
      return {
        structuredContent: { results },
        content: [{ 
          type: 'text', 
          text: summary + '\n\n' + JSON.stringify(results, null, 2)
        }]
      };
    } catch (e) {
      return { 
        content: [{ type: 'text', text: `Failed to resolve token: ${e?.message || 'unknown_error'}` }], 
        isError: true 
      };
    }
  });

  // Smart sell
  // Purpose: Find a viable sell route by probing output mints (SOL/USDC) and slippages
  // Behavior: Returns early on first valid route; supports optional price-impact guard
  server.registerTool('smart_sell', {
    title: 'Smart Sell',
    description: 'Attempts multiple outputs and slippages to execute a sell for the given token.',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      token_amount: z.number().nonnegative().optional(),
      percent_of_balance: z.number().nonnegative().max(100).optional(),
      outputs: z.array(z.string()).optional().describe('Preferred output mints, defaults to [SOL] then USDC'),
      slippages_bps: z.array(z.number().int()).optional().describe('Slippages to try in bps, defaults [100,200,300]'),
      priority_lamports: z.number().int().optional(),
      max_price_impact_pct: z.number().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string(),
      action: z.string(),
      token_mint: z.string(),
      tokens_sold_ui: z.number().nullable(),
      out_mint: z.string().nullable(),
      out_amount_ui: z.string().nullable(),
      slippage_bps_used: z.number().int().nullable(),
      solscan_url: z.string().nullable(),
    }
  }, async ({ wallet_id, token_mint, token_amount, percent_of_balance, outputs, slippages_bps, priority_lamports, max_price_impact_pct }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../trade-manager/wallet-utils.js');
      let wid = wallet_id; if (!wid) { const r = resolveWalletForRequest(extra); wid = r.wallet_id; if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      const { publicKey, wallet } = await loadWallet(wid);
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');

      // Determine sell amount UI
      let sellUi = Number(token_amount || 0);
      if (!sellUi || sellUi <= 0) {
        const mintPk = new PublicKey(token_mint);
        const ata = await getAssociatedTokenAddress(mintPk, publicKey);
        let account; try { account = await getAccount(conn, ata); } catch { account = null; }
        const dec = await getTokenDecimals(token_mint);
        const balanceRaw = account?.amount ?? 0n;
        const balUi = Number(balanceRaw) / Math.pow(10, dec);
        const pct = Number(percent_of_balance || 0);
        if (pct > 0) sellUi = balUi * (pct / 100);
        if (!sellUi || sellUi <= 0) {
          return { content: [{ type:'text', text: 'no_amount' }], isError: true };
        }
      }

      const USDC = 'EPjFWdd5AufqSSqeM2qN1xzyXH8m9GZ4HCS4ZLxLtZ8';
      const outMints = Array.isArray(outputs) && outputs.length ? outputs : [SOL_MINT, USDC];
      const slips = Array.isArray(slippages_bps) && slippages_bps.length ? slippages_bps : [100, 200, 300];

      const decIn = await getTokenDecimals(token_mint);
      const raw = BigInt(Math.floor(Number(sellUi) * Math.pow(10, decIn)));

      let chosen = null;
      for (const out of outMints) {
        for (const s of slips) {
          try {
            const quote = await getQuote({ inputMint: token_mint, outputMint: out, amount: String(raw), slippageBps: Number(s) });
            const pi = (quote?.priceImpactPct ?? null);
            if (max_price_impact_pct != null && typeof pi === 'number' && pi > Number(max_price_impact_pct)) continue;
            if (quote?.outAmount) { chosen = { out, s, quote }; break; }
          } catch {}
        }
        if (chosen) break;
      }
      if (!chosen) {
        return { content: [{ type:'text', text: 'no_route' }], isError: true };
      }

      const { out, s: slip, quote } = chosen;
      const { keypair } = await loadWallet(wid);
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: Number(priority_lamports)||10000 });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const sig = await conn.sendRawTransaction(transaction.serialize());
      await conn.confirmTransaction(sig, 'confirmed');
      const outUi = quote?.outAmount ? (out === SOL_MINT ? formatTokenAmount(quote.outAmount, SOL_DECIMALS) : formatTokenAmount(quote.outAmount, 6)) : null;
      return {
        structuredContent: {
          success: true,
          tx_hash: sig,
          wallet_id: wid,
          action: 'sell',
          token_mint,
          tokens_sold_ui: Number(sellUi),
          out_mint: out,
          out_amount_ui: outUi,
          slippage_bps_used: Number(slip),
          solscan_url: `https://solscan.io/tx/${sig}`
        },
        content: [{ type:'text', text: `tx=${sig}` }]
      };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'smart_sell_failed' }], isError: true };
    }
  });

  // Smart buy
  // Purpose: Robust buy helper; supports ExactIn (sol_amount) and ExactOut (out_amount_ui)
  // Behavior: Tries input mints (defaults SOL) and slippages; executes the first viable route
  server.registerTool('smart_buy', {
    title: 'Smart Buy',
    description: 'Attempts multiple input mints and slippages to execute a buy for the given token. Supports ExactOut.',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      // ExactIn path (default): provide input SOL amount
      sol_amount: z.number().positive().optional(),
      // ExactOut path: target output token amount (UI)
      out_amount_ui: z.number().positive().optional(),
      use_exact_out: z.boolean().optional(),
      input_mints: z.array(z.string()).optional().describe('Preferred input mints, defaults to [SOL]'),
      slippages_bps: z.array(z.number().int()).optional().describe('Slippages to try in bps, defaults [100,200,300]'),
      priority_lamports: z.number().int().optional(),
      max_price_impact_pct: z.number().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string(),
      action: z.string(),
      token_mint: z.string(),
      tokens_bought_ui: z.string().nullable(),
      in_mint: z.string().nullable(),
      in_amount_ui: z.string().nullable(),
      slippage_bps_used: z.number().int().nullable(),
      price_impact: z.any().optional(),
      solscan_url: z.string().nullable(),
    }
  }, async ({ wallet_id, token_mint, sol_amount, out_amount_ui, use_exact_out, input_mints, slippages_bps, priority_lamports, max_price_impact_pct }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../trade-manager/wallet-utils.js');
      let wid = wallet_id; if (!wid) { const r = resolveWalletForRequest(extra); wid = r.wallet_id; if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      const { keypair, publicKey, wallet } = await loadWallet(wid);
      const { PublicKey } = await import('@solana/web3.js');
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');

      const USDC = 'EPjFWdd5AufqSSqeM2qN1xzyXH8m9GZ4HCS4ZLxLtZ8';
      const inMints = Array.isArray(input_mints) && input_mints.length ? input_mints : [SOL_MINT];
      const slips = Array.isArray(slippages_bps) && slippages_bps.length ? slippages_bps : [100, 200, 300];

      const outDecimals = await getTokenDecimals(token_mint);
      const isExactOut = String(use_exact_out || '').toLowerCase() === 'true' || use_exact_out === true;
      let chosen = null;

      if (isExactOut) {
        const rawOut = BigInt(Math.floor(Number(out_amount_ui || 0) * Math.pow(10, outDecimals)));
        if (!rawOut || rawOut <= 0n) return { content:[{ type:'text', text:'bad_out_amount' }], isError:true };
        for (const im of inMints) {
          for (const s of slips) {
            try {
              const quote = await getQuote({ inputMint: im, outputMint: token_mint, amount: String(rawOut), slippageBps: Number(s), swapMode: 'ExactOut' });
              const pi = (quote?.priceImpactPct ?? null);
              if (max_price_impact_pct != null && typeof pi === 'number' && pi > Number(max_price_impact_pct)) continue;
              if (quote?.outAmount) { chosen = { im, s, quote, mode:'ExactOut' }; break; }
            } catch {}
          }
          if (chosen) break;
        }
      } else {
        const lamports = BigInt(Math.floor(Number(sol_amount || 0) * Math.pow(10, SOL_DECIMALS)));
        if (!lamports || lamports <= 0n) return { content:[{ type:'text', text:'bad_sol_amount' }], isError:true };
        for (const im of inMints) {
          for (const s of slips) {
            try {
              const quote = await getQuote({ inputMint: im, outputMint: token_mint, amount: String(lamports), slippageBps: Number(s), swapMode: 'ExactIn' });
              const pi = (quote?.priceImpactPct ?? null);
              if (max_price_impact_pct != null && typeof pi === 'number' && pi > Number(max_price_impact_pct)) continue;
              if (quote?.outAmount) { chosen = { im, s, quote, mode:'ExactIn' }; break; }
            } catch {}
          }
          if (chosen) break;
        }
      }

      if (!chosen) return { content:[{ type:'text', text:'no_route' }], isError:true };

      const { im, s, quote } = chosen;
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: Number(priority_lamports)||10000 });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const sig = await conn.sendRawTransaction(transaction.serialize());
      await conn.confirmTransaction(sig, 'confirmed');

      const outUi = quote?.outAmount ? formatTokenAmount(quote.outAmount, outDecimals) : null;
      const inUi = quote?.inAmount ? (im === SOL_MINT ? formatTokenAmount(quote.inAmount, SOL_DECIMALS) : formatTokenAmount(quote.inAmount, 6)) : null;
      return {
        structuredContent: {
          success: true,
          tx_hash: sig,
          wallet_id: wid,
          action: 'buy',
          token_mint,
          tokens_bought_ui: outUi,
          in_mint: im,
          in_amount_ui: inUi,
          slippage_bps_used: Number(s),
          price_impact: quote?.priceImpactPct ?? null,
          solscan_url: `https://solscan.io/tx/${sig}`
        },
        content: [{ type:'text', text:`tx=${sig}` }]
      };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'smart_buy_failed' }], isError:true };
    }
  });

  // Unified trade helper
  // Purpose: Single tool to access buy/sell flows; thin wrapper around smart_buy/smart_sell
  server.registerTool('trade', {
    title: 'Trade',
    description: 'Unified buy/sell entrypoint. For buy supports ExactIn (sol_amount) and ExactOut (out_amount_ui). For sell tries outputs/slippages.',
    inputSchema: {
      action: z.enum(['buy','sell']).describe('buy or sell'),
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      // Buy params
      sol_amount: z.number().positive().optional(),
      use_exact_out: z.boolean().optional(),
      out_amount_ui: z.number().positive().optional(),
      input_mints: z.array(z.string()).optional(),
      max_price_impact_pct: z.number().optional(),
      // Sell params
      token_amount: z.number().nonnegative().optional(),
      percent_of_balance: z.number().nonnegative().max(100).optional(),
      outputs: z.array(z.string()).optional(),
      output_mint: z.string().optional(),
      // Shared
      slippages_bps: z.array(z.number().int()).optional(),
      priority_lamports: z.number().int().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string(),
      action: z.string(),
      token_mint: z.string(),
      detail: z.any().optional(),
      solscan_url: z.string().nullable(),
    }
  }, async (args, extra) => {
    try {
      const { action, token_mint } = args;
      let wallet_id = args.wallet_id; if (!wallet_id) { const r = resolveWalletForRequest(extra); wallet_id = r.wallet_id; if (!wallet_id) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      if (action === 'buy') {
        // Delegate to smart_buy logic inline
        const out = await (async ()=>{
          const { sol_amount, out_amount_ui, use_exact_out, input_mints, slippages_bps, priority_lamports, max_price_impact_pct } = args;
          const conn = await getRpcConnection();
          const { loadWallet } = await import('../trade-manager/wallet-utils.js');
          const { keypair, publicKey } = await loadWallet(wallet_id);
          const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');
          const outDecimals = await getTokenDecimals(token_mint);
          const inMints = Array.isArray(input_mints) && input_mints.length ? input_mints : [SOL_MINT];
          const slips = Array.isArray(slippages_bps) && slippages_bps.length ? slippages_bps : [100,200,300];
          const isExactOut = String(use_exact_out||'').toLowerCase()==='true' || use_exact_out===true;
          let chosen = null;
          if (isExactOut) {
            const rawOut = BigInt(Math.floor(Number(out_amount_ui||0) * Math.pow(10, outDecimals)));
            if (!rawOut || rawOut <= 0n) throw new Error('bad_out_amount');
            for (const im of inMints) {
              for (const s of slips) {
                try {
                  const quote = await getQuote({ inputMint: im, outputMint: token_mint, amount: String(rawOut), slippageBps: Number(s), swapMode: 'ExactOut' });
                  const pi = (quote?.priceImpactPct ?? null);
                  if (max_price_impact_pct != null && typeof pi === 'number' && pi > Number(max_price_impact_pct)) continue;
                  if (quote?.outAmount) { chosen = { im, s, quote }; break; }
                } catch {}
              }
              if (chosen) break;
            }
          } else {
            const lamports = BigInt(Math.floor(Number(sol_amount||0) * Math.pow(10, SOL_DECIMALS)));
            if (!lamports || lamports <= 0n) throw new Error('bad_sol_amount');
            for (const im of inMints) {
              for (const s of slips) {
                try {
                  const quote = await getQuote({ inputMint: im, outputMint: token_mint, amount: String(lamports), slippageBps: Number(s), swapMode: 'ExactIn' });
                  const pi = (quote?.priceImpactPct ?? null);
                  if (max_price_impact_pct != null && typeof pi === 'number' && pi > Number(max_price_impact_pct)) continue;
                  if (quote?.outAmount) { chosen = { im, s, quote }; break; }
                } catch {}
              }
              if (chosen) break;
            }
          }
          if (!chosen) throw new Error('no_route');
          const { im, s, quote } = chosen;
          const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: Number(priority_lamports)||10000 });
          const transaction = deserializeTransaction(swapResponse.swapTransaction);
          transaction.sign([keypair]);
          const sig = await conn.sendRawTransaction(transaction.serialize());
          await conn.confirmTransaction(sig, 'confirmed');
          const outUi = quote?.outAmount ? (await (async()=>{ return formatTokenAmount(quote.outAmount, outDecimals); })()) : null;
          const inUi = quote?.inAmount ? (await (async()=>{ return im===SOL_MINT ? formatTokenAmount(quote.inAmount, SOL_DECIMALS) : formatTokenAmount(quote.inAmount, 6); })()) : null;
          return { tx: sig, detail: { in_mint: im, in_amount_ui: inUi, out_amount_ui: outUi, slippage_bps_used: Number(s), price_impact: quote?.priceImpactPct ?? null } };
        })();
        return { structuredContent: { success: true, tx_hash: out.tx, wallet_id, action:'buy', token_mint, detail: out.detail, solscan_url: `https://solscan.io/tx/${out.tx}` }, content: [{ type:'text', text:`tx=${out.tx}` }] };
      } else if (action === 'sell') {
        // Delegate to smart_sell logic inline
      const out = await (async ()=>{
          const { token_amount, percent_of_balance, outputs, slippages_bps, priority_lamports, max_price_impact_pct } = args;
          const conn = await getRpcConnection();
          const { loadWallet } = await import('../trade-manager/wallet-utils.js');
          const { keypair, publicKey } = await loadWallet(wallet_id);
          const { PublicKey } = await import('@solana/web3.js');
          const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
          const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');
          // amount
          let sellUi = Number(token_amount || 0);
          if (!sellUi || sellUi <= 0) {
            const mintPk = new PublicKey(token_mint);
            const ata = await getAssociatedTokenAddress(mintPk, publicKey);
            let account; try { account = await getAccount(conn, ata); } catch { account = null; }
            const dec = await getTokenDecimals(token_mint);
            const balanceRaw = account?.amount ?? 0n;
            const balUi = Number(balanceRaw) / Math.pow(10, dec);
            const pct = Number(percent_of_balance || 0);
            if (pct > 0) sellUi = balUi * (pct / 100);
            if (!sellUi || sellUi <= 0) throw new Error('no_amount');
          }
          const USDC = 'EPjFWdd5AufqSSqeM2qN1xzyXH8m9GZ4HCS4ZLxLtZ8';
          const outMints = Array.isArray(outputs) && outputs.length ? outputs : [SOL_MINT, USDC];
          const slips = Array.isArray(slippages_bps) && slippages_bps.length ? slippages_bps : [100,200,300];
          const decIn = await getTokenDecimals(token_mint);
          const raw = BigInt(Math.floor(Number(sellUi) * Math.pow(10, decIn)));
          let chosen = null;
          for (const outMint of outMints) {
            for (const s of slips) {
              try {
                const quote = await getQuote({ inputMint: token_mint, outputMint: outMint, amount: String(raw), slippageBps: Number(s) });
                const pi = (quote?.priceImpactPct ?? null);
                if (max_price_impact_pct != null && typeof pi === 'number' && pi > Number(max_price_impact_pct)) continue;
                if (quote?.outAmount) { chosen = { outMint, s, quote }; break; }
              } catch {}
            }
            if (chosen) break;
          }
          if (!chosen) throw new Error('no_route');
          const { outMint, s, quote } = chosen;
          const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: Number(priority_lamports)||10000 });
          const transaction = deserializeTransaction(swapResponse.swapTransaction);
          transaction.sign([keypair]);
          const sig = await conn.sendRawTransaction(transaction.serialize());
          await conn.confirmTransaction(sig, 'confirmed');
          const outUi = quote?.outAmount ? (outMint===SOL_MINT ? formatTokenAmount(quote.outAmount, SOL_DECIMALS) : formatTokenAmount(quote.outAmount, 6)) : null;
          return { tx: sig, detail: { out_mint: outMint, out_amount_ui: outUi, tokens_sold_ui: sellUi, slippage_bps_used: Number(s) } };
        })();
        return { structuredContent: { success: true, tx_hash: out.tx, wallet_id, action:'sell', token_mint, detail: out.detail, solscan_url: `https://solscan.io/tx/${out.tx}` }, content: [{ type:'text', text:`tx=${out.tx}` }] };
      }
      throw new Error('bad_action');
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'trade_failed' }], isError:true };
    }
  });

  // Resources: report files via URI template
  const template = new ResourceTemplate('report://ai-token-analyses/{file}', {
    list: async () => {
      const items = listRecentAnalyses(24);
      return {
        resources: items.map(it => ({
          uri: `report://ai-token-analyses/${it.file}`,
          name: it.file,
          mimeType: 'application/json',
          description: 'Token-AI analysis JSON',
        }))
      };
    },
  });
  server.registerResource('analysis-reports', template, {
    title: 'Analysis Reports',
    description: 'Recent Token-AI analyses',
    mimeType: 'application/json',
  }, async (_uri, vars) => {
    const raw = String(vars?.file || '');
    if (!/^[A-Za-z0-9._-]+\.json$/.test(raw)) {
      throw new Error('bad_name');
    }
    const file = path.join(REPORTS_DIR, raw);
    try { fs.accessSync(file, fs.constants.R_OK); } catch { throw new Error('not_found'); }
    const text = fs.readFileSync(file, 'utf8');
    return {
      contents: [{ uri: `report://ai-token-analyses/${raw}`, mimeType: 'application/json', text }]
    };
  });

  // Deep Research: ensure directories
  try { fs.mkdirSync(RESEARCH_NOTES_DIR, { recursive: true }); } catch {}
  try { fs.mkdirSync(RESEARCH_REPORTS_DIR, { recursive: true }); } catch {}

  // Deep Research resources: notes and reports
  server.registerResource('research-notes', new ResourceTemplate('research://notes/{id}.json', {}), {
    title: 'Research Notes',
    description: 'Saved notes for Deep Research',
    mimeType: 'application/json',
  }, async (_uri, vars) => {
    const id = String(vars?.id||'').replace(/[^A-Za-z0-9_-]/g,'');
    if (!id) throw new Error('bad_id');
    const file = path.join(RESEARCH_NOTES_DIR, `${id}.json`);
    try { fs.accessSync(file, fs.constants.R_OK); } catch { throw new Error('not_found'); }
    const text = fs.readFileSync(file, 'utf8');
    return { contents: [{ uri: `research://notes/${id}.json`, mimeType: 'application/json', text }] };
  });

  server.registerResource('research-reports', new ResourceTemplate('research://deep-research/{file}.json', {}), {
    title: 'Deep Research Reports',
    description: 'Final Deep Research reports with citations',
    mimeType: 'application/json',
  }, async (_uri, vars) => {
    const raw = String(vars?.file||'');
    if (!/^[A-Za-z0-9._-]+$/.test(raw)) throw new Error('bad_name');
    const file = path.join(RESEARCH_REPORTS_DIR, `${raw}.json`);
    try { fs.accessSync(file, fs.constants.R_OK); } catch { throw new Error('not_found'); }
    const text = fs.readFileSync(file, 'utf8');
    return { contents: [{ uri: `research://deep-research/${raw}.json`, mimeType: 'application/json', text }] };
  });

  // Additional resource: by mint
  server.registerResource('analysis-by-mint', new ResourceTemplate('report://ai-token-analyses/by-mint/{mint}', {}), {
    title: 'Analysis by Mint',
    description: 'Fetch analysis by mint address',
    mimeType: 'application/json',
  }, async (_uri, vars) => {
    const mint = String(vars?.mint||'');
    const out = findReportByMint(mint);
    if (!out.file) throw new Error('not_found');
    return { contents: [{ uri: `report://ai-token-analyses/${out.file}`, mimeType: 'application/json', text: JSON.stringify(out.data) }] };
  });

  // Trading preview tools (no on-chain send)
async function getRpcConnection(){
  const url = process.env.SOLANA_RPC_ENDPOINT || (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 'https://api.mainnet-beta.solana.com');
  const { Connection } = await import('@solana/web3.js');
  return new Connection(url);
}

  // Resolve HTTP RPC endpoint (Helius-aware) for custom JSON-RPC calls
  function resolveRpcHttpUrl(){
    const envUrl = process.env.SOLANA_RPC_ENDPOINT;
    if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
    if (process.env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    return 'https://api.mainnet-beta.solana.com';
  }

  // Minimal JSON-RPC caller (fetch-based) used for methods not in web3.js
  async function rpcCall(method, params){
    const url = resolveRpcHttpUrl();
    const fetch = (await import('node-fetch')).default;
    const body = { jsonrpc:'2.0', id:'1', method, params: Array.isArray(params)? params: [] };
    const resp = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (!resp.ok) throw new Error(`rpc_http_${resp.status}`);
    const json = await resp.json();
    if (json.error) throw new Error(json.error?.message || 'rpc_error');
    return json.result;
  }

  // Adaptive priority fee helper (microLamports per CU)
  async function getAdaptivePriorityMicroLamports(fallback = 10000, percentile = 0.9){
    try {
      const res = await rpcCall('getRecentPrioritizationFees', []);
      const arr = Array.isArray(res) ? res : [];
      const fees = arr.map(x => Number(x?.prioritizationFee ?? x?.prioritization_fee ?? x?.fee ?? 0)).filter(f => Number.isFinite(f) && f > 0).sort((a,b)=>a-b);
      if (!fees.length) return fallback;
      const idx = Math.max(0, Math.min(fees.length - 1, Math.floor(percentile * fees.length) - 1));
      return Math.max(fees[idx] || fallback, 1000);
    } catch {
      return fallback;
    }
  }

  async function getTokenDecimals(mint){
    try {
      const conn = await getRpcConnection();
      const { PublicKey } = await import('@solana/web3.js');
      const info = await conn.getParsedAccountInfo(new PublicKey(mint));
      return info.value?.data?.parsed?.info?.decimals || 9;
    } catch { return 9; }
  }

  server.registerTool('execute_buy_preview', {
    title: 'Execute Buy (Preview)',
    description: 'Preview a buy without sending a transaction. Returns expected tokens and price impact.',
    inputSchema: {
      token_mint: z.string(),
      sol_amount: z.number().positive(),
      slippage_bps: z.number().int().optional(),
    },
    outputSchema: {
      preview: z.boolean(),
      action: z.string(),
      token_mint: z.string(),
      sol_spend: z.number(),
      expected_tokens_raw: z.string().nullable(),
      expected_tokens_ui: z.string().nullable(),
      price_impact: z.any().optional(),
    }
  }, async ({ token_mint, sol_amount, slippage_bps }) => {
    try {
      const { SOL_MINT, SOL_DECIMALS, getQuote, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');
      const decimals = await getTokenDecimals(token_mint);
      const lamports = BigInt(Math.floor(Number(sol_amount) * Math.pow(10, SOL_DECIMALS)));
      const quote = await getQuote({ inputMint: SOL_MINT, outputMint: token_mint, amount: String(lamports), slippageBps: Number(slippage_bps)||100 });
      const outRaw = quote?.outAmount || null;
      const outUi = outRaw ? formatTokenAmount(outRaw, decimals) : null;
      return { structuredContent: { preview: true, action: 'buy', token_mint, sol_spend: Number(sol_amount), expected_tokens_raw: outRaw, expected_tokens_ui: outUi, price_impact: quote?.priceImpactPct ?? null }, content: [{ type:'text', text: outUi ? `~${outUi} tokens` : 'no_quote' }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'preview_failed' }], isError: true };
    }
  });

  server.registerTool('execute_sell_preview', {
    title: 'Execute Sell (Preview)',
    description: 'Preview a sell without sending a transaction. Returns expected SOL and price impact.',
    inputSchema: {
      token_mint: z.string(),
      token_amount: z.number().nonnegative(),
      slippage_bps: z.number().int().optional(),
      output_mint: z.string().optional(),
    },
    outputSchema: {
      preview: z.boolean(),
      action: z.string(),
      token_mint: z.string(),
      tokens_sold: z.number(),
      expected_sol_raw: z.string().nullable(),
      expected_sol_ui: z.string().nullable(),
      price_impact: z.any().optional(),
    }
  }, async ({ token_mint, token_amount, slippage_bps, output_mint }) => {
    try {
      const { SOL_MINT, SOL_DECIMALS, getQuote, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');
      const decimals = await getTokenDecimals(token_mint);
      const raw = BigInt(Math.floor(Number(token_amount) * Math.pow(10, decimals)));
      const outMint = String(output_mint || SOL_MINT);
      const quote = await getQuote({ inputMint: token_mint, outputMint: outMint, amount: String(raw), slippageBps: Number(slippage_bps)||100 });
      const outRaw = quote?.outAmount || null;
      const outUi = outRaw ? formatTokenAmount(outRaw, outMint === SOL_MINT ? SOL_DECIMALS : 6) : null;
      return { structuredContent: { preview: true, action: 'sell', token_mint, tokens_sold: Number(token_amount), expected_sol_raw: outRaw, expected_sol_ui: outUi, price_impact: quote?.priceImpactPct ?? null }, content: [{ type:'text', text: outUi ? `~${outUi} SOL` : 'no_quote' }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'preview_failed' }], isError: true };
    }
  });

  // REAL trading tools (on-chain send via Jupiter)
  server.registerTool('execute_buy', {
    title: 'Execute Buy',
    description: 'Execute a token buy order using SOL from a managed wallet (on-chain).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      sol_amount: z.number().positive(),
      slippage_bps: z.number().int().optional(),
      priority_lamports: z.number().int().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string(),
      wallet_address: z.string().nullable(),
      action: z.string(),
      token_mint: z.string(),
      tokens_bought_ui: z.string().nullable(),
      sol_spent_ui: z.string().nullable(),
      price_impact: z.any().optional(),
      solscan_url: z.string().nullable(),
    }
  }, async ({ wallet_id, token_mint, sol_amount, slippage_bps, priority_lamports }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../trade-manager/wallet-utils.js');
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');
      let wid = wallet_id; if (!wid) { const r = resolveWalletForRequest(extra); wid = r.wallet_id; if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      const { keypair, publicKey, wallet } = await loadWallet(wid);
      const lamports = BigInt(Math.floor(Number(sol_amount) * Math.pow(10, SOL_DECIMALS)));
      const quote = await getQuote({ inputMint: SOL_MINT, outputMint: token_mint, amount: String(lamports), slippageBps: Number(slippage_bps)||100 });
      const microLamports = Number(priority_lamports) || await getAdaptivePriorityMicroLamports(10000, 0.9);
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: microLamports });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const serialized = transaction.serialize();
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      const sig = await conn.sendRawTransaction(serialized, { skipPreflight: false, maxRetries: 3 });
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      const decimals = await getTokenDecimals(token_mint);
      const outUi = quote?.outAmount ? formatTokenAmount(quote.outAmount, decimals) : null;
      return {
        structuredContent: {
          success: true,
          tx_hash: sig,
          wallet_id: wid,
          wallet_address: wallet?.public_key || publicKey.toBase58(),
          action: 'buy',
          token_mint,
          tokens_bought_ui: outUi,
          sol_spent_ui: String(sol_amount),
          price_impact: quote?.priceImpactPct ?? null,
          solscan_url: `https://solscan.io/tx/${sig}`
        },
        content: [{ type:'text', text: `tx=${sig}` }]
      };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'buy_failed' }], isError: true };
    }
  });

  server.registerTool('execute_sell', {
    title: 'Execute Sell',
    description: 'Execute a token sell order for SOL from a managed wallet (on-chain).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      token_amount: z.number().nonnegative(),
      slippage_bps: z.number().int().optional(),
      priority_lamports: z.number().int().optional(),
      output_mint: z.string().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string(),
      wallet_address: z.string().nullable(),
      action: z.string(),
      token_mint: z.string(),
      tokens_sold_ui: z.string().nullable(),
      sol_received_ui: z.string().nullable(),
      price_impact: z.any().optional(),
      solscan_url: z.string().nullable(),
    }
  }, async ({ wallet_id, token_mint, token_amount, slippage_bps, priority_lamports, output_mint }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../trade-manager/wallet-utils.js');
      let wid = wallet_id; if (!wid) { const r = resolveWalletForRequest(extra); wid = r.wallet_id; if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');
      const { keypair, publicKey, wallet } = await loadWallet(wid);
      const decimals = await getTokenDecimals(token_mint);
      const raw = BigInt(Math.floor(Number(token_amount) * Math.pow(10, decimals)));
      const outMint = String(output_mint || SOL_MINT);
      const quote = await getQuote({ inputMint: token_mint, outputMint: outMint, amount: String(raw), slippageBps: Number(slippage_bps)||100 });
      const microLamports = Number(priority_lamports) || await getAdaptivePriorityMicroLamports(10000, 0.9);
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: microLamports });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const serialized = transaction.serialize();
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      const sig = await conn.sendRawTransaction(serialized, { skipPreflight: false, maxRetries: 3 });
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      const solUi = quote?.outAmount ? formatTokenAmount(quote.outAmount, outMint === SOL_MINT ? SOL_DECIMALS : 6) : null;
      return {
        structuredContent: {
          success: true,
          tx_hash: sig,
          wallet_id: wid,
          wallet_address: wallet?.public_key || publicKey.toBase58(),
          action: 'sell',
          token_mint,
          tokens_sold_ui: String(token_amount),
          sol_received_ui: solUi,
          price_impact: quote?.priceImpactPct ?? null,
          solscan_url: `https://solscan.io/tx/${sig}`
        },
        content: [{ type:'text', text: `tx=${sig}` }]
      };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'sell_failed' }], isError: true };
    }
  });

  server.registerTool('execute_sell_all', {
    title: 'Execute Sell All',
    description: 'Sell entire token balance for SOL from a managed wallet (on-chain).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      slippage_bps: z.number().int().optional(),
      priority_lamports: z.number().int().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string(),
      wallet_address: z.string().nullable(),
      action: z.string(),
      token_mint: z.string(),
      tokens_sold_ui: z.string().nullable(),
      sol_received_ui: z.string().nullable(),
      price_impact: z.any().optional(),
      solscan_url: z.string().nullable(),
    }
  }, async ({ wallet_id, token_mint, slippage_bps, priority_lamports }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../trade-manager/wallet-utils.js');
      let wid = wallet_id; if (!wid) { const r = resolveWalletForRequest(extra); wid = r.wallet_id; if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');
      const { keypair, publicKey, wallet } = await loadWallet(wid);
      const mintPk = new PublicKey(token_mint);
      const ata = await getAssociatedTokenAddress(mintPk, publicKey);
      const account = await getAccount(conn, ata);
      const balanceRaw = account.amount; // BigInt
      const decimals = await getTokenDecimals(token_mint);
      if (balanceRaw <= 0n) {
        return { structuredContent: { success: false, tx_hash: null, wallet_id: wid, wallet_address: wallet?.public_key || publicKey.toBase58(), action: 'sell_all', token_mint, tokens_sold_ui: '0', sol_received_ui: null, price_impact: null, solscan_url: null }, content: [{ type:'text', text: 'balance=0' }], isError: true };
      }
      const quote = await getQuote({ inputMint: token_mint, outputMint: SOL_MINT, amount: String(balanceRaw), slippageBps: Number(slippage_bps)||100 });
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: Number(priority_lamports)||10000 });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const sig = await conn.sendRawTransaction(transaction.serialize());
      await conn.confirmTransaction(sig, 'confirmed');
      const solUi = quote?.outAmount ? formatTokenAmount(quote.outAmount, SOL_DECIMALS) : null;
      return {
        structuredContent: {
          success: true,
          tx_hash: sig,
          wallet_id: wid,
          wallet_address: wallet?.public_key || publicKey.toBase58(),
          action: 'sell_all',
          token_mint,
          tokens_sold_ui: formatTokenAmount(balanceRaw, decimals),
          sol_received_ui: solUi,
          price_impact: quote?.priceImpactPct ?? null,
          solscan_url: `https://solscan.io/tx/${sig}`
        },
        content: [{ type:'text', text: `tx=${sig}` }]
      };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'sell_all_failed' }], isError: true };
    }
  });

  server.registerTool('execute_sell_all_preview', {
    title: 'Execute Sell All (Preview)',
    description: 'Preview selling entire token balance for a managed wallet (no transaction sent).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      slippage_bps: z.number().int().optional(),
    },
    outputSchema: {
      preview: z.boolean(),
      action: z.string(),
      wallet_id: z.string(),
      token_mint: z.string(),
      tokens_sold_ui: z.string().nullable(),
      expected_sol_raw: z.string().nullable(),
      expected_sol_ui: z.string().nullable(),
      price_impact: z.any().optional(),
    }
  }, async ({ wallet_id, token_mint, slippage_bps }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../trade-manager/wallet-utils.js');
      let wid = wallet_id; if (!wid) { const r = resolveWalletForRequest(extra); wid = r.wallet_id; if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
      const { SOL_MINT, SOL_DECIMALS, getQuote, formatTokenAmount } = await import('../trade-manager/jupiter-api.js');
      const { publicKey } = await loadWallet(wid);
      const mintPk = new PublicKey(token_mint);
      const ata = await getAssociatedTokenAddress(mintPk, publicKey);
      let account; try { account = await getAccount(conn, ata); } catch { account = null; }
      const decimals = await getTokenDecimals(token_mint);
      const balanceRaw = account?.amount ?? 0n;
      if (balanceRaw <= 0n) {
        return { structuredContent: { preview: true, action: 'sell_all', wallet_id: wid, token_mint, tokens_sold_ui: '0', expected_sol_raw: null, expected_sol_ui: null, price_impact: null }, content: [{ type:'text', text: 'balance=0' }] };
      }
      const quote = await getQuote({ inputMint: token_mint, outputMint: SOL_MINT, amount: String(balanceRaw), slippageBps: Number(slippage_bps)||100 });
      const outRaw = quote?.outAmount || null;
      const outUi = outRaw ? formatTokenAmount(outRaw, SOL_DECIMALS) : null;
      return { structuredContent: { preview: true, action: 'sell_all', wallet_id: wid, token_mint, tokens_sold_ui: formatTokenAmount(balanceRaw, decimals), expected_sol_raw: outRaw, expected_sol_ui: outUi, price_impact: quote?.priceImpactPct ?? null }, content: [{ type:'text', text: outUi ? `~${outUi} SOL` : 'no_quote' }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'preview_failed' }], isError: true };
    }
  });

  server.registerTool('list_managed_wallets', {
    title: 'List Managed Wallets',
    description: 'List managed wallets available for trading (IDs and public keys).',
    inputSchema: {
      search: z.string().min(1).optional(),
      query: z.string().optional(),
      q: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
      offset: z.number().int().min(0).optional(),
      include_admin: z.boolean().optional()
    },
    outputSchema: { wallets: z.array(z.object({ id: z.string(), public_key: z.string(), wallet_name: z.string().nullable(), user_id: z.any().nullable() })) }
  }, async ({ search, query, q, limit, offset, include_admin }) => {
    const searchTerm = search ?? query ?? q;
    const take = Math.max(1, Math.min(500, Number(limit) || 100));
    const skip = Math.max(0, Number(offset) || 0);
    // First: query via Prisma directly
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const whereAnd = [ { NOT: { encrypted_private_key: '' } } ];
      if (searchTerm && String(searchTerm).trim()) {
        whereAnd.push({ OR: [
          { label: { contains: String(searchTerm), mode: 'insensitive' } },
          { public_key: { contains: String(searchTerm), mode: 'insensitive' } }
        ]});
      }
      const rows = await prisma.managed_wallets.findMany({
        where: { AND: whereAnd },
        select: { id: true, public_key: true, label: true, ownerId: true, encrypted_private_key: true, owner: { select: { role: true } } },
        orderBy: { id: 'asc' },
        take,
        skip
      });
      const exposeAdmin = include_admin != null ? !!include_admin : (String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1');
      const filtered = rows.filter(w => {
        const isAdmin = !!(w.owner && (w.owner.role === 'admin' || w.owner.role === 'superadmin'));
        if (isAdmin && !exposeAdmin) return false;
        return true;
      }).map(w => ({ id: String(w.id), public_key: w.public_key, wallet_name: w.label, user_id: w.ownerId }));
      // Post-filter search defensively
      const ql = (searchTerm && String(searchTerm).trim()) ? String(searchTerm).trim().toLowerCase() : null;
      const searched = ql ? filtered.filter(w => (
        (w.wallet_name ? String(w.wallet_name).toLowerCase() : '').includes(ql) ||
        (w.public_key ? String(w.public_key).toLowerCase() : '').includes(ql)
      )) : filtered;
      const paged = searched.slice(0, take);
      try { await prisma.$disconnect(); } catch {}
      return { structuredContent: { wallets: paged }, content: [{ type:'text', text: JSON.stringify(paged) }] };
    } catch {}
    // Fallback to wallet-utils if Prisma direct fails
    try {
      if (!process.env.SOLANA_RPC_ENDPOINT && process.env.RPC_URL) process.env.SOLANA_RPC_ENDPOINT = process.env.RPC_URL;
      if (!process.env.RPC_URL && process.env.SOLANA_RPC_ENDPOINT) process.env.RPC_URL = process.env.SOLANA_RPC_ENDPOINT;
      const { listManagedWallets } = await import('../trade-manager/wallet-utils.js');
      const wallets = await listManagedWallets({ includeAdmin: include_admin, search: searchTerm, limit: take, offset: skip });
      // Defensive post-filter & slice
      const ql = (searchTerm && String(searchTerm).trim()) ? String(searchTerm).trim().toLowerCase() : null;
      const searched2 = ql ? wallets.filter(w => (
        (w.wallet_name ? String(w.wallet_name).toLowerCase() : '').includes(ql) ||
        (w.public_key ? String(w.public_key).toLowerCase() : '').includes(ql)
      )) : wallets;
      const paged2 = searched2.slice(0, take);
      return { structuredContent: { wallets: paged2 }, content: [{ type:'text', text: JSON.stringify(paged2) }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'list_failed' }], isError: true };
    }
  });


  return server;
}
