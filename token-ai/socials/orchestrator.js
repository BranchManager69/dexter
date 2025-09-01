#!/usr/bin/env node

// token-ai/socials/orchestrator.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import prisma from '../../config/prisma.js';
import { ensureReportsDir, REPORTS_DIR, TWITTER_SESSION_PATH } from './common.js';
import { ensure_token_activated, ensure_token_enriched } from './tools/foundation.js';
import { fetch_market_overview } from './tools/market.js';
import { extract_website_content } from './tools/websites.js';
import { discover_official_links } from './tools/discovery.js';
import { get_telegram_group_meta } from './tools/telegram.js';
import { get_twitter_profile, get_twitter_recent_tweets, get_twitter_community_meta, get_twitter_community_posts, get_twitter_community_members } from './tools/twitter.js';
import { persistTwitterData } from './twitter/persist.js';
import { parseMetricCount, normalizeJoinDate } from './common.js';
import { chromium } from 'playwright';
import pLimit from 'p-limit';

function parseArgs(argv) {
  const args = { flags: new Set(), kv: {}, mint: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.split('=');
      if (v !== undefined) args.kv[k.replace(/^--/, '')] = v; else args.flags.add(k.replace(/^--/, ''));
    } else if (!args.mint) {
      args.mint = a;
    }
  }
  return args;
}

// Default macro excludes telegram; explicit --steps can include it.
const DEFAULT_STEPS = new Set(['market','website','x']);
function should(step, stepsSet) {
  return stepsSet.size === 0 ? DEFAULT_STEPS.has(step) : stepsSet.has(step);
}

function trace(step, status, extra={}){
  try {
    const base = { step, status, ts: new Date().toISOString(), ...extra };
    const text = JSON.stringify(base);
    if (status === 'start') console.log(chalk.cyan(`[trace] ${text}`));
    else if (status === 'end') console.log(chalk.green(`[trace] ${text}`));
    else if (status === 'skip') console.log(chalk.yellow(`[trace] ${text}`));
    else console.log(`[trace] ${text}`);
  } catch {}
}

async function main() {
  const { kv, mint } = parseArgs(process.argv);
  const limit = parseInt(kv.limit || '3', 10);
  const steps = (kv.steps || '').split(',').map(s => s.trim()).filter(Boolean);
  const stepsSet = new Set(steps);
  const collectMembers = kv['collect-members'] === '1' || kv['collect-members'] === 'true' || false;
  const maxMembers = kv['max-members'] ? parseInt(kv['max-members'], 10) : 50;
  const enrichTimeoutSec = parseInt(process.env.SOCIALS_ENRICH_TIMEOUT || '30', 10);
  const refreshEnrich = (kv['no-refresh-enrich'] === undefined) && (process.env.SOCIALS_REFRESH_ENRICH !== '0');
  const refreshPollSecs = parseInt(process.env.SOCIALS_REFRESH_POLL_SECS || '5', 10);
  const refreshPollIntervalMs = parseInt(process.env.SOCIALS_REFRESH_POLL_INTERVAL_MS || '1000', 10);

  ensureReportsDir();

  // Shared browsers/contexts for parallelized steps
  const webBrowser = await chromium.launch({ headless: true });
  const twitterBrowser = await chromium.launch({ headless: true });
  const storage = fs.existsSync(TWITTER_SESSION_PATH) ? TWITTER_SESSION_PATH : undefined;
  const twitterContext = await twitterBrowser.newContext({ storageState: storage });
  // Limit X concurrency with gentle mitigations (default 1, max 2)
  const parsedXC = parseInt(kv['x-concurrency'] || process.env.SOCIALS_X_CONCURRENCY || '2', 10);
  const xConcurrency = Math.min(Math.max(isNaN(parsedXC)?1:parsedXC, 1), 2);
  const xLimit = pLimit(xConcurrency);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const jitter = (min=250, max=800) => Math.floor(Math.random()*(max-min+1))+min;

  let tokens = [];
  if (mint) {
    let t = await prisma.tokens.findFirst({ where: { address: mint }, include: { token_socials: true, token_websites: true } });
    if (!t) {
      console.log(chalk.yellow(`Token ${mint} not found in DB → activating...`));
      const res = await ensure_token_activated(mint);
      if (!res.activated && !res.created) {
        console.log(chalk.red(`Activation failed: ${res.error || 'unknown error'}`));
        process.exit(1);
      }
      t = await prisma.tokens.findFirst({ where: { address: mint }, include: { token_socials: true, token_websites: true } });
      if (!t) {
        console.log(chalk.red('Token still not present. Try again shortly.'));
        process.exit(1);
      }
    }
    tokens = [t];
  } else {
    tokens = await prisma.tokens.findMany({ where: { is_active: true }, take: isNaN(limit) ? 3 : limit, orderBy: { updated_at: 'desc' }, include: { token_socials: true, token_websites: true } });
  }

  const results = [];
  for (const token of tokens) {
    console.log(chalk.cyan.bold(`\n════════ ORCHESTRATION: ${token.symbol || token.name || token.address} ════════`));

    const enrichedCount = (token.token_socials?.length || 0) + (token.token_websites?.length || 0);
    if (enrichedCount === 0) {
      console.log(chalk.yellow('No socials/websites yet → triggering enrich...'));
      await ensure_token_enriched(token.address, { timeoutSec: enrichTimeoutSec, poll: true });
    } else if (refreshEnrich) {
      // Quick refresh enrich even when already enriched (no polling)
      try {
        console.log(chalk.gray('Refreshing enrichment (quick, no poll)...'));
        // Capture signature before
        const sig = (t) => {
          const s = (t.token_socials||[]).map(x=>`${(x.type||'').toLowerCase()}:${x.url||''}`).sort().join('|');
          const w = (t.token_websites||[]).map(x=>`${(x.label||'').toLowerCase()}:${x.url||''}`).sort().join('|');
          return `${s}__${w}`;
        };
        const beforeSig = sig(token);
        const start = Date.now();
        await ensure_token_enriched(token.address, { timeoutSec: 0, poll: false });
        let detected = false;
        // First (and only) window: short poll
        while ((Date.now() - start) < refreshPollSecs * 1000) {
          const tcheck = await prisma.tokens.findFirst({ where: { address: token.address }, include: { token_socials: true, token_websites: true } });
          if (!tcheck) break;
          if (sig(tcheck) !== beforeSig) { detected = true; break; }
          await new Promise(r => setTimeout(r, refreshPollIntervalMs));
        }
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        if (detected) console.log(chalk.gray(`Refresh change detected after ${elapsed}s`));
        else console.log(chalk.gray(`No refresh change within ${refreshPollSecs}s; continuing`));
      } catch {}
    }
    const t2 = await prisma.tokens.findFirst({ where: { address: token.address }, include: { token_socials: true, token_websites: true } });

    // Compute DB-level deltas (socials/websites) between pre-refresh (token) and post-refresh (t2)
    const normSocials = (t) => (t.token_socials || []).map(s => ({ type: (s.type || '').toLowerCase(), url: s.url || null }));
    const normWebs = (t) => (t.token_websites || []).map(w => ({ label: (w.label || '').toLowerCase(), url: w.url || null }));
    const beforeSocials = normSocials(token);
    const afterSocials = normSocials(t2);
    const beforeWebs = normWebs(token);
    const afterWebs = normWebs(t2);
    const diffByKey = (arrA, arrB, key) => {
      const mapA = new Map(arrA.map(x => [x[key], x]));
      const mapB = new Map(arrB.map(x => [x[key], x]));
      const added = []; const removed = []; const modified = [];
      for (const [k, vB] of mapB.entries()) {
        if (!mapA.has(k)) { added.push(vB); continue; }
        const vA = mapA.get(k);
        const keys = new Set([...Object.keys(vA), ...Object.keys(vB)]);
        let changed = false;
        for (const kk of keys) { if (kk === key) continue; if ((vA[kk] || null) !== (vB[kk] || null)) { changed = true; break; } }
        if (changed) modified.push({ key: k, before: vA, after: vB });
      }
      for (const [k, vA] of mapA.entries()) { if (!mapB.has(k)) removed.push(vA); }
      return { added, removed, modified };
    };
    const socialsChanges = diffByKey(beforeSocials, afterSocials, 'type');
    const websitesChanges = diffByKey(beforeWebs, afterWebs, 'label');

    const entry = {
      name: t2.name,
      symbol: t2.symbol,
      address: t2.address,
      socials_from_db: (t2.token_socials || []).map(s => ({ type: s.type, url: s.url })),
      websites_from_db: (t2.token_websites || []).map(w => ({ label: w.label, url: w.url })),
      socials_change_summary: socialsChanges,
      websites_change_summary: websitesChanges,
      market: null,
      website: null,
      telegram: null,
      twitter: null,
      discovered_official_links: [],
    };

    // Build parallel tasks per token (safe concurrency)
    const tasks = [];

    if (should('market', stepsSet)) {
      tasks.push((async () => {
        const t0 = Date.now();
        trace('market','start',{ address: t2.address });
        try {
          entry.market = await fetch_market_overview(t2.address);
          if (entry.market?.success) {
            const m = entry.market; console.log(chalk.white(`Market: fdv=${m.fdv || 'N/A'} liq=${m.liquidity || 'N/A'} vol24h=${m.vol24h || 'N/A'}`));
          }
        } catch (e) {
          console.log(chalk.yellow(`[market] error: ${e?.message||e}`));
        } finally {
          trace('market','end',{ ms: Date.now()-t0, ok: !!(entry.market&&entry.market.success) });
        }
      })());
    }

    if (should('website', stepsSet)) {
      tasks.push((async () => {
        const t0 = Date.now();
        const pickWebsiteUrl = () => {
          const socialSite = (t2.token_socials || []).find(s => (s.type || '').toLowerCase() === 'website');
          if (socialSite?.url) return socialSite.url;
          const sites = t2.token_websites || [];
          if (sites.length === 0) return null;
          const bad = ['docs', 'streamflow', 'coingecko'];
          const good = sites.filter(w => !bad.some(b => (w.label || '').toLowerCase().includes(b)));
          return (good[0] || sites[0]).url;
        };
        const url = pickWebsiteUrl();
        trace('website','start',{ url: url||null });
        if (url) {
          const shotDir = path.join(REPORTS_DIR, 'websites', t2.address);
          try {
            entry.website = await extract_website_content(url, { screenshotDir: shotDir, browser: webBrowser, headless: true, timeoutMs: 30000 });
          } catch (e) {
            entry.website = { success: false, url, error: e.message };
          }
        }
        trace('website','end',{ ms: Date.now()-t0, ok: !!(entry.website&&entry.website.success), url: url||null });
      })());
    }

    if (should('telegram', stepsSet)) {
      tasks.push((async () => {
        const t0 = Date.now();
        const tgUrl = (t2.token_socials || []).find(s => (s.type || '').toLowerCase() === 'telegram')?.url;
        trace('telegram','start',{ url: tgUrl||null });
        if (tgUrl) entry.telegram = await get_telegram_group_meta(tgUrl);
        trace('telegram','end',{ ms: Date.now()-t0, ok: !!entry.telegram, url: tgUrl||null });
      })());
    } else {
      // Explicitly mark skipped so downstream UI can distinguish from pending
      entry.telegram = { skipped: true, reason: 'disabled_by_default' };
      trace('telegram','skip',{ reason: 'disabled_by_default' });
    }

    if (should('x', stepsSet) || should('twitter', stepsSet)) {
      tasks.push(xLimit(async () => {
        const t0 = Date.now();
        const twUrl = (t2.token_socials || []).find(s => (s.type || '').toLowerCase() === 'twitter')?.url;
        if (!twUrl) return;
        trace('twitter','start',{ url: twUrl });
        await sleep(jitter());
        const profile = await get_twitter_profile({ token: t2, twitterUrl: twUrl, context: twitterContext });
        await sleep(jitter());
        const tweets = await get_twitter_recent_tweets({ token: t2, twitterUrl: twUrl, context: twitterContext, limit: 60, include_replies: true });
        let community = null, posts = [], members = null;
        if (twUrl.includes('/i/communities/')) {
          await sleep(jitter());
          community = await get_twitter_community_meta({ token: t2, twitterUrl: twUrl, context: twitterContext });
          await sleep(jitter());
          posts = await get_twitter_community_posts({ token: t2, twitterUrl: twUrl, context: twitterContext, limit: 10 });
          if (collectMembers) members = await get_twitter_community_members({ token: t2, twitterUrl: twUrl, context: twitterContext, limit: maxMembers });
        }
        const twitter_data = { ...profile, recentTweets: tweets, community, communityPosts: posts, communityMembers: members };
        entry.twitter = twitter_data;
        try {
          await persistTwitterData(t2.address, { twitter_data: twitter_data, socials_from_db: entry.socials_from_db }, { parseMetricCount, normalizeJoinDate });
        } catch {}
        trace('twitter','end',{ ms: Date.now()-t0, ok: !!entry.twitter, url: twUrl });
      }));
    }

    await Promise.allSettled(tasks);

    entry.discovered_official_links = discover_official_links(entry.socials_from_db, entry.website ? [entry.website] : []);
    results.push(entry);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORTS_DIR, `orchestrated-analysis-${ts}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(chalk.yellow.bold(`\n💾 Report saved to: ${reportPath}`));
  console.log(`REPORT_FILE:${reportPath}`);

  try { await twitterContext?.close(); } catch {}
  try { await twitterBrowser?.close(); } catch {}
  try { await webBrowser?.close(); } catch {}
  try { await prisma.$disconnect(); } catch {}
}

main().catch(async (e) => { console.error('[Orchestrator FATAL]', e?.stack || e); try { await prisma.$disconnect(); } catch {}; process.exit(1); });
