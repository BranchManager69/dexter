#!/usr/bin/env node

// token-ai/index.js

/**
 * AI TRENCHER (beta)
 * 
 * Main entry point for the token-ai agent.
 *   
 *   TODO:  Explain the current architecture and how it works.
 * 
 */

import chalk from 'chalk';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { buildResponsesTools as buildResponsesToolsCore } from './core/tools.js';

// TODO: EVENTUALLY, MIGRATE TO A SELF-CONTAINED REALTIME SUITE
import agentEvents, { AGENT_EVENTS } from '../utils/realtime-suite/agent-events.js';

// URL for posting agent events to the realtime suite
const AGENT_POST_URL = process.env.TOKEN_AI_EVENTS_URL || 'http://localhost:3004/api/agent/events';

// Post agent events to the realtime suite
async function postAgent(event, data){
  try {
    const headers = { 'content-type':'application/json' };
    if (process.env.TOKEN_AI_EVENTS_TOKEN) headers['x-agent-token'] = process.env.TOKEN_AI_EVENTS_TOKEN;
    await fetch(AGENT_POST_URL, { method:'POST', headers, body: JSON.stringify({ event, data }) });
  } catch {}
}

// Emit process events to the realtime suite
function emitProcess(event, data) { 
  return postAgent(event, data); 
}

// ARE THESE USED?
import { createToolExecutor } from './core/exec-tools.js';
import { ANALYSIS_SCHEMA, toMarkdown, extractWebSearchCitations } from './core/format.js';
import { buildSystemPrompt, buildUserMessage, buildFinalizePrompt } from './core/prompts.js';
import prisma from '../config/prisma.js';
import { loadAgentStateStore as loadAgentState, saveAgentStateStore as saveAgentState } from './agents/store.js';
import { buildMemoryDigest, buildScopedDigest, updateStateFromAnalysis, updateStateFromSocials } from './agents/memory.js';
import { updateStateMarket } from './agents/market.js';

dotenv.config();

// Global error handlers for debugging
process.on('unhandledRejection', (reason) => {
  try { console.error('UNHANDLED REJECTION:', reason); } catch {}
});
process.on('uncaughtException', (err) => {
  try { console.error('UNCAUGHT EXCEPTION:', err); } catch {}
});

// Resolve project root and local report directory
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TOKEN_AI_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const REPORTS_BASE = path.join(TOKEN_AI_DIR, 'reports', 'ai-token-analyses');

// Quick diagnostic for API key presence (redacted)
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.length < 10) {
  console.log(chalk.yellow('⚠️  OPENAI_API_KEY appears missing or short. Make sure .env is loaded.'));
} else {
  console.log(chalk.gray('🔐 OPENAI_API_KEY loaded.'));
}

// Ensure reports directory exists
fs.mkdirSync(REPORTS_BASE, { recursive: true });

// Model for the socials orchestrator AI
const MODEL_NAME = 'gpt-5';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Runtime options
const ARGS = process.argv.slice(2);

// Simple flag parser helpers
function getFlagValue(flagName) {
  // supports --flag value and --flag=value
  for (let i = 0; i < ARGS.length; i++) {
    const arg = ARGS[i];
    if (arg === `--${flagName}`) {
      return ARGS[i + 1];
    }
    if (arg.startsWith(`--${flagName}=`)) {
      return arg.split('=')[1];
    }
  }
  return undefined;
}

function getNumberFlag(flagName) {
  const v = getFlagValue(flagName);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function getBoolFlag(flagName, def = false) {
  if (ARGS.includes(`--${flagName}`)) return true;
  if (ARGS.includes(`--no-${flagName}`)) return false;
  const v = getFlagValue(flagName);
  if (v === undefined) return def;
  if (['1','true','yes','on'].includes(String(v).toLowerCase())) return true;
  if (['0','false','no','off'].includes(String(v).toLowerCase())) return false;
  return def;
}

// Reasoning controls
const REASONING_VALID = new Set(['low','medium','high']);
// Global override
const REASONING_LEVEL_RAW = (getFlagValue('reasoning-level') || process.env.TOKEN_AI_REASONING_LEVEL || '').toLowerCase();
const REASONING_OVERRIDE = REASONING_VALID.has(REASONING_LEVEL_RAW) ? REASONING_LEVEL_RAW : '';
// Per‑phase overrides
const INITIAL_REASONING_RAW = (getFlagValue('initial-reasoning') || '').toLowerCase();
const REFINE_REASONING_RAW  = (getFlagValue('refine-reasoning')  || '').toLowerCase();
const FINALIZE_REASONING_RAW= (getFlagValue('finalize-reasoning')|| '').toLowerCase();
const INITIAL_REASONING  = REASONING_VALID.has(INITIAL_REASONING_RAW)  ? INITIAL_REASONING_RAW  : '';
const REFINE_REASONING   = REASONING_VALID.has(REFINE_REASONING_RAW)   ? REFINE_REASONING_RAW   : '';
const FINALIZE_REASONING = REASONING_VALID.has(FINALIZE_REASONING_RAW) ? FINALIZE_REASONING_RAW : '';
// High-level policy
const REASONING_POLICY_RAW = (getFlagValue('reasoning-policy') || process.env.TOKEN_AI_REASONING_POLICY || '').toLowerCase();
const REASONING_POLICY_VALID = new Set(['quick','balanced','thorough']);
const REASONING_POLICY = REASONING_POLICY_VALID.has(REASONING_POLICY_RAW) ? REASONING_POLICY_RAW : '';

function effortFromPolicy(phase){
  // quick: initial=low, refine=low, finalize=medium
  // balanced: initial=medium, refine=medium, finalize=medium
  // thorough: initial=high, refine=medium, finalize=high
  if (!REASONING_POLICY) return '';
  if (REASONING_POLICY === 'quick') {
    if (phase==='initial') return 'low';
    if (phase==='refine') return 'low';
    if (phase==='finalize') return 'medium';
  }
  if (REASONING_POLICY === 'balanced') return 'medium';
  if (REASONING_POLICY === 'thorough') {
    if (phase==='initial') return 'high';
    if (phase==='refine') return 'medium';
    if (phase==='finalize') return 'high';
  }
  return '';
}

function getPhaseReasoningEffort(phase, { toolsInvokedCount, totalToolCalls, reformatAttempted } = {}){
  // Precedence: per‑phase flag > global override > policy mapping > dynamic/defaults
  if (phase==='initial' && INITIAL_REASONING) return INITIAL_REASONING;
  if (phase==='refine'  && REFINE_REASONING)  return REFINE_REASONING;
  if (phase==='finalize'&& FINALIZE_REASONING) return FINALIZE_REASONING;
  if (REASONING_OVERRIDE) return REASONING_OVERRIDE;
  const pol = effortFromPolicy(phase); if (pol) return pol;
  // Fallbacks
  if (phase==='initial') return 'high';
  if (phase==='refine') return 'medium';
  if (phase==='finalize') {
    // Use existing dynamic fallback for finalize
    const valid = new Set(['low','medium','high']);
    const cli = (getFlagValue('finalize-reasoning') || '').toLowerCase();
    const envEff = (process.env.TOKEN_AI_FINALIZE_REASONING || '').toLowerCase();
    if (valid.has(cli)) return cli;
    if (valid.has(envEff)) return envEff;
    if (reformatAttempted) return 'medium';
    if ((toolsInvokedCount || 0) > 3 || (totalToolCalls || 0) > 3) return 'medium';
    return 'low';
  }
  return 'medium';
}

const SKIP_OHLCV = ARGS.includes('--no-ohlcv') || ARGS.includes('--skip-ohlcv') || process.env.SKIP_OHLCV === '1' || process.env.ANALYZER_SKIP_OHLCV === '1';
const CLI_ENABLE_OHLCV = getBoolFlag('ohlcv', false);
const CLI_OHLCV_HOURS = getNumberFlag('hours') ?? (process.env.ANALYZER_OHLCV_HOURS ? Number(process.env.ANALYZER_OHLCV_HOURS) : undefined);
const CLI_OHLCV_INTERVAL = getNumberFlag('interval') ?? (process.env.ANALYZER_OHLCV_INTERVAL ? Number(process.env.ANALYZER_OHLCV_INTERVAL) : undefined);
const FAST_OHLCV_PROVIDER = (getFlagValue('fast-ohlcv') || process.env.FAST_OHLCV_PROVIDER || (process.env.BIRDEYE_API_KEY ? 'birdeye' : '')).toLowerCase();
const DEFAULT_FAST_OHLCV_HOURS = getNumberFlag('fast-hours') ?? (process.env.ANALYZER_FAST_OHLCV_HOURS ? Number(process.env.ANALYZER_FAST_OHLCV_HOURS) : 6);
const EXACT_OHLCV = getBoolFlag('exact-ohlcv', false);

if (SKIP_OHLCV) {
  console.log(chalk.yellow('⚠️  OHLCV tool disabled for this run (flag/env).'));
} else if (FAST_OHLCV_PROVIDER === 'birdeye' && process.env.BIRDEYE_API_KEY) {
  console.log(chalk.gray('ℹ️  OHLCV fast mode via Birdeye is enabled by default.'));
} else if (!CLI_ENABLE_OHLCV && !(CLI_OHLCV_HOURS || CLI_OHLCV_INTERVAL)) {
  console.log(chalk.gray('ℹ️  OHLCV preference: enabled only when warranted. Use --ohlcv to include immediately.'));
}

if (CLI_OHLCV_HOURS || CLI_OHLCV_INTERVAL) {
  console.log(chalk.gray(`ℹ️  OHLCV overrides: hours=${CLI_OHLCV_HOURS ?? '(default)'} interval=${CLI_OHLCV_INTERVAL ?? '(default)'} (CLI/env)`));
}

// Flags and defaults
// Max assistant turns (rounds): CLI flag > env > default(20)
const MAX_ROUNDS = (() => {
  const cli = getNumberFlag('max-rounds');
  if (typeof cli === 'number' && Number.isFinite(cli) && cli > 0) return cli;
  const envRounds = process.env.TOKEN_AI_MAX_ROUNDS ? Number(process.env.TOKEN_AI_MAX_ROUNDS) : NaN;
  if (Number.isFinite(envRounds) && envRounds > 0) return envRounds;
  return 20;
})();

const ENABLE_MARKDOWN = getBoolFlag('markdown', false);
const ENABLE_STREAM = getBoolFlag('stream', false);
const ENABLE_WEB_SEARCH = getBoolFlag('web-search', true);
const ENABLE_CODE_INTERPRETER = getBoolFlag('code-interpreter', true);
const ENABLE_PARALLEL_TOOLS = (getBoolFlag('parallel-tools', false) || process.env.TOKEN_AI_PARALLEL_TOOLS === '1');
// Auto-continue guard to ingest tool outputs before finalize (prevents call_id mismatch)
const AUTO_CONTINUE_OUTPUTS = getBoolFlag('auto-continue', true) && (process.env.TOKEN_AI_AUTO_CONTINUE_TOOL_OUTPUTS !== '0');
// Enforce OHLCV prior to finalize unless explicitly disabled (best-practice: always include price context)
const FORCE_OHLCV = (process.env.ANALYZER_FORCE_OHLCV === '1') || getBoolFlag('force-ohlcv', true);

// Finalize reasoning effort: CLI > env > dynamic default('low')
function getFinalizeReasoningEffort(ctx){ return getPhaseReasoningEffort('finalize', ctx); }

const CACHE_TTL_MIN = getNumberFlag('cache-ttl') ?? (process.env.TOKEN_AI_CACHE_TTL_MIN ? Number(process.env.TOKEN_AI_CACHE_TTL_MIN) : 0);
const QUIET_STREAM = getBoolFlag('quiet-stream', false) || process.env.QUIET_STREAM === '1';
const ENABLE_AGENT_MEMORY = getBoolFlag('agent-memory', true) || process.env.TOKEN_AI_AGENT_MEMORY === '1';
// Prompt fragment flags/env
const PROMPT_VOICE = getFlagValue('voice') || process.env.TOKEN_AI_VOICE || '';
const PROMPT_DOMAIN = getFlagValue('domain') || process.env.TOKEN_AI_DOMAIN || '';
const PROMPT_OVERRIDES = getFlagValue('overrides') || process.env.TOKEN_AI_OVERRIDES || '';
const PROMPT_PRIVATE = getFlagValue('private') || process.env.TOKEN_AI_PRIVATE || '';
const DIGEST_CHARS_SHORT = getNumberFlag('agent-digest-chars') ?? (process.env.TOKEN_AI_AGENT_DIGEST_CHARS ? Number(process.env.TOKEN_AI_AGENT_DIGEST_CHARS) : 4000);
const DIGEST_CHARS_LONG = getNumberFlag('agent-digest-chars-final') ?? (process.env.TOKEN_AI_AGENT_DIGEST_CHARS_FINAL ? Number(process.env.TOKEN_AI_AGENT_DIGEST_CHARS_FINAL) : 8000);
const DIGEST_SCOPE_INITIAL = getFlagValue('agent-digest-scope-initial') || process.env.TOKEN_AI_AGENT_DIGEST_SCOPE_INITIAL || 'general';
const DIGEST_SCOPE_FINAL = getFlagValue('agent-digest-scope-final') || process.env.TOKEN_AI_AGENT_DIGEST_SCOPE_FINAL || 'full';

/** Build Responses API tool list via core module */
function buildResponsesTools({ includeWebSearch, includeCodeInterpreter, includeOHLCV } = { includeWebSearch: ENABLE_WEB_SEARCH, includeCodeInterpreter: ENABLE_CODE_INTERPRETER, includeOHLCV: true }) {
  return buildResponsesToolsCore({ includeWebSearch, includeCodeInterpreter, includeOHLCV });
}

/** Heuristic: enable web search next round for verification/context */
function shouldEnableWebSearchFromResults(resultsMap) {
  try {
    const socials = resultsMap['socials_orchestrate'];
    // If no socials yet, still allow web search to establish context
    if (!socials) return true;

    // Signals present → enable to verify/corroborate claims and check memetic popularity
    const hasWebsite = !!socials.website || (Array.isArray(socials.websites_from_db) && socials.websites_from_db.length > 0);
    const hasTwitter = !!socials.twitter;
    const hasTelegram = !!socials.telegram;
    const hasMarket = !!(socials.market && (socials.market.fdv || socials.market.liquidity || socials.market.vol24h || socials.market.vol1h));
    const hasDiscovered = Array.isArray(socials.discovered_official_links) && socials.discovered_official_links.length > 0;

    // New policy: favor enabling search for verification/popularity checks when we have any social/market signal,
    // and also when we have none (to resolve ambiguity on names/terms). Only suppress if explicitly disabled elsewhere.
    if (hasWebsite || hasTwitter || hasTelegram || hasMarket || hasDiscovered) return true;
    return true; // fallback: still allow to investigate proper nouns/trends
  } catch { return true; }
}

// (extractWebSearchCitations moved to core/format.js)

/** Parse NEED_OHLCV(hours, interval) trigger from assistant text */
function parseOHLCVRequestFromText(text) {
  try {
    if (!text) return null;
    const m = text.match(/NEED_OHLCV\s*\(\s*(\d+)?\s*,?\s*(\d+)?\s*\)/i);
    if (!m) return null;
    const hours = m[1] ? Number(m[1]) : (CLI_OHLCV_HOURS ?? 1);
    const interval = m[2] ? Number(m[2]) : (CLI_OHLCV_INTERVAL ?? 1);
    return { hours_back: Math.min(Math.max(hours,1),6), interval_minutes: Math.min(Math.max(interval,1),60) };
  } catch { return null; }
}

/** Simple cache helpers */

// (legacy executeTool and cache helpers removed; core/exec-tools.js is the source of truth)

const CACHE_DIR = '/tmp/ai-token-cache';

function ensureCacheDir() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
}

function cachePath(key) { 
  return path.join(CACHE_DIR, key); 
}

function withCache(key, ttlMs, fn) {
  ensureCacheDir();
  const p = cachePath(key);
  if (ttlMs > 0 && fs.existsSync(p)) {
    const age = Date.now() - fs.statSync(p).mtimeMs;
    if (age <= ttlMs) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
    }
  }
  const result = fn();
  try { fs.writeFileSync(p, JSON.stringify(result)); } catch {}
  return result;
}

/** Fast OHLCV via Birdeye (requires BIRDEYE_API_KEY) */
async function fetchBirdeyeOHLCV(mint, hours, interval) {
  try {
    const key = process.env.BIRDEYE_API_KEY;
    if (!key) return null;
    const now = Math.floor(Date.now()/1000);
    const from = now - (hours*3600);
    const type = interval <= 1 ? '1m' : (interval <= 5 ? '5m' : '15m');
    const url = `https://public-api.birdeye.so/defi/v3/ohlcv?address=${encodeURIComponent(mint)}&type=${encodeURIComponent(type)}&currency=native&time_from=${from}&time_to=${now}&ui_amount_mode=both&mode=range`;
    const resp = await fetch(url, { headers: { 'X-API-KEY': key, 'accept': 'application/json', 'x-chain': 'solana' }, timeout: 20000 });
    if (!resp.ok) {
      const text = await resp.text();
      console.log(chalk.yellow(`    Birdeye HTTP ${resp.status}: ${text.slice(0,200)}`));
      return null;
    }
    const json = await resp.json();
    const items = json.data?.items || [];
    const ohlcv = items.map(it => ({ t: it.unix_time || it.time || 0, o: it.o, h: it.h, l: it.l, c: it.c, v: it.v, v_usd: it.v_usd })).filter(x => x.t && x.c != null);
    return { mint, hours_back: hours, interval_minutes: interval, ohlcv };
  } catch (e) {
    console.log(chalk.yellow(`    Birdeye fetch error: ${e?.message}`));
    return null;
  }
}

async function fetchBirdeyeOHLCVRange(mint, time_from, time_to, interval) {
  try {
    const key = process.env.BIRDEYE_API_KEY;
    if (!key) return null;
    const type = interval <= 1 ? '1m' : (interval <= 5 ? '5m' : '15m');
    const url = `https://public-api.birdeye.so/defi/v3/ohlcv?address=${encodeURIComponent(mint)}&type=${encodeURIComponent(type)}&currency=native&time_from=${time_from}&time_to=${time_to}&ui_amount_mode=both&mode=range`;
    const resp = await fetch(url, { headers: { 'X-API-KEY': key, 'accept': 'application/json', 'x-chain': 'solana' }, timeout: 20000 });
    if (!resp.ok) {
      const text = await resp.text();
      console.log(chalk.yellow(`    Birdeye HTTP ${resp.status}: ${text.slice(0,200)}`));
      return null;
    }
    const json = await resp.json();
    const items = json.data?.items || [];
    const ohlcv = items.map(it => ({ t: it.unix_time || it.time || 0, o: it.o, h: it.h, l: it.l, c: it.c, v: it.v, v_usd: it.v_usd })).filter(x => x.t && x.c != null);
    return { mint, time_from, time_to, interval_minutes: interval, ohlcv };
  } catch (e) {
    console.log(chalk.yellow(`    Birdeye fetch error: ${e?.message}`));
    return null;
  }
}

// (ANALYSIS_SCHEMA and toMarkdown moved to core/format.js)

// Pick media images from orchestrator results for model vision (urls or inline)
function pickMediaImagesFromResults(resultsMap, max = 4) {
  try {
    const out = [];
    const seen = new Set();
    const IMAGE_MODE = (process.env.TOKEN_AI_IMAGE_MODE || 'url').toLowerCase();
    const soc = resultsMap && resultsMap['socials_orchestrate'];
    // Simple spam heuristic: detect promo/service posts and skip them first.
    const isLikelySpamTweet = (tw) => {
      try {
        const txt = (tw?.text || '').toLowerCase();
        const handle = (tw?.author?.handle || '').toLowerCase();
        let score = 0;
        const inc = () => (score += 1);
        // Patterns suggesting paid promotion/services rather than organic content
        if (/\bpromo(tion)?\b|\bmarketing\b|\bpaid\s*(post|promo)\b/.test(txt)) inc();
        if (/\bdm\b|\bcontact\b|\binbox\b|\breach\s?out\b/.test(txt)) inc();
        if (/\bsignals?\b|\bcall\s*channel\b|\balpha\s*calls?\b/.test(txt)) inc();
        if (/\bpump\s*(tool|group)?\b/.test(txt)) inc();
        if (/\bfollowers?\b|\blikes?\b/.test(txt) && /\bbuy|sell|get\b/.test(txt)) inc();
        // Suspicious servicey handles
        if (/promo|marketing|growth|signals?/.test(handle)) inc();
        // Suspicious card domains
        try {
          for (const c of (tw?.media?.cards || [])) {
            const u = c?.url || '';
            if (u) {
              const host = new URL(u).host.toLowerCase();
              if (/(bit\.ly|linktree|linktr\.ee|cutt\.ly|tinyurl\.com)/.test(host)) inc();
            }
          }
        } catch {}
        return score >= 2; // conservative: need at least 2 hits to label spam
      } catch { return false; }
    };
    if (soc && soc.twitter && Array.isArray(soc.twitter.recentTweets)) {
      // First pass: prefer non-spam tweets
      const passes = [
        soc.twitter.recentTweets.filter(tw => !isLikelySpamTweet(tw)),
        soc.twitter.recentTweets // fallback to all if we still need more
      ];
      for (const bucket of passes) {
        for (const tw of bucket) {
          if (tw?.media?.photos) {
            for (const p of tw.media.photos) {
              if (IMAGE_MODE === 'inline' && p?.local_path) {
                try {
                  const buf = fs.readFileSync(p.local_path);
                  const ext = (p.local_path.split('.').pop() || '').toLowerCase();
                  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
                  out.push({ type: 'inline', data: buf.toString('base64'), mime });
                  if (out.length >= max) return out;
                } catch {}
              } else if (p?.url && /^https?:\/\//i.test(p.url)) {
                if (!seen.has(p.url)) { seen.add(p.url); out.push({ type: 'url', url: p.url }); if (out.length >= max) return out; }
              }
            }
          }
          if (tw?.media?.cards) {
            for (const c of tw.media.cards) {
              if (IMAGE_MODE === 'inline' && c?.local_image) {
                try {
                  const buf = fs.readFileSync(c.local_image);
                  const ext = (c.local_image.split('.').pop() || '').toLowerCase();
                  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
                  out.push({ type: 'inline', data: buf.toString('base64'), mime });
                  if (out.length >= max) return out;
                } catch {}
              } else if (c?.image && /^https?:\/\//i.test(c.image)) {
                if (!seen.has(c.image)) { seen.add(c.image); out.push({ type: 'url', url: c.image }); if (out.length >= max) return out; }
              }
            }
          }
        }
      }
    }
    return out.slice(0, max);
  } catch { return []; }
}

/**
 * Load website extraction data (unchanged logic)
 */
async function loadWebsiteData() {
  // Look for any recent extraction files
  const files = fs.readdirSync('/tmp').filter(f => f.startsWith('website-extraction-') && f.endsWith('.json'));
  
  if (files.length > 0) {
    // Sort by timestamp and get the most recent
    files.sort((a, b) => {
      const timeA = parseInt(a.match(/(\d+)\.json$/)?.[1] || '0');
      const timeB = parseInt(b.match(/(\d+)\.json$/)?.[1] || '0');
      return timeB - timeA;
    });
    
    const mostRecent = `/tmp/${files[0]}`;
    console.log(chalk.green('✓ Found recent website extraction:'), chalk.gray(files[0]));
    return JSON.parse(fs.readFileSync(mostRecent, 'utf8'));
  }
  
  // Otherwise, run the extraction script
  console.log(chalk.yellow('⚠️  No recent extraction found, running extraction script...'));
  const { execSync } = await import('child_process');
  
  try {
    execSync(`node scripts/test-website-extraction.js`, { 
      stdio: 'inherit',
      cwd: PROJECT_ROOT
    });
    
    // Try to load again
    const newFiles = fs.readdirSync('/tmp').filter(f => f.startsWith('website-extraction-') && f.endsWith('.json'));
    if (newFiles.length > 0) {
      newFiles.sort((a, b) => {
        const timeA = parseInt(a.match(/(\d+)\.json$/)?.[1] || '0');
        const timeB = parseInt(b.match(/(\d+)\.json$/)?.[1] || '0');
        return timeB - timeA;
      });
      const mostRecent = `/tmp/${newFiles[0]}`;
      return JSON.parse(fs.readFileSync(mostRecent, 'utf8'));
    }
  } catch (error) {
    console.error(chalk.red('Failed to run extraction script:'), error);
  }
  
  return null;
}

/**
 * Main BranchMAInager Agent Analyzer using Responses API
 */
async function analyzeWithGPT5Agent(tokenAddress) {
  try { const payload={ mint: tokenAddress, started_at: new Date().toISOString(), model: MODEL_NAME }; agentEvents.sessionStart(payload); postAgent(AGENT_EVENTS.SESSION_START, payload); emitProcess('process:step_start', { mint: tokenAddress, step: 'bootstrap', at: new Date().toISOString() }); } catch {}
  console.log(chalk.cyan.bold('\n🤖 Initializing BranchMAInager Analysis...'));
  console.log(chalk.gray(`  Model: ${MODEL_NAME}`));
  console.log(chalk.gray(`  API: Responses API`));
  console.log(chalk.gray(`  Reasoning effort: high\n`));
  
  try {
    console.log(chalk.gray('🧭 Preparing prompts and request payload...'));
    // Prepare prompts using core builders
    // Load per-token agent state and build a compact digest for context (optional)
    let agentState = null;
    let agentDigest = '';
    if (ENABLE_AGENT_MEMORY) {
      try {
        agentState = await loadAgentState(tokenAddress);
        // Scoped short digest for initial round
      agentDigest = buildScopedDigest(agentState, DIGEST_SCOPE_INITIAL, Math.max(500, DIGEST_CHARS_SHORT));
      if (agentDigest) {
        // Log full digest for maximum observability
        try { if (!QUIET_STREAM) { console.log(chalk.gray(`🧠 Injecting agent memory digest (${agentDigest.length} chars):`)); console.log(agentDigest); } } catch {}
        // Emit full digest to UI (panel shows it in a context section)
        try { postAgent('agent:memory', { mint: tokenAddress, scope: DIGEST_SCOPE_INITIAL, length: agentDigest.length, text: agentDigest }); } catch {}
      }
      } catch {}
    }

    // Fetch SOL price and market context
    let solPrice = null;
    let solContext = {};
    try {
      const solPriceResponse = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
      const solData = await solPriceResponse.json();
      if (solData?.pairs?.[0]) {
        const pair = solData.pairs[0];
        solPrice = parseFloat(pair.priceUsd).toFixed(2);
        
        // Calculate 24h change and trend
        if (pair.priceChange?.h24) {
          solContext.change24h = parseFloat(pair.priceChange.h24);
          if (Math.abs(solContext.change24h) > 5) {
            solContext.trend = solContext.change24h > 0 ? 'Strong pump' : 'Heavy dump';
          } else if (Math.abs(solContext.change24h) > 2) {
            solContext.trend = solContext.change24h > 0 ? 'Bullish' : 'Bearish';
          } else {
            solContext.trend = 'Chopping/Crabbing';
          }
        }
        
        console.log(chalk.gray(`📊 SOL: $${solPrice} (24h: ${solContext.change24h > 0 ? '+' : ''}${solContext.change24h?.toFixed(2) || '?'}%)`));
      }
    } catch (e) {
      console.log(chalk.gray('⚠️  Could not fetch SOL price for context'));
    }

    const systemPrompt = buildSystemPrompt({
      skipOhlcv: SKIP_OHLCV,
      agentMemoryText: agentDigest,
      voice: PROMPT_VOICE,
      domain: PROMPT_DOMAIN,
      overrides: PROMPT_OVERRIDES,
      privateFile: PROMPT_PRIVATE
    });
    const userMessage = buildUserMessage({ 
      tokenAddress, 
      skipOhlcv: SKIP_OHLCV, 
      solPrice,
      solContext 
    });

    console.log(chalk.blue('📡 Using BranchMAInager via Responses API...'));

    // Initial call: include code interpreter, but gate web search until warranted
    let webSearchIncluded = false; // Start with socials; enable web search next round if warranted
    // Include OHLCV in round 1 by default when fast provider is available, unless explicitly disabled
    // Always include OHLCV tool unless explicitly skipped; provider selection is handled at execution time
    const includeOHLCVInitial = (!SKIP_OHLCV);
    let ohlcvIncluded = includeOHLCVInitial;
    const tools = buildResponsesTools({ includeWebSearch: false, includeCodeInterpreter: true, includeOHLCV: ohlcvIncluded });
    console.log(chalk.gray(`🧰 Tools configured: ${tools.length}`));
    const toolExecutor = createToolExecutor({
      PROJECT_ROOT,
      CACHE_TTL_MIN,
      SKIP_OHLCV,
      CLI_OHLCV_INTERVAL,
      FAST_OHLCV_PROVIDER,
      CACHE_DIR: '/tmp/ai-token-cache'
    });
    const timings = { total_ms: 0, socials_ms: 0, ohlcv_ms: 0, llm_round1_ms: 0, llm_round2_ms: 0 };
    // Track function_call IDs per finalize response to ensure we attach outputs for all
    // Note: retained for observability only; finalization is now pure (no tools),
    // so this map is effectively unused and may be removed later.
    const expectedCallsByResponse = new Map(); // responseId -> Set(call_id)
    let lastFinalizeId = null;
    const t0 = Date.now();
    const t_llm1_start = Date.now();
  console.log(chalk.gray('➡️  Sending initial Responses API request (streaming)...'));
    // Quick market fetch (DexScreener) to populate UI immediately while heavy socials scrape runs
    try {
      const mod = await import('./socials/tools/market.js');
      if (mod?.fetch_market_overview) {
        const quick = await mod.fetch_market_overview(tokenAddress);
        if (quick?.success) {
          try {
            emitProcess('metrics:update', { mint: tokenAddress, price: quick.price ?? null, fdv: quick.fdv ?? null, liquidity: quick.liquidity ?? null, volume24h: quick.vol24h ?? null, updated_at: new Date().toISOString() });
          } catch {}
          try {
            const bt = quick.top_pool?.baseToken || {};
            if (bt?.name || bt?.symbol) {
              emitProcess('token:meta', { mint: tokenAddress, name: bt.name || null, symbol: bt.symbol || null, address: tokenAddress });
            }
          } catch {}
        }
      }
    } catch {}
    try {
      const p={ mint: tokenAddress, at: new Date().toISOString(), text: 'llm_round1_start' };
      agentEvents.status(p); postAgent(AGENT_EVENTS.STATUS, p);
      emitProcess('process:step_end',   { mint: tokenAddress, step: 'bootstrap', ok: true, at: new Date().toISOString() });
      emitProcess('process:step_start', { mint: tokenAddress, step: 'socials',   at: new Date().toISOString() });
    } catch {}
    const openaiStream = await openai.responses.create({
      model: MODEL_NAME,
      instructions: systemPrompt,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: userMessage }]
        }
      ],
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: ENABLE_PARALLEL_TOOLS,
      reasoning: { effort: getPhaseReasoningEffort('initial') },
      stream: true
    });

    // Event normalization function to handle both function_call and mcp_call events
    function normalizeEventType(event) {
      // MCP call events -> function call events
      if (event.type === 'response.mcp_call_arguments.delta' || 
          event.type === 'response.mcp_call.arguments.delta') {
        return { ...event, type: 'response.function_call_arguments.delta', callType: 'mcp' };
      }
      if (event.type === 'response.output_item.added' && event.item?.type === 'mcp_call') {
        return { 
          ...event, 
          item: { ...event.item, type: 'function_call' },
          callType: 'mcp'
        };
      }
      if (event.type === 'response.output_item.done' && event.item?.type === 'mcp_call') {
        return { 
          ...event, 
          item: { ...event.item, type: 'function_call' },
          callType: 'mcp'
        };
      }
      // Pass through regular events
      return event;
    }

    // Collect streamed items
    let collectedText = '';
    const collectedCalls = [];
    let currentCallId = null;
    let currentCallName = null;
    let currentArgs = '';
    let responseId = null;
    // Track the response that produced the current set of function calls in `response.output`
    let callsSourceId = null;

    let startedPrint1 = false;
    // Buffer streaming output to coalesce into sentence-ish chunks for logs/UI
    let streamBuf = '';
    let streamTimer = null;
    const STREAM_MAX_MS = Number(process.env.TOKEN_AI_STREAM_FLUSH_MS || 350);
    const STREAM_MAX_CHARS = Number(process.env.TOKEN_AI_STREAM_MAX_CHARS || 400);
    const writeStreamChunk = (text) => {
      if (!text) return;
      if (!QUIET_STREAM) { try { process.stdout.write(text); } catch { console.log(text); } }
      try { const p = { mint: tokenAddress, at: new Date().toISOString(), text }; agentEvents.partialOutput(p); postAgent(AGENT_EVENTS.PARTIAL_OUTPUT, p); } catch {}
    };
    const flushStreamBuf = (force = false) => {
      if (!streamBuf) return;
      if (!force) {
        const nIdx = streamBuf.lastIndexOf('\n');
        const pIdx = Math.max(streamBuf.lastIndexOf('. '), streamBuf.lastIndexOf('! '), streamBuf.lastIndexOf('? '));
        const cut = Math.max(nIdx, pIdx);
        if (cut >= 0) {
          const out = streamBuf.slice(0, cut + 1); streamBuf = streamBuf.slice(cut + 1);
          writeStreamChunk(out);
          return;
        }
        if (streamBuf.length >= STREAM_MAX_CHARS) { writeStreamChunk(streamBuf); streamBuf = ''; return; }
        return; // wait for more
      }
      // Force flush any remainder
      const out = streamBuf; streamBuf = ''; writeStreamChunk(out);
    };
    const scheduleFlush = () => { try { if (streamTimer) clearTimeout(streamTimer); } catch {}; streamTimer = setTimeout(() => flushStreamBuf(true), STREAM_MAX_MS); };
    for await (const rawEvent of openaiStream) {
      // Normalize event types to handle both function_call and mcp_call uniformly
      const event = normalizeEventType(rawEvent);
      
      if (event.type === 'response.created') {
        responseId = event.response?.id || responseId;
        // For the initial stream, this response is also the source of the function calls
        callsSourceId = responseId || callsSourceId;
        if (!QUIET_STREAM) console.log(chalk.gray('   • stream: response.created'), responseId || '');
      } else if (event.type === 'response.error') {
        console.log(chalk.red('   • stream error:'), event.error);
      } else if (event.type === 'response.output_text.delta') {
        const d = event.delta || '';
        collectedText += d;
        if (d) {
          if (!startedPrint1 && !QUIET_STREAM) {
            console.log(chalk.gray('--- Streaming assistant output ---'));
            startedPrint1 = true;
          }
          streamBuf += d;
          // Try boundary-aware flush; if nothing to flush yet, schedule a forced flush
          flushStreamBuf(false);
          scheduleFlush();
        }
      } else if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
        // Start of a function call (could be regular function_call or normalized mcp_call)
        currentCallId = event.item.call_id;
        currentCallName = event.item.name;
        currentArgs = '';
        const callLabel = event.callType === 'mcp' ? 'mcp_call' : 'tool_call';
        if (!QUIET_STREAM) console.log(chalk.yellow(`   • ${callLabel} start: ${currentCallName} (${currentCallId})`));
        try {
          const p={ mint: tokenAddress, at: new Date().toISOString(), name: currentCallName };
          agentEvents.toolCall(p); postAgent(AGENT_EVENTS.TOOL_CALL, p);
          if (currentCallName === 'analyze_token_ohlcv' || currentCallName === 'analyze_token_ohlcv_range') {
            emitProcess('process:step_start', { mint: tokenAddress, step: 'market', at: new Date().toISOString() });
          }
        } catch {}
      } else if (event.type === 'response.function_call_arguments.delta') {
        // Accumulate args silently (no noisy delta counts)
        currentArgs += event.delta || '';
      } else if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
        // Finalize the function call
        collectedCalls.push({
          type: 'function_call',
          call_id: currentCallId,
          name: currentCallName,
          arguments: currentArgs || event.item.arguments || '{}'
        });
        const callLabel = event.callType === 'mcp' ? 'mcp_call' : 'tool_call';
        if (!QUIET_STREAM) console.log(chalk.yellow(`   • ${callLabel} done: ${currentCallName} (${currentCallId})`));
        currentCallId = null;
        currentCallName = null;
        currentArgs = '';
      } else if (event.type === 'response.completed') {
        if (startedPrint1 && !QUIET_STREAM) console.log();
        if (!QUIET_STREAM) console.log(chalk.gray('   • stream: response.completed'));
        // Final flush of any buffered narrative
        try { flushStreamBuf(true); } catch {}
      }
    }

    timings.llm_round1_ms = Date.now() - t_llm1_start;
    // Retrieve the merged server view for the initial turn (includes hosted tool items)
    const full1 = responseId ? await openai.responses.retrieve(responseId) : null;
    // Prefer canonical server function_call IDs over locally streamed ones (avoids call_id mismatches)
    let canonInitCalls = [];
    try {
      const out = Array.isArray(full1?.output) ? full1.output : [];
      for (const item of out) {
        if (item?.type === 'function_call') canonInitCalls.push({ type:'function_call', call_id:item.call_id, name:item.name, arguments:item.arguments||'{}' });
      }
    } catch {}
    const chosenInitCalls = (canonInitCalls && canonInitCalls.length) ? canonInitCalls : collectedCalls;
    let response = { output_text: collectedText, output: chosenInitCalls };
    console.log(chalk.gray(`⬅️  Initial stream closed in ${timings.llm_round1_ms}ms; function calls: ${collectedCalls.length}`));
    try { const p={ mint: tokenAddress, at: new Date().toISOString(), text: 'llm_round1_done', llm_ms: timings.llm_round1_ms }; agentEvents.status(p); postAgent(AGENT_EVENTS.STATUS, p);} catch {}

    let rounds = 0;
    let totalToolCalls = 0;
    const toolsInvoked = {};
    const resultsMap = {};
    const inRunMemo = new Map();
    let lastOHLCVResult = null;
    let orchestratorReportPath = '';
    let imageAttachCount = 0; let imageAttachMode = ''; let imageAttachUrls = [];
    // Track decoupled image continuation so we don't loop images-only repeatedly for same source
    const imagesContinuationDoneFor = new Set(); // keys: responseId that produced current function calls
    // Accumulate tool outputs across rounds so finalize can always attach evidence
    const outputsAccumMap = new Map(); // call_id -> output record
    const addAccum = (arr=[]) => { try { for (const it of arr) if (it && it.call_id) outputsAccumMap.set(it.call_id, it); } catch {} };
    const getAccumOutputs = () => Array.from(outputsAccumMap.values());
    // Track the response id that emitted the most recent tool calls and whether we've auto-continued
    let lastToolsResponseId = null;
    let didAutoContinueOutputs = false;
    while (rounds < MAX_ROUNDS) {
      // Freeze the source response id that produced the current functionCalls for this round
      const sourceIdForRound = callsSourceId;
      const functionCalls = (response.output || []).filter(i => i.type === 'function_call');
      // Track expected call_ids for this response id so we can attach only matching outputs during finalize
      try {
        const set = new Set(functionCalls.map(fc => fc.call_id).filter(Boolean));
        if (sourceIdForRound && set.size) expectedCallsByResponse.set(sourceIdForRound, set);
      } catch {}
      try {
        if (!QUIET_STREAM) {
          const ids = functionCalls.map(fc => fc.call_id).filter(Boolean).join(', ');
          console.log(chalk.gray(`   • pending function_call ids from ${sourceIdForRound || '(unknown)'}: ${ids || '(none)'}`));
        }
      } catch {}
      // If no function calls, either enable OHLCV via trigger, or consider an images-only continuation, else finalize
      if (!functionCalls.length) {
        // Check for OHLCV trigger request first
        if (!SKIP_OHLCV && !ohlcvIncluded) {
          const need = parseOHLCVRequestFromText(response.output_text);
          if (need) {
            console.log(chalk.yellow('📈 OHLCV requested by model via trigger (non-stream)…'));
            const prompt = `OHLCV tool is now available. If you still need it, call analyze_token_ohlcv_range with an explicit time range and interval_minutes=${need.interval_minutes}.`;
            const nextTools = buildResponsesTools({ includeWebSearch: webSearchIncluded, includeCodeInterpreter: true, includeOHLCV: true });
            ohlcvIncluded = true;
            // Continue the same session with updated tools available (non-stream to capture function_call immediately)
            const cont = await openai.responses.create({
              model: MODEL_NAME,
              previous_response_id: responseId || callsSourceId || undefined,
              instructions: systemPrompt,
              input: [ { role: 'user', content: [{ type: 'input_text', text: prompt }] } ],
              tools: nextTools,
              tool_choice: 'auto',
              parallel_tool_calls: ENABLE_PARALLEL_TOOLS,
              stream: false
            });
            try {
              const outArr = Array.isArray(cont?.output) ? cont.output : [];
              const fc = outArr.filter(i => i?.type === 'function_call');
              console.log(chalk.gray(`   • OHLCV trigger issued → calls observed: ${fc.length}`));
            } catch {}
            response = cont;
            try { if (cont?.id) { responseId = cont.id; callsSourceId = cont.id; } } catch {}
            rounds++;
            continue;
          }
        }
        // Enforce OHLCV before finalize if required and not yet fetched
        if (!SKIP_OHLCV && FORCE_OHLCV && !lastOHLCVResult) {
          try {
            const nowSec = Math.floor(Date.now() / 1000);
            const sixHours = 6 * 3600;
            const sevenDays = 7 * 24 * 3600;
            const tf6h = nowSec - sixHours;
            const tf7d = nowSec - sevenDays;
            const demand = `You MUST fetch OHLCV before any finalization. Call analyze_token_ohlcv_range twice for comprehensive context: (1) 6h window @1m: time_from=${tf6h}, time_to=${nowSec}, interval_minutes=1; (2) 7d window @15m: time_from=${tf7d}, time_to=${nowSec}, interval_minutes=15.`;
            const nextTools = buildResponsesTools({ includeWebSearch: webSearchIncluded, includeCodeInterpreter: true, includeOHLCV: true });
            console.log(chalk.yellow('📈 Enforcing OHLCV prior to finalize (6h@1m + 7d@15m)…'));
            const cont = await openai.responses.create({
              model: MODEL_NAME,
              previous_response_id: responseId || callsSourceId || undefined,
              instructions: systemPrompt,
              input: [ { role: 'user', content: [{ type: 'input_text', text: demand }] } ],
              tools: nextTools,
              tool_choice: 'auto',
              parallel_tool_calls: ENABLE_PARALLEL_TOOLS,
              stream: false
            });
            // Log function_call count for observability
            try {
              const outArr = Array.isArray(cont?.output) ? cont.output : [];
              const fc = outArr.filter(i => i?.type === 'function_call');
              console.log(chalk.gray(`   • OHLCV enforcement issued → calls observed: ${fc.length}`));
            } catch {}
            response = cont;
            try { if (cont?.id) { responseId = cont.id; callsSourceId = cont.id; } } catch {}
            ohlcvIncluded = true;
            rounds++;
            continue;
          } catch {}
        }
        // Images-only continuation before finalize: removed for stability.
        // If needed in the future, reintroduce behind a feature flag with strict non-finalizing behavior.
        // Otherwise, finalize with accumulated outputs (tools disabled; no previous_response_id)
        const outputsAll = getAccumOutputs();
        // Filter outputs to those that belong to the last response that produced function calls
        const expectedSet = (callsSourceId && expectedCallsByResponse.get(callsSourceId)) || new Set();
        // For 'role: tool' messages, the id is on o.tool_call_id
        const outputsForChain = outputsAll.filter(o => expectedSet.has(o.call_id));
        const attachMsg = (AUTO_CONTINUE_OUTPUTS && didAutoContinueOutputs && outputsAll.length > 0)
          ? `📡 Finalizing now (no pending tool calls); attaching 0/${outputsAll.length} output(s) (already ingested)`
          : `📡 Finalizing now (no pending tool calls); attaching ${outputsForChain.length}/${outputsAll.length} output(s)`;
        console.log(chalk.blue(attachMsg));
        try {
          let systemPromptFinal = systemPrompt;
          if (ENABLE_AGENT_MEMORY && agentState) {
            try {
              const longDigest = buildScopedDigest(agentState, DIGEST_SCOPE_FINAL, Math.max(DIGEST_CHARS_SHORT, DIGEST_CHARS_LONG));
              systemPromptFinal = buildSystemPrompt({ skipOhlcv: SKIP_OHLCV, agentMemoryText: longDigest });
              if (longDigest && !QUIET_STREAM) console.log(chalk.gray(`🧠 Finalization uses long digest (${longDigest.length} chars)`));
            } catch {}
          }
          const { buildFinalizePrompt } = await import('./core/prompts.js');
          const finalizePrompt = buildFinalizePrompt({ lastRound: true, maxRounds: MAX_ROUNDS });
          const finalizeEffortNow = getPhaseReasoningEffort('finalize', { toolsInvokedCount: Object.keys(toolsInvoked||{}).length, totalToolCalls, reformatAttempted: false });
          let outFin = '';
          try {
            // 1) If we have tool outputs, first continue the same session by submitting them alone
            //    This lets the server link outputs to its known function_call ids before we finalize.
            if (outputsForChain.length) {
              try {
                const cont = await openai.responses.create({
                  model: MODEL_NAME,
                  previous_response_id: callsSourceId || responseId || undefined,
                  instructions: systemPrompt, // keep core instructions for continuity
                  input: [ ...outputsForChain ],
                  tool_choice: 'none',
                  stream: false
                });
                if (cont?.id) { responseId = cont.id; callsSourceId = cont.id; }
              } catch (e3) {
                console.error(chalk.red('❌ Continuation with tool outputs failed:'), e3);
              }
            }

            // 2) Now request final JSON without attaching any tool outputs (already ingested)
            const fin = await openai.responses.create({
              model: MODEL_NAME,
              previous_response_id: responseId || callsSourceId || undefined,
              instructions: systemPromptFinal,
              input: [ { role: 'user', content: [{ type: 'input_text', text: finalizePrompt }] } ],
              reasoning: { effort: finalizeEffortNow },
              text: { format: { type: 'json_schema', name: 'TokenAnalysis', schema: ANALYSIS_SCHEMA, strict: true } },
              tool_choice: 'none',
              stream: false
            });
            response = fin;
          } catch (e2) {
            console.error(chalk.red('❌ Finalize-now (non-stream) failed (accum):'), e2);
          }
        } catch (e) {
          console.error(chalk.red('❌ Finalize-now (accum) failed:'), e);
        }
        break;
      }
      console.log(chalk.yellow(`\n🔧 Tool calls requested: ${functionCalls.length} (round ${rounds+1}/${MAX_ROUNDS})`));

      const outputs = [];
      let callIndex = 0;
      for (const call of functionCalls) {
        const name = call.name;
        const args = call.arguments ? JSON.parse(call.arguments) : {};
        const t_tool = Date.now();
        const memoKey = `${name}|${JSON.stringify(args)}`;
        let result;
        // Allow multiple tool calls in parallel - removing the single-tool-per-turn restriction
        // This fixes the "call-id churn" issue where skipped calls cause "No tool output found" errors
        const multipleThisTurn = functionCalls.length > 1;
        if (multipleThisTurn && callIndex > 0) {
          console.log(chalk.yellow(`    ⚠️ Multiple tools in one turn (${callIndex + 1}/${functionCalls.length}), executing anyway to avoid call-id churn`));
        }
        if (inRunMemo.has(memoKey)) {
          console.log(chalk.gray(`    (memo) Reusing result for ${name}`));
          result = inRunMemo.get(memoKey);
        } else {
          result = await toolExecutor.executeTool(name, args);
          inRunMemo.set(memoKey, result);
        }
        const dt = Date.now() - t_tool;
        if (name === 'socials_orchestrate' || name === 'analyze_token_socials') timings.socials_ms += dt;
          if (name === 'analyze_token_ohlcv' || name === 'analyze_token_ohlcv_range') { 
            timings.ohlcv_ms += dt; 
            lastOHLCVResult = result; 
            // Mid-run market checkpoint (relative-only memory)
            if (ENABLE_AGENT_MEMORY && agentState && result && result.ohlcv) {
              try {
                const updated = updateStateMarket(agentState, result);
                const dig = buildMemoryDigest(updated, Math.max(500, DIGEST_CHARS_SHORT));
                await saveAgentState(tokenAddress, updated, { digest: dig });
                if (!QUIET_STREAM) console.log(chalk.gray('🧠 Memory checkpoint saved (market).'));
                try { postAgent('agent:memory', { mint: tokenAddress, scope: 'market_checkpoint', length: (dig||'').length, text: dig, at: new Date().toISOString() }); } catch {}
                // AI-generated, compact OHLCV status line (Responses API)
                try {
                  const statusPrompt = 'Produce ONE concise status line (<=140 chars) summarizing OHLCV so far: include total candles, interval minutes, total change % (rounded to 2dp), and HL (high/low) ratio if meaningful. Output text only.';
                  const cont = await openai.responses.create({
                    model: MODEL_NAME,
                    previous_response_id: responseId || callsSourceId || undefined,
                    instructions: systemPrompt,
                    input: [ { role: 'user', content: [{ type: 'input_text', text: statusPrompt }] } ],
                    tool_choice: 'none',
                    stream: false
                  });
                  const statusText = String(cont?.output_text || '').trim();
                  if (statusText) {
                    const p2 = { mint: tokenAddress, at: new Date().toISOString(), text: statusText };
                    try { agentEvents.partialOutput(p2); } catch {}
                    try { postAgent(AGENT_EVENTS.PARTIAL_OUTPUT, p2); } catch {}
                  }
                  try { if (cont?.id) responseId = cont.id; } catch {}
                } catch {}
              } catch (e) { console.log(chalk.yellow('⚠️  Memory checkpoint (market) failed:'), e?.message || e); }
            }
          }
        // Responses API: attach tool outputs as function_call_output items referencing the server call_id
        const outRec = { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) };
        outputs.push(outRec);
        addAccum([outRec]);
        totalToolCalls++;
        try { toolsInvoked[name] = (toolsInvoked[name] || 0) + 1; } catch {}
        // Track last result per tool for gating decisions
        resultsMap[name] = result;
        if (name === 'socials_orchestrate' && result) {
          if (result.report_path) {
            try { console.log(chalk.gray(`📄 Orchestrator REPORT_FILE: ${result.report_path}`)); } catch {}
            orchestratorReportPath = result.report_path;
          }
          // Mid-run memory checkpoint from socials
          if (ENABLE_AGENT_MEMORY && agentState) {
            try {
              const updated = updateStateFromSocials(agentState, result);
              const dig = buildMemoryDigest(updated, Math.max(500, DIGEST_CHARS_SHORT));
              await saveAgentState(tokenAddress, updated, { digest: dig });
              if (!QUIET_STREAM) console.log(chalk.gray('🧠 Memory checkpoint saved (socials).'));
              try { postAgent('agent:memory', { mint: tokenAddress, scope: 'socials_checkpoint', length: (dig||'').length, text: dig, at: new Date().toISOString() }); } catch {}
              // AI-generated, compact socials status line (Responses API)
              try {
                const statusPrompt = 'Produce a single concise status line (<=140 chars) summarizing the socials snapshot so far (name/symbol, X/TG presence, site links). Output text only.';
                const cont = await openai.responses.create({
                  model: MODEL_NAME,
                  previous_response_id: responseId || callsSourceId || undefined,
                  instructions: systemPrompt,
                  input: [ { role: 'user', content: [{ type: 'input_text', text: statusPrompt }] } ],
                  tool_choice: 'none',
                  stream: false
                });
                const statusText = String(cont?.output_text || '').trim();
                if (statusText) {
                  const p2 = { mint: tokenAddress, at: new Date().toISOString(), text: statusText };
                  try { agentEvents.partialOutput(p2); } catch {}
                  try { postAgent(AGENT_EVENTS.PARTIAL_OUTPUT, p2); } catch {}
                }
                try { if (cont?.id) responseId = cont.id; } catch {}
              } catch {}
            } catch (e) { console.log(chalk.yellow('⚠️  Memory checkpoint (socials) failed:'), e?.message || e); }
          }
        }
        try {
          const p={ mint: tokenAddress, at: new Date().toISOString(), name, ok: true, elapsed_ms: dt };
          agentEvents.toolResult(p); postAgent(AGENT_EVENTS.TOOL_RESULT, p);
          if (name === 'socials_orchestrate') {
            emitProcess('process:step_end', { mint: tokenAddress, step: 'socials', ok: true, elapsed_ms: dt, at: new Date().toISOString() });
            // Derive signals/rationales from orchestrator result
            try {
              const soc = result || {};
              // Emit token meta (name/symbol/address) so UI can show nicer labels
              try {
                const meta = { mint: tokenAddress, name: soc.name || null, symbol: soc.symbol || null, address: soc.address || tokenAddress };
                emitProcess('token:meta', meta);
              } catch {}
              if (soc.market && (soc.market.price!=null || soc.market.fdv!=null || soc.market.liquidity!=null || soc.market.vol24h!=null)) {
                emitProcess('metrics:update', { mint: tokenAddress, price: soc.market.price ?? null, fdv: soc.market.fdv ?? null, liquidity: soc.market.liquidity ?? null, volume24h: soc.market.vol24h ?? null, updated_at: new Date().toISOString() });
                const ms = Number(result?.step_timings?.market?.ms||0) || undefined;
                emitProcess('process:step_end', { mint: tokenAddress, step: 'market', ok: true, ...(ms!=null?{ elapsed_ms: ms }:{}), at: new Date().toISOString() });
              }
              if (soc.website) {
                const ms = Number(result?.step_timings?.website?.ms||0) || undefined;
                emitProcess('process:step_end', { mint: tokenAddress, step: 'website', ok: true, ...(ms!=null?{ elapsed_ms: ms }:{}), at: new Date().toISOString() });
                const siteUrl = soc.website.url || (Array.isArray(soc.websites_from_db)&&soc.websites_from_db[0]?.url) || null;
                if (siteUrl) {
                  try { const u=new URL(siteUrl); emitProcess('process:source',{ mint: tokenAddress, url: siteUrl, title: soc.website.title||null, domain: u.hostname, at:new Date().toISOString() }); } catch {}
                }
              }
              if (soc.telegram && !soc.telegram.skipped) {
                const ms = Number(result?.step_timings?.telegram?.ms||0) || undefined;
                emitProcess('process:step_end', { mint: tokenAddress, step: 'telegram', ok: true, ...(ms!=null?{ elapsed_ms: ms }:{}), at: new Date().toISOString() });
                const tg = soc.telegram; const members = tg.members || tg.participants || tg.member_count;
                if (members!=null) emitProcess('process:signal', { mint: tokenAddress, id:'tg_members', label:'Telegram members', value: members, at: new Date().toISOString() });
              } else {
                // Mark telegram as skipped so UI doesn't show it forever pending
                emitProcess('process:step_end', { mint: tokenAddress, step: 'telegram', ok: false, skipped: true, at: new Date().toISOString() });
              }
              if (soc.twitter) {
                const ms = Number(result?.step_timings?.twitter?.ms||0) || undefined;
                emitProcess('process:step_end', { mint: tokenAddress, step: 'twitter', ok: true, ...(ms!=null?{ elapsed_ms: ms }:{}), at: new Date().toISOString() });
                const tw = soc.twitter; const followers = tw.profile?.followers || tw.profile?.followers_count || tw.profile?.followersCount;
                if (followers!=null) emitProcess('process:signal', { mint: tokenAddress, id:'tw_followers', label:'Twitter followers', value: followers, at: new Date().toISOString() });
                const twUrl = tw.profile?.url || (Array.isArray(soc.official_links) && soc.official_links.find(l=> (l.platform||'').toLowerCase()==='twitter')?.url) || null;
                if (twUrl) { try { const u=new URL(twUrl); emitProcess('process:source', { mint: tokenAddress, url: twUrl, title: tw.profile?.name||null, domain: u.hostname, at: new Date().toISOString() }); } catch {} }
              }
              if (Array.isArray(soc.official_links)) {
                const seen = new Set();
                for (const l of soc.official_links) {
                  try { const u=new URL(l.url); const k=u.hostname+u.pathname; if (seen.has(k)) continue; seen.add(k); emitProcess('process:source',{ mint: tokenAddress, url: l.url, title: l.platform||null, domain: u.hostname, at:new Date().toISOString() }); } catch {}
                }
              }
            } catch {}
          }
          if (name === 'resolve_symbol_to_mints') {
            try {
              const res = result || {};
              const bp = res.best_pick || null;
              if (bp) {
                const confidencePct = Math.round(((bp.confidence||0) * 100));
                emitProcess('process:signal', { mint: tokenAddress, id: 'resolver_best', label: `Resolved ${res.query || bp.symbol || 'symbol'}`, value: `${bp.symbol || ''} → ${(bp.address||'').slice(0,6)}… (${confidencePct}%)`, at: new Date().toISOString() });
                if (bp.top_pair) {
                  const lp = bp.top_pair;
                  const liq = (lp.liquidity_usd!=null) ? `$${Math.round(lp.liquidity_usd).toLocaleString()} liq` : '';
                  const vol = (lp.volume24h_usd!=null) ? `$${Math.round(lp.volume24h_usd).toLocaleString()} 24h vol` : '';
                  const summary = `${lp.dexId||''}${(liq||vol)?' • ':''}${liq}${(liq&&vol)?' | ':''}${vol}`.trim();
                  emitProcess('process:signal', { mint: tokenAddress, id: 'resolver_top_pair', label: 'Best pair', value: summary, at: new Date().toISOString() });
                  if (lp.url) {
                    try { const u=new URL(lp.url); emitProcess('process:source', { mint: tokenAddress, url: lp.url, title: `Dex Pair • ${lp.dexId||''}`, domain: u.hostname, at:new Date().toISOString() }); } catch {}
                  }
                }
              }
            } catch {}
          }
          if (name === 'analyze_token_ohlcv' || name === 'analyze_token_ohlcv_range') {
            emitProcess('process:step_end', { mint: tokenAddress, step: 'market', ok: true, elapsed_ms: dt, at: new Date().toISOString() });
          }
        } catch {}
        callIndex++;
      }

      // Remember which response produced these tool calls
      try { if (sourceIdForRound) lastToolsResponseId = sourceIdForRound; } catch {}

      // Auto-continue: ingest all accumulated outputs immediately to avoid finalize call_id mismatches
      // Per-round auto-continue: ingest this round's tool outputs every time
      if (AUTO_CONTINUE_OUTPUTS && outputs.length > 0) {
        const prevId = lastToolsResponseId || callsSourceId || responseId || undefined;
        try {
          console.log(chalk.blue(`📡 Auto-continue: submitting ${outputs.length} output(s) to ${String(prevId||'unknown').slice(0,16)}…`));
          const cont = await openai.responses.create({
            model: MODEL_NAME,
            previous_response_id: prevId,
            instructions: systemPrompt,
            input: [ ...outputs ],
            tool_choice: 'none',
            stream: false
          });
          if (cont?.id) { responseId = cont.id; callsSourceId = cont.id; }
          didAutoContinueOutputs = true;
        } catch (eac) {
          console.log(chalk.red('❌ Auto-continue (outputs-only) failed:'), eac?.message || eac);
        }
      }

      // Ask for finalization if this is the last allowed round
      const { buildFinalizePrompt } = await import('./core/prompts.js');
      const finalizePrompt = buildFinalizePrompt({ lastRound: rounds + 1 >= MAX_ROUNDS, maxRounds: MAX_ROUNDS });

      // Decide whether to enable web search now
      const includeWebSearchNext = !webSearchIncluded && ENABLE_WEB_SEARCH && shouldEnableWebSearchFromResults(resultsMap);
      const isLastRound = (rounds + 1) >= MAX_ROUNDS;
      // Derive once for this turn, then persist stickiness explicitly
      const willIncludeSearch = ENABLE_WEB_SEARCH && !isLastRound && (webSearchIncluded || includeWebSearchNext);

      // Build the tools for the finalization
      const nextTools = buildResponsesTools({
        includeWebSearch: willIncludeSearch,
        includeCodeInterpreter: !isLastRound,
        includeOHLCV: isLastRound ? false : ohlcvIncluded
      });

      // Persist sticky enablement (once on, stays on for this run)
      webSearchIncluded = webSearchIncluded || includeWebSearchNext;

      // If we have outputs to attach and we're not on the last round, use a decoupled continuation plan:
      //   1) Outputs-only continuation (tools ON)
      //   2) Images-only continuation happens later when there are no pending calls (see no-calls branch)

      // If we have outputs to attach and we're not on the last round, use a decoupled continuation plan:
      if (!didAutoContinueOutputs && outputs.length > 0 && !((rounds + 1) >= MAX_ROUNDS)) {
        // Build the tools for the continuation
        const contTools = buildResponsesTools({
          includeWebSearch: willIncludeSearch,
          includeCodeInterpreter: true,
          includeOHLCV: ohlcvIncluded
        });
        
        // Outputs-only continuation (no images in this turn). Images-only occurs later when no pending calls.
        const t_out_cont = Date.now();
        console.log(chalk.blue(`📡 Continuation: outputs-only (round ${rounds+1}/${MAX_ROUNDS}); tools enabled`));
        const continuePrompt2 = 'Process the attached tool results. If more data is needed, request the appropriate tools next. Do not produce final JSON yet.';
        
        // Streamed continuation for outputs-only, with targeted one-time fallback on specific reasoning error
        const contPayload = {
          model: MODEL_NAME,
          previous_response_id: sourceIdForRound || undefined,
          instructions: systemPrompt,
          input: [ { role: 'user', content: [{ type: 'input_text', text: continuePrompt2 }] }, ...outputs ],
          tools: contTools,
          tool_choice: 'auto',
          parallel_tool_calls: ENABLE_PARALLEL_TOOLS,
          stream: true
        };

        // Initialize variables for the continuation
        let contOut = '';
        const contCalls = [];
        let contRespId = null;
        let fcIdC=null, fcNameC=null, fcArgsC='';
        let contStreamError = null;

        // Try to stream the response from the model
        try {
          const contStream = await openai.responses.create(contPayload);
          for await (const rawEv of contStream) {
            // Normalize event types to handle both function_call and mcp_call uniformly
            const ev = normalizeEventType(rawEv);
            
            // Capture the response ID
            if (ev.type === 'response.created') {
              contRespId = ev.response?.id || contRespId;
            } 
            // Capture the output text delta
            else if (ev.type === 'response.output_text.delta') {
              const d = ev.delta || '';
              contOut += d;
              if (d && !QUIET_STREAM) try { process.stdout.write(d); } catch {}
            } 
            // Capture the stream error
            else if (ev.type === 'response.error') {
              contStreamError = ev.error || { message: 'response.error' };
              if (!QUIET_STREAM) console.log(chalk.red('   • continuation stream error:'), contStreamError);
              break;
            } 
            // Capture the function call start
            else if (ev.type === 'response.output_item.added' && ev.item?.type === 'function_call') {
              fcIdC = ev.item.call_id; fcNameC = ev.item.name; fcArgsC='';
              const callLabel = ev.callType === 'mcp' ? 'mcp_call' : 'tool_call';
              if (!QUIET_STREAM) console.log(chalk.yellow(`   • ${callLabel}(start) ${fcNameC} (${fcIdC})`));
            } 
            // Capture the function call arguments delta
            else if (ev.type === 'response.function_call_arguments.delta') {
              fcArgsC += ev.delta || '';
            } 
            // Capture the function call done
            else if (ev.type === 'response.output_item.done' && ev.item?.type === 'function_call') {
              contCalls.push({ type:'function_call', call_id: fcIdC, name: fcNameC, arguments: fcArgsC || ev.item.arguments || '{}' });
              const callLabel2 = ev.callType === 'mcp' ? 'mcp_call' : 'tool_call';
              if (!QUIET_STREAM) console.log(chalk.yellow(`   • ${callLabel2}(done) ${fcNameC} (${fcIdC})`));
              fcIdC=null; fcNameC=null; fcArgsC='';
            }
          }
        } catch (e) {
          contStreamError = e;
        }
        if (contStreamError) {
          // Check if the error is retriable
          const msg = String(contStreamError?.message || contStreamError?.error?.message || '');
          const retriable = /reasoning.*required following item|No tool (output|call) found/i.test(msg);
          if (!retriable) throw contStreamError;

          // One-time fallback: non-stream continuation with same anchor and outputs
          console.log(chalk.yellow('⚠️  Continuation fallback failed; performing immediate finalize with attached outputs.'));
          const retryPayload = { ...contPayload, stream: false };
          try {
            const contResp2 = await openai.responses.create(retryPayload);
            response = contResp2;
            try { if (contResp2?.id) { responseId = contResp2.id; callsSourceId = contResp2.id; } } catch {}
            rounds++;
            continue;
          } catch (e2) {
            console.log(chalk.yellow('⚠️  Continuation fallback failed; performing immediate finalize with attached outputs.'));
            // Immediate finalize with outputs anchored to the original source response
            let systemPromptFinal = systemPrompt;
            if (ENABLE_AGENT_MEMORY && agentState) {
              try {
                const longDigest = buildScopedDigest(agentState, DIGEST_SCOPE_FINAL, Math.max(DIGEST_CHARS_SHORT, DIGEST_CHARS_LONG));
                systemPromptFinal = buildSystemPrompt({ skipOhlcv: SKIP_OHLCV, agentMemoryText: longDigest });
              } catch {}
            }
            
            // Get the finalize prompt and effort
            const { buildFinalizePrompt } = await import('./core/prompts.js');
            const finalizePrompt = buildFinalizePrompt({ lastRound: false, maxRounds: MAX_ROUNDS });
            const finalizeEffort = getPhaseReasoningEffort('finalize', { toolsInvokedCount: Object.keys(toolsInvoked||{}).length, totalToolCalls, reformatAttempted: false });
            
            // Try streamed finalize first
            try {
              const finStream = await openai.responses.create({
                model: MODEL_NAME,
                previous_response_id: sourceIdForRound || undefined,
                instructions: systemPromptFinal,
                input: [ { role: 'user', content: [{ type: 'input_text', text: finalizePrompt }] }, ...outputs ],
                // tools disabled when attaching outputs to avoid churn
                tool_choice: undefined,
                parallel_tool_calls: ENABLE_PARALLEL_TOOLS,
                reasoning: { effort: finalizeEffort },
                text: { format: { type: 'json_schema', name: 'TokenAnalysis', schema: ANALYSIS_SCHEMA, strict: true } },
                stream: true
              });
              let outFin = '';
              for await (const ev of finStream) {
                if (ev.type === 'response.output_text.delta') { const d = ev.delta || ''; outFin += d; if (d && !QUIET_STREAM) try { process.stdout.write(d); } catch {} }
                if (ev.type === 'response.created') { responseId = ev.response?.id || responseId; }
              }
              response = { output_text: outFin, output: [] };
              rounds++;
              continue;
            } catch (e3) {
              // Non-stream fallback finalize
              try {
                const fin = await openai.responses.create({
                  model: MODEL_NAME,
                  previous_response_id: sourceIdForRound || undefined,
                  instructions: systemPromptFinal,
                  input: [ { role: 'user', content: [{ type: 'input_text', text: finalizePrompt }] }, ...outputs ],
                  tool_choice: undefined,
                  parallel_tool_calls: ENABLE_PARALLEL_TOOLS,
                  reasoning: { effort: finalizeEffort },
                  text: { format: { type: 'json_schema', name: 'TokenAnalysis', schema: ANALYSIS_SCHEMA, strict: true } },
                  stream: false
                });
                response = fin;
                try { if (fin?.id) { responseId = fin.id; callsSourceId = fin.id; } } catch {}
                rounds++;
                continue;
              } catch (e4) {
                console.log(chalk.red('❌ Immediate finalize after continuation failure also failed; proceeding to next loop.'));
                response = { output_text: contOut, output: contCalls };
              }
            }
          }
        }
        // Retrieve canonical server view to capture any additional function calls not seen in the stream
        let fullCont = null;
        try { if (contRespId) fullCont = await openai.responses.retrieve(contRespId); } catch {}
        let canonCalls = [];
        try {
          const out = Array.isArray(fullCont?.output) ? fullCont.output : [];
          for (const item of out) {
            if (item?.type === 'function_call') {
              canonCalls.push({ type: 'function_call', call_id: item.call_id, name: item.name, arguments: item.arguments || '{}' });
            }
          }
        } catch {}

        // Merge stream-observed calls with canonical calls
        const mergedById = new Map();
        for (const c of contCalls) mergedById.set(c.call_id, c);
        for (const c of canonCalls) if (c?.call_id && !mergedById.has(c.call_id)) mergedById.set(c.call_id, c);
        const mergedCalls = Array.from(mergedById.values());
        if (!QUIET_STREAM && canonCalls.length > contCalls.length) {
          console.log(chalk.gray(`   • continuation: ${canonCalls.length} call(s) on server; ${contCalls.length} observed in stream → using ${mergedCalls.length}`));
        }
        response = { output_text: contOut, output: mergedCalls };
        try { if (contRespId) { responseId = contRespId; callsSourceId = contRespId; } } catch {}
        rounds++;
        continue; // Next loop: execute newly requested tool calls
      }

      // Log the finalize round start
      console.log(chalk.blue(`📡 Finalizing synthesis (round ${rounds+1}/${MAX_ROUNDS}) with ${outputs.length} tool result(s)...`));
      
      // Emit status and process events
      try {
        const p={ mint: tokenAddress, at: new Date().toISOString(), text: 'finalize_round_start', round: rounds+1 };
        agentEvents.status(p); postAgent(AGENT_EVENTS.STATUS, p);
        emitProcess('process:step_start', { mint: tokenAddress, step: 'synthesis', at: new Date().toISOString() });
      } catch {}

      // Start timing the finalize request
      const t_llm2_start = Date.now();
      try {
        if (!QUIET_STREAM) console.log(chalk.gray('➡️  Sending finalization request (streaming)...'));
      // For finalization, optionally rebuild instructions with a longer digest (final round context)
      let systemPromptFinal = systemPrompt;
      if (ENABLE_AGENT_MEMORY && agentState) {
        try {
          const longDigest = buildScopedDigest(agentState, DIGEST_SCOPE_FINAL, Math.max(DIGEST_CHARS_SHORT, DIGEST_CHARS_LONG));
          systemPromptFinal = buildSystemPrompt({ skipOhlcv: SKIP_OHLCV, agentMemoryText: longDigest });
          if (longDigest && !QUIET_STREAM) console.log(chalk.gray(`🧠 Finalization uses long digest (${longDigest.length} chars)`));
        } catch {}
      }

      // Determine if tools should be allowed
      const allowToolsNow = false; // Finalization is pure: no tools during finalize

      // Get the effort for the finalize request
      const finalizeEffort = getPhaseReasoningEffort('finalize', { toolsInvokedCount: Object.keys(toolsInvoked||{}).length, totalToolCalls, reformatAttempted: false });

      // Build finalize payload. If we already auto‑continued outputs, do NOT reattach them.
      const finalizeInputs = [ { role: 'user', content: [{ type: 'input_text', text: finalizePrompt }] } ];
      if (!AUTO_CONTINUE_OUTPUTS || !didAutoContinueOutputs) {
        // Only include outputs if they haven't been ingested yet in this chain
        finalizeInputs.push(...outputs);
      }
      const finalizePayload = {
        model: MODEL_NAME,
        // Chain to the latest response id to preserve context after any auto‑continuation
        previous_response_id: (callsSourceId || responseId || undefined),
        instructions: systemPromptFinal,
        input: finalizeInputs,
        tools: undefined,
        tool_choice: 'none',
        parallel_tool_calls: false,
        reasoning: { effort: finalizeEffort },
        text: { format: { type: 'json_schema', name: 'TokenAnalysis', schema: ANALYSIS_SCHEMA, strict: true } },
        stream: false
      };
      try {
        response = await openai.responses.create(finalizePayload);
      } catch (e1) {
        // Non-retriable: bubble up and let outer handler manage
        throw e1;
      }


      
        // Finalize completed (non-stream). Proceed to parse phase.
      } catch (e) {
        console.error(chalk.red('❌ Finalize call failed:'), e);
        throw e;
      }
      timings.llm_round2_ms += (Date.now() - t_llm2_start);

      rounds++;
    }

    // Parse output_text as JSON
    console.log(chalk.gray('🔎 Parsing model output...'));
    let analysis;
    const content = response.output_text || '';

    // Try to parse the output_text as JSON
    function tryParseStrictJson(txt){
      try { 
        const parsed = JSON.parse(txt);
        console.log(chalk.green('✅ Direct JSON.parse succeeded'));
        return parsed;
      } catch (e) {
        console.log(chalk.yellow(`⚠️  Direct parse failed: ${e.message}`));
      }
      const start = txt.indexOf('{');
      const end = txt.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const candidate = txt.slice(start, end + 1);
        try { 
          const parsed = JSON.parse(candidate);
          console.log(chalk.green('✅ Extracted JSON object parse succeeded'));
          return parsed;
        } catch (e) {
          console.log(chalk.yellow(`⚠️  Extracted object parse failed: ${e.message}`));
        }
      }
      const cleaned = txt.replace(/^```[a-zA-Z]*\n?|```$/g, '');
      try { 
        const parsed = JSON.parse(cleaned);
        console.log(chalk.green('✅ Code fence cleaned parse succeeded'));
        return parsed;
      } catch (e) {
        console.log(chalk.yellow(`⚠️  Cleaned parse failed: ${e.message}`));
      }
      return null;
    }
    let parsed = tryParseStrictJson(content);    
    // Track finalize path usage for observability
    const metaFlags = { reformat_used: false, resynthesis_used: false, degenerate_detected: false };

    // Validate parsed JSON against schema requirements
    let schemaValid = false;
    if (parsed) {
      console.log(chalk.cyan('🔍 Validating parsed JSON against schema...'));
      
      // Extract required fields from the actual schema
      const schemaRequired = ANALYSIS_SCHEMA.required || [];
      const missingFields = schemaRequired.filter(field => !(field in parsed));
      if (missingFields.length > 0) {
        console.log(chalk.red(`❌ Missing required top-level fields: ${missingFields.join(', ')}`));
      }
      
      // Check nested required fields using schema definitions
      let nestedMissing = false;
      const checkNestedSchema = (obj, schema, path) => {
        if (!obj || !schema || !schema.properties) return;
        
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          const fullPath = path ? `${path}.${key}` : key;
          
          if (propSchema.type === 'object' && propSchema.required && obj[key]) {
            // Check nested object required fields
            const missing = propSchema.required.filter(field => !(field in obj[key]));
            if (missing.length > 0) {
              console.log(chalk.red(`❌ Missing ${fullPath} fields: ${missing.join(', ')}`));
              nestedMissing = true;
            }
            // Recurse for deeper nesting
            checkNestedSchema(obj[key], propSchema, fullPath);
          } else if (propSchema.type === 'object' && propSchema.properties && obj[key]) {
            // Recurse even without required fields
            checkNestedSchema(obj[key], propSchema, fullPath);
          }
        }
      };
      
      checkNestedSchema(parsed, ANALYSIS_SCHEMA, '');
      
      if (missingFields.length === 0 && !nestedMissing) {
        console.log(chalk.green('✅ All required top-level fields present'));
      }
      schemaValid = (missingFields.length === 0) && !nestedMissing;
    }
    
    // If parsed successfully, use it as the analysis
    analysis = parsed;

    // If not, attempt to reformat the response to match the schema
    // One-shot reformat guard: ask model to output valid JSON only
    if (!analysis) {
      console.log(chalk.yellow('⚠️  First parse failed. Attempting reformat with strict schema...'));
      try {
        // Get the effort for the refine request
        const refineEffort = getPhaseReasoningEffort('refine', { toolsInvokedCount: Object.keys(toolsInvoked||{}).length, totalToolCalls, reformatAttempted: true });
        console.log(chalk.gray(`📋 Requesting strict JSON with effort: ${refineEffort}`));
        
        // Request a strict JSON output with the schema, using the just-produced draft as context
        const draft = String(content || '').slice(0, 6000);
        const refine = await openai.responses.create({
          model: MODEL_NAME,
          // REMOVED previous_response_id - must pass full context instead when using reasoning
          instructions: buildSystemPrompt({ skipOhlcv: SKIP_OHLCV, agentMemoryText: '' }),
          input: [ { role: 'user', content: [
            { type: 'input_text', text: 'Convert the following draft into VALID JSON only that strictly matches the schema. Do not invent fields. No commentary, no code fences.' },
            { type: 'input_text', text: `DRAFT:\n${draft}` }
          ] } ],
          reasoning: { effort: refineEffort },
          text: { format: { type: 'json_schema', name: 'TokenAnalysis', schema: ANALYSIS_SCHEMA, strict: true } },
          stream: false
        });
        
        // Parse the response
        const outTxt = refine?.output_text || '';
        console.log(chalk.gray(`📝 Reformat response (${outTxt.length} chars): ${outTxt.substring(0, 200)}...`));
        const reparsed = tryParseStrictJson(outTxt);
        
        // If successful, use it as the analysis
        if (reparsed) {
          console.log(chalk.green('✅ Successfully reparsed after reformat'));
          analysis = reparsed;
          metaFlags.reformat_used = true;
          // Re-validate schema after reformat success
          try {
            console.log(chalk.cyan('🔍 Re-validating JSON (post-reformat)...'));
            const schemaRequired = ANALYSIS_SCHEMA.required || [];
            const missingFields2 = schemaRequired.filter(field => !(field in analysis));
            let nestedMissing2 = false;
            const checkNestedSchema2 = (obj, schema, path) => {
              if (!obj || !schema || !schema.properties) return;
              for (const [key, propSchema] of Object.entries(schema.properties)) {
                const fullPath = path ? `${path}.${key}` : key;
                if (propSchema.type === 'object' && propSchema.required && obj[key]) {
                  const missing = propSchema.required.filter(field => !(field in obj[key]));
                  if (missing.length > 0) { console.log(chalk.red(`❌ Missing ${fullPath} fields: ${missing.join(', ')}`)); nestedMissing2 = true; }
                  checkNestedSchema2(obj[key], propSchema, fullPath);
                } else if (propSchema.type === 'object' && propSchema.properties && obj[key]) {
                  checkNestedSchema2(obj[key], propSchema, fullPath);
                }
              }
            };
            checkNestedSchema2(analysis, ANALYSIS_SCHEMA, '');
            schemaValid = (missingFields2.length === 0) && !nestedMissing2;
          } catch {}
        } else {
          console.log(chalk.red('❌ Reformat still failed to parse'));
        }
      } catch (e) {
        console.log(chalk.red('❌ Reformat attempt threw error:'), e?.message || e);
      }
    }

    // If still no analysis, return a fallback with a snippet of the raw response
    if (!analysis) {
      console.log(chalk.yellow('⚠️  Failed to parse structured output. Returning fallback with snippet.'));
      analysis = {
        riskScore: 5,
        summary: 'Analysis completed but response format was unexpected',
        redFlags: ['Unable to fully parse structured output'],
        greenFlags: [],
        explore: ['Manual review recommended'],
        raw_response_snippet: content.substring(0, 500)
      };
    }

    // Guardrail: If the model produced a degenerate stub despite successful tool data,
    // perform a one-shot re-synthesis using the orchestrator payload as explicit context.
    try {
      const looksDegenerate = (() => {
        try {
          const bs0 = (analysis?.branchScore === 0);
          const rs0 = (analysis?.riskScore === 0 || analysis?.riskScore == null);
          const why = (analysis?.branchWhy || '') + ' ' + (analysis?.projectSummary || '') + ' ' + (analysis?.summary || '') + ' ' + (analysis?.currentStatus || '');
          const saysNeedToken = /need\s+token|provide\s+token|cannot\s+score\s+without/i.test(why);
          return bs0 && saysNeedToken;
        } catch { return false; }
      })();
      const soc = resultsMap?.['socials_orchestrate'] || null;
      if (looksDegenerate && soc) {
        metaFlags.degenerate_detected = true;
        console.log(chalk.yellow('🛠  Re-synthesizing final JSON from orchestrator payload (degenerate output detected).'));
        // Build a compact, deterministic context from orchestrator
        const pick = (v) => (v==null ? 'null' : typeof v==='object' ? JSON.stringify(v) : String(v));
        const market = soc.market || {};
        const site = soc.website || {};
        const twitter = soc.twitter || {};
        const telegram = soc.telegram || null;
        const tweets = Array.isArray(twitter?.recentTweets) ? twitter.recentTweets.slice(0, 5) : [];
        const official = Array.isArray(soc.discovered_official_links) ? soc.discovered_official_links : [];
        const contextText = [
          `Token: ${soc.symbol || ''} (${soc.address || ''})`,
          `Website: ${site?.url || 'n/a'} | Title: ${site?.meta?.title || 'n/a'} | Desc: ${(site?.meta?.description||'').slice(0,240)}`,
          `Market: price=${pick(market.price)} fdv=${pick(market.fdv)} liq=${pick(market.liquidity)} vol24h=${pick(market.vol24h)} dex=${pick(market?.top_pool?.dex)}`,
          `Twitter: handle=${pick(twitter.handle)} verified=${pick(twitter.isVerified)} followers=${pick(twitter.followersCount)} community=${pick(twitter.community?.communityName)}`,
          `Tweets(${tweets.length}):`,
          ...tweets.map(t=>`- ${t.timestamp||''} • ❤ ${t.likes||0} 🔁 ${t.retweets||0} 💬 ${t.replies||0} • ${(t.text||'').replace(/\s+/g,' ').slice(0,160)}`),
          `Official Links: ${official.map(o=>`${o.platform}:${o.url}`).join(' ')}`
        ].join('\n');

        const refineEffort2 = getPhaseReasoningEffort('refine', { toolsInvokedCount: Object.keys(toolsInvoked||{}).length, totalToolCalls, reformatAttempted: true });
        const resynth = await openai.responses.create({
          model: MODEL_NAME,
          instructions: buildSystemPrompt({ skipOhlcv: SKIP_OHLCV, agentMemoryText: '' }),
          input: [ { role: 'user', content: [
            { type: 'input_text', text: 'Using ONLY the following orchestrator data (website/meta, market metrics, twitter/tweets, discovered links), output a COMPLETE, VALID JSON that strictly matches the schema. No commentary.' },
            { type: 'input_text', text: contextText }
          ] } ],
          reasoning: { effort: refineEffort2 },
          text: { format: { type: 'json_schema', name: 'TokenAnalysis', schema: ANALYSIS_SCHEMA, strict: true } },
          stream: false
        });
        const outTxt2 = resynth?.output_text || '';
        console.log(chalk.gray(`🧪 Re-synthesis response (${outTxt2.length} chars)`));
        const reparsed2 = tryParseStrictJson(outTxt2);
        if (reparsed2) {
          analysis = reparsed2;
          metaFlags.resynthesis_used = true;
          // Re-validate schema after resynthesis success
          try {
            console.log(chalk.cyan('🔍 Re-validating JSON (post-resynthesis)...'));
            const schemaRequired = ANALYSIS_SCHEMA.required || [];
            const missingFields3 = schemaRequired.filter(field => !(field in analysis));
            let nestedMissing3 = false;
            const checkNestedSchema3 = (obj, schema, path) => {
              if (!obj || !schema || !schema.properties) return;
              for (const [key, propSchema] of Object.entries(schema.properties)) {
                const fullPath = path ? `${path}.${key}` : key;
                if (propSchema.type === 'object' && propSchema.required && obj[key]) {
                  const missing = propSchema.required.filter(field => !(field in obj[key]));
                  if (missing.length > 0) { console.log(chalk.red(`❌ Missing ${fullPath} fields: ${missing.join(', ')}`)); nestedMissing3 = true; }
                  checkNestedSchema3(obj[key], propSchema, fullPath);
                } else if (propSchema.type === 'object' && propSchema.properties && obj[key]) {
                  checkNestedSchema3(obj[key], propSchema, fullPath);
                }
              }
            };
            checkNestedSchema3(analysis, ANALYSIS_SCHEMA, '');
            schemaValid = (missingFields3.length === 0) && !nestedMissing3;
          } catch {}
          console.log(chalk.green('✅ Re-synthesis produced a valid final JSON'));
        } else {
          console.log(chalk.yellow('⚠️  Re-synthesis failed to parse; keeping prior analysis'));
        }
      }
    } catch (e) {
      console.log(chalk.yellow('⚠️  Re-synthesis guard failed:'), e?.message || e);
    }

    // Attach metadata to the analysis
    timings.total_ms = Date.now() - t0;
    analysis.metadata = {
      model: MODEL_NAME,
      api: 'responses',
      pipeline: 'orchestrator',
      tool_calls_made: totalToolCalls,
      timestamp: new Date().toISOString(),
      token_address: tokenAddress,
      timings,
    };

    // Attach orchestrator report path if present
    try {
      if (orchestratorReportPath) analysis.metadata.orchestrator_report_path = orchestratorReportPath;

      // Attach tool calls made
      const toolNames = Object.keys(toolsInvoked);
      if (toolNames.length) analysis.metadata.tools_invoked = toolsInvoked;

      // Attach image attach count, mode, and URLs if present
      if (imageAttachCount > 0) {
        analysis.metadata.images_attached_count = imageAttachCount;
        if (imageAttachMode) analysis.metadata.images_attached_mode = imageAttachMode;
        if (imageAttachMode === 'url' && imageAttachUrls && imageAttachUrls.length) analysis.metadata.image_urls = imageAttachUrls;
      }
    } catch {}

    // Attach web search usage and citations if present
    try {
      const ws = extractWebSearchCitations(full2 || full1 || response);
      analysis.metadata.web_search_used = ws.used;
      analysis.metadata.web_citations = ws.citations || [];
    } catch {}

    // Attach orchestrator highlights to metadata so the UI can reflect facts even if the model summary is conservative
    try {
      const soc = resultsMap?.['socials_orchestrate'] || null;
      if (soc) {
        analysis.metadata.name = soc.name || analysis.metadata.name || null;
        analysis.metadata.symbol = soc.symbol || analysis.metadata.symbol || null;
        analysis.metadata.market = soc.market || analysis.metadata.market || null;
        analysis.metadata.website = soc.website || analysis.metadata.website || null;
        analysis.metadata.twitter = soc.twitter || analysis.metadata.twitter || null;
        analysis.metadata.official_links = soc.discovered_official_links || analysis.metadata.official_links || [];
      }
    } catch {}

    // Attach MCP summary (hybrid tools) if available
    try {
      if (toolExecutor && typeof toolExecutor.getMcpStats === 'function') {
        const mcpSummary = toolExecutor.getMcpStats();
        analysis.metadata.mcp_summary = mcpSummary;
        console.log(chalk.gray('🧪 MCP summary'), JSON.stringify(mcpSummary));
      }
    } catch {}

    // Attach finalize path instrumentation for observability
    try {
      analysis.metadata.degenerate_detected = !!metaFlags.degenerate_detected;
      analysis.metadata.reformat_used = !!metaFlags.reformat_used;
      analysis.metadata.resynthesis_used = !!metaFlags.resynthesis_used;
      const statusMsg = `finalize_path degenerate=${analysis.metadata.degenerate_detected} reformat=${analysis.metadata.reformat_used} resynth=${analysis.metadata.resynthesis_used}`;
      try { emitProcess('process:status', { mint: tokenAddress, text: statusMsg, at: new Date().toISOString() }); } catch {}
    } catch {}

    // Update per-token agent state with the new analysis (best-effort)
    if (ENABLE_AGENT_MEMORY && agentState && schemaValid) {
      try {
        // Update the agent state with the new analysis
        const updated = updateStateFromAnalysis(agentState, analysis);
        // Attach market summary if we saw OHLCV result
        if (lastOHLCVResult && lastOHLCVResult.ohlcv) updateStateMarket(updated, lastOHLCVResult);
        // Save the updated agent state
        await saveAgentState(tokenAddress, updated, { digest: buildMemoryDigest(updated, Math.max(500, DIGEST_CHARS_SHORT)) });
        if (!QUIET_STREAM) console.log(chalk.gray('🧠 Agent state updated.'));
      } catch (e) {
        console.log(chalk.yellow('⚠️  Failed updating agent state:'), e?.message);
      }
    } else if (ENABLE_AGENT_MEMORY && agentState && !schemaValid) {
      try { console.log(chalk.yellow('⚠️  Skipping agent memory update due to schema validation failure.')); } catch {}
    }

    // Return the full analysis
    console.log('DEBUG: returning full analysis from analyzeWithGPT5Agent');
    return analysis;
    
  } catch (error) {
    console.error(chalk.red('❌ BranchMAInager Error:'), error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  function sanitizeError(e) {
    try {
      if (e?.error?.message) return String(e.error.message);
      if (e?.message) return String(e.message);
      return 'unexpected error';
    } catch { return 'unexpected error'; }
  }
  console.log(chalk.cyan.bold('\n═══════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('     🤖 BranchMAInager Token Intelligence System'));
  console.log(chalk.cyan.bold('═══════════════════════════════════════════════════\n'));
  
  // Resolve token mint from CLI args
  const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const cliFirst = process.argv[2];
  const cliMintFlag = getFlagValue('mint');
  const pickMint = () => {
    if (cliMintFlag && BASE58.test(cliMintFlag)) return cliMintFlag;
    if (cliFirst && !cliFirst.startsWith('--') && BASE58.test(cliFirst)) return cliFirst;
    return null;
  };
  const tokenAddress = pickMint();

  // Handle missing or invalid mint address
  if (!tokenAddress) {
    console.log(chalk.red('❌ Missing or invalid mint address.'));
    console.log('Usage:');
    console.log('  node token-ai/index.js <MINT> [--web-search] [--fast-ohlcv=birdeye] [flags]');
    console.log('  node token-ai/index.js --mint=<MINT> [--web-search] [--fast-ohlcv=birdeye] [flags]');
    console.log('Examples:');
    console.log('  node token-ai/index.js DMwbVy48dWVKGe9z1pcVnwF3HLMLrqWdDLfbvx8RchhK --web-search --fast-ohlcv=birdeye');
    console.log('  node token-ai/index.js --mint=DMwbVy48dWVKGe9z1pcVnwF3HLMLrqWdDLfbvx8RchhK --web-search');
    process.exit(1);
  }
  console.log(chalk.white('📍 Token Address:'), chalk.yellow(tokenAddress));
  
  // Log the website data integration
  // No need to load website data separately - it's currently included in socials payload
  console.log(chalk.green('✓ Website data is integrated into socials analysis'));
  
  // Run BranchMAInager analysis using the socials orchestrator 
  // (website data now comes from socials tool)
  let analysis;
  try {
    // Run analysis with the socials orchestrator
    analysis = await analyzeWithGPT5Agent(tokenAddress);
  } catch (e) {
    const msg = sanitizeError(e);
    try { const p={ mint: tokenAddress, at: new Date().toISOString(), text: `error: ${msg}` }; agentEvents.error(p); postAgent(AGENT_EVENTS.ERROR, p);} catch {}
    try { const p={ mint: tokenAddress, ended_at: new Date().toISOString(), ok: false }; agentEvents.sessionEnd(p); postAgent(AGENT_EVENTS.SESSION_END, p);} catch {}
    throw e;
  }
  console.log(chalk.gray('✅ analyzeWithGPT5Agent returned'));
  
  // Display results
  console.log(chalk.cyan.bold('\n═══════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                 📊 Analysis Results'));
  console.log(chalk.cyan.bold('═══════════════════════════════════════════════════\n'));
  
  // Token Type
  //   (needs work) 
  if (analysis.tokenType) {
    console.log(chalk.white.bold('🎯 Token Type:'), 
      analysis.tokenType === 'meme' ? chalk.magenta(analysis.tokenType.toUpperCase()) :
      analysis.tokenType === 'utility' ? chalk.blue(analysis.tokenType.toUpperCase()) :
      chalk.cyan(analysis.tokenType.toUpperCase())
    );
  }
  
  // Branch Score
  //   (needs work) basic 'summary' metric test
  console.log(chalk.white.bold('\n🌳 Branch Score:'), 
    analysis.branchScore >= 80 ? chalk.green.bold(analysis.branchScore + '/100 🚀') :
    analysis.branchScore >= 60 ? chalk.cyan(analysis.branchScore + '/100 👍') :
    analysis.branchScore >= 40 ? chalk.yellow(analysis.branchScore + '/100 😐') :
    analysis.branchScore >= 20 ? chalk.magenta(analysis.branchScore + '/100 ⚠️') :
    chalk.red.bold(analysis.branchScore + '/100 🚨')
  );
  if (analysis.branchWhy) {
    console.log(chalk.gray(`  Why: ${analysis.branchWhy}`));
  }
  
  // Risk Score
  //   (needs work) basic 'risk' metric test
  console.log(chalk.white.bold('\nRisk Score:'), 
    analysis.riskScore > 7 ? chalk.red(analysis.riskScore + '/10') :
    analysis.riskScore > 4 ? chalk.yellow(analysis.riskScore + '/10') :
    chalk.green(analysis.riskScore + '/10')
  );
  if (analysis.riskWhy) {
    console.log(chalk.gray(`  Why: ${analysis.riskWhy}`));
  }
  
  // Project Summary
  //   (needs work) 
  if (analysis.projectSummary) {
    console.log(chalk.white.bold('\n📌 Project Summary:'));
    console.log(chalk.gray(analysis.projectSummary));
  }
  
  // Communication Analysis
  //   (needs work) 
  if (analysis.communicationAnalysis) {
    console.log(chalk.white.bold('\n📣 Communication Analysis:'));
    if (analysis.communicationAnalysis.strategy) {
      console.log(chalk.gray(`  Strategy: ${analysis.communicationAnalysis.strategy}`));
    }
    if (analysis.communicationAnalysis.tweetStyle) {
      console.log(chalk.gray(`  Style: ${analysis.communicationAnalysis.tweetStyle}`));
    }
    if (analysis.communicationAnalysis.raidingBehavior) {
      console.log(chalk.gray(`  Raiding: ${analysis.communicationAnalysis.raidingBehavior}`));
    }
    if (analysis.communicationAnalysis.engagement) {
      console.log(chalk.gray(`  Engagement: ${analysis.communicationAnalysis.engagement}`));
    }
    if (analysis.communicationAnalysis.messaging) {
      console.log(chalk.gray(`  Messaging: ${analysis.communicationAnalysis.messaging}`));
    }
  }
  
  // Current Status
  //   (needs work) 
  if (analysis.currentStatus) {
    console.log(chalk.white.bold('\n🔥 Current Status:'));
    console.log(chalk.cyan(analysis.currentStatus));
  }
  
  // Red Flags
  //   (needs work) 
  if (analysis.redFlags?.length > 0) {
    console.log(chalk.red.bold('\n🚩 Red Flags:'));
    analysis.redFlags.forEach(flag => console.log(chalk.red(`  • ${flag}`)));
  }
  
  // Green Flags
  //   (needs work) 
  if (analysis.greenFlags?.length > 0) {
    console.log(chalk.green.bold('\n✅ Green Flags:'));
    analysis.greenFlags.forEach(flag => console.log(chalk.green(`  • ${flag}`)));
  }
  
  // Recommended for Deeper Analysis
  //   (needs work) 
  if (analysis.explore?.length > 0) {
    console.log(chalk.yellow.bold('\n🔍 Recommended for Deeper Analysis:'));
    analysis.explore.forEach(item => console.log(chalk.yellow(`  • ${item}`)));
  }
  
  // Overall Assessment
  //   (needs work) 
  console.log(chalk.white.bold('\n📝 Overall Assessment:'));
  console.log(chalk.gray(analysis.summary || 'No summary available'));

  // Sources (always show header; may be empty list)
  //   (needs work) 
  try {
    console.log(chalk.white.bold('\n🔗 Sources:'));
    const cites = analysis?.metadata?.web_citations || [];
    const seen = new Set();
    for (const c of cites) {
      const url = c.url || '';
      if (url && !seen.has(url)) {
        seen.add(url);
        const title = c.title ? ` (${c.title})` : '';
        console.log(chalk.gray(`  • ${url}${title}`));
      }
    }
  } catch {}
  
  // Save the analysis to new reports directory (Preserve ALL market data instead of stripping to just 3 fields)
  //   (needs work) 
  try {
    analysis.metadata = analysis.metadata || {};
    const srcMarket = (analysis.metadata.market || analysis.market || {});
    
    if (srcMarket && typeof srcMarket === 'object') {
      // Preserve ALL market data
      const marketData = { ...srcMarket };
      // Fix volume field naming inconsistency (vol24h -> volume24h)
      if ('vol24h' in marketData && !('volume24h' in marketData)) {
        marketData.volume24h = marketData.vol24h;
      }
      analysis.metadata.market = marketData;
    } else {
      // Fallback for empty/invalid market data
      analysis.metadata.market = { fdv: null, liquidity: null, volume24h: null };
    }
  } catch {}

  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  
  // Save the analysis to new reports directory
  // TODO: Needs better path name for the report (e.g. token address, timestamp, etc.)
  const outputPath = path.join(
    REPORTS_BASE,
    `gpt5-analysis-${tokenAddress}-${timestamp}.json`
  );
  
  // Emit process step end (step: "finalize")
  try { emitProcess('process:step_end', { mint: tokenAddress, step: 'finalize', ok: true, at: new Date().toISOString() }); } catch {}
  
  // Emit process step start (step: "persist")
  try { emitProcess('process:step_start', { mint: tokenAddress, step: 'persist', at: new Date().toISOString() }); } catch {}
  
  // Write the analysis to the output path
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
  console.log(chalk.green(`\n✓ Analysis saved to: ${outputPath}`));
  
  // Update per-mint latest symlink for quick access
  // TODO: Needs better path name for the symlink (e.g. token address, timestamp, etc.)
  try {
    const latestLink = path.join(REPORTS_BASE, `latest-${tokenAddress}.json`);
    try { fs.unlinkSync(latestLink); } catch {}
    fs.symlinkSync(outputPath, latestLink);
  } catch {}

  // Emit final JSON
  try { const p={ mint: tokenAddress, at: new Date().toISOString(), file: outputPath, data: analysis }; agentEvents.finalJson(p); postAgent(AGENT_EVENTS.FINAL_JSON, p);} catch {}

  // Save the analysis to a markdown file
  if (ENABLE_MARKDOWN) {
    const mdPath = outputPath.replace(/\.json$/, '.md');
    const md = toMarkdown(analysis);
    if (md) { fs.writeFileSync(mdPath, md); console.log(chalk.green(`✓ Markdown saved to: ${mdPath}`)); }
  }

  // Append metrics log for timing analysis (for debugging)
  try {
    const t = analysis?.metadata?.timings || {};
    const usedOhlcv = (t.ohlcv_ms ?? 0) > 0;
    const logLine = [
      new Date().toISOString(),
      tokenAddress,
      usedOhlcv ? '1' : '0',
      t.total_ms ?? '',
      t.socials_ms ?? '',
      t.ohlcv_ms ?? '',
      t.llm_round1_ms ?? '',
      t.llm_round2_ms ?? ''
    ].join(',') + '\n';
    fs.appendFileSync(path.join(REPORTS_BASE, 'metrics.log'), logLine);
  } catch {}

  // Persist final analysis components, metadata, and full JSON to DB (table: ai_token_analyses)
  //   (needs work; MORE DATA!; more fields!) 
  try {
    await prisma.ai_token_analyses.create({
      data: {
        token_address: tokenAddress,
        model: analysis?.metadata?.model || null,
        api: analysis?.metadata?.api || null,
        tool_calls_made: analysis?.metadata?.tool_calls_made || 0,
        timings: analysis?.metadata?.timings || {},
        web_search_used: analysis?.metadata?.web_search_used ?? null,
        web_citations: analysis?.metadata?.web_citations || [],
        token_type: analysis?.tokenType || null,
        branch_score: typeof analysis?.branchScore === 'number' ? analysis.branchScore : null,
        risk_score: typeof analysis?.riskScore === 'number' ? analysis.riskScore : null,
        summary: analysis?.summary || null,
        project_summary: analysis?.projectSummary || null,
        file_path: outputPath,
        analysis_json: analysis
      }
    });
    console.log(chalk.green('✓ Analysis persisted to DB (ai_token_analyses)'));
  } catch (e) {
    console.log(chalk.yellow('⚠️  Failed to persist analysis to DB:'), e?.message);
  }
  try { emitProcess('process:step_end', { mint: tokenAddress, step: 'persist', ok: true, at: new Date().toISOString() }); } catch {}
  
  // Done!
  console.log(chalk.cyan.bold('\n═══════════════════════════════════════════════════\n'));

  // Emit session end (step: "session_end")
  try { const p={ mint: tokenAddress, ended_at: new Date().toISOString(), ok: true, branchScore: analysis?.branchScore ?? null, riskScore: analysis?.riskScore ?? null }; agentEvents.sessionEnd(p); postAgent(AGENT_EVENTS.SESSION_END, p);} catch {}
}

// Run the analyzer with clean shutdown so the process exits
// TODO: Needs better error handling and logging
main()
  .then(async () => {
    try { await prisma.$disconnect(); } catch {}
    // Let the event loop drain; if nothing else is pending, process will exit naturally
  })
  .catch(async (err) => {
    try { console.error(err); } catch {}
    try { await prisma.$disconnect(); } catch {}
    // Non-zero exit code on failure
    try { process.exitCode = 1; } catch {}
  });
