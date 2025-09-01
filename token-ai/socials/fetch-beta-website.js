#!/usr/bin/env node

// token-ai/socials/fetch-beta-website.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import prisma from '../../config/prisma.js';
import { ensureReportsDir, REPORTS_DIR } from './common.js';
import { ensure_token_activated, ensure_token_enriched } from './tools/foundation.js';
import { extract_website_content } from './tools/websites.js';
import { discover_official_links } from './tools/discovery.js';

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

function pickWebsiteUrl(token) {
  // 1) Prefer token_socials with type=website
  const socialSite = (token.token_socials || []).find(s => (s.type || '').toLowerCase() === 'website');
  if (socialSite?.url) return socialSite.url;
  // 2) Otherwise choose from token_websites using behemoth-like heuristics
  const sites = token.token_websites || [];
  if (sites.length === 0) return null;
  const bad = ['docs', 'streamflow', 'coingecko'];
  const good = sites.filter(w => !bad.some(b => (w.label || '').toLowerCase().includes(b)));
  return (good[0] || sites[0]).url;
}

async function main() {
  const { flags, kv, mint } = parseArgs(process.argv);
  const limit = parseInt(kv.limit || process.env.SOCIALS_WEBSITE_LIMIT || '3', 10);
  const noRender = flags.has('no-render');
  const enrichTimeoutSec = parseInt(process.env.SOCIALS_ENRICH_TIMEOUT || '30', 10);
  const refreshEnrich = (kv['no-refresh-enrich'] === undefined) && (process.env.SOCIALS_REFRESH_ENRICH !== '0');
  const refreshPollSecs = parseInt(process.env.SOCIALS_REFRESH_POLL_SECS || '5', 10);
  const refreshPollIntervalMs = parseInt(process.env.SOCIALS_REFRESH_POLL_INTERVAL_MS || '1000', 10);

  ensureReportsDir();

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
      // Refetch
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

  const all = [];
  for (const token of tokens) {
    console.log(chalk.cyan.bold(`\n════════ WEBSITE ANALYSIS: ${token.symbol || token.name || token.address} ════════`));

    // Ensure token has enrichment (socials/websites present) before scrape
    const enrichedCount = (token.token_socials?.length || 0) + (token.token_websites?.length || 0);
    if (enrichedCount === 0) {
      console.log(chalk.yellow('No socials/websites yet → triggering enrich...'));
      const e = await ensure_token_enriched(token.address, { timeoutSec: enrichTimeoutSec, poll: true });
      if (!e.enriched) console.log(chalk.gray('Enrich did not complete within timeout; proceeding anyway'));
    } else if (refreshEnrich) {
      try {
        console.log(chalk.gray('Refreshing enrichment (quick, no poll)...'));
        const sig = (t) => {
          const s = (t.token_socials||[]).map(x=>`${(x.type||'').toLowerCase()}:${x.url||''}`).sort().join('|');
          const w = (t.token_websites||[]).map(x=>`${(x.label||'').toLowerCase()}:${x.url||''}`).sort().join('|');
          return `${s}__${w}`;
        };
        const beforeSig = sig(token);
        const start = Date.now();
        await ensure_token_enriched(token.address, { timeoutSec: 0, poll: false });
        let detected = false;
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

    // Refresh token links after potential enrich
    const t2 = await prisma.tokens.findFirst({ where: { address: token.address }, include: { token_socials: true, token_websites: true } });
    const dbLinks = t2.token_socials?.map(s => ({ type: s.type, url: s.url })) || [];
    const dbWebsites = t2.token_websites?.map(w => ({ label: w.label, url: w.url })) || [];

    const websiteUrl = pickWebsiteUrl(t2);
    let siteResult = null;
    if (websiteUrl) {
      console.log(chalk.yellow(`Analyzing website: ${websiteUrl}`));
      const shotDir = path.join(REPORTS_DIR, 'websites', token.address);
      try {
        siteResult = await extract_website_content(websiteUrl, { screenshotDir: shotDir, headless: true, timeoutMs: 30000, ...(noRender ? { browser: null, headless: true } : {}) });
        if (siteResult?.success) {
          console.log(chalk.green('✅ Extracted')); 
          const st = siteResult.stats || {};
          console.log(chalk.white(`  Title: ${siteResult.meta?.title || 'N/A'}`));
          if (siteResult.meta?.description) console.log(chalk.white(`  Description: ${String(siteResult.meta.description).substring(0,160)}${siteResult.meta.description.length>160?'…':''}`));
          console.log(chalk.white(`  Text: ${st.totalTextLength || 0} chars, Links: ${st.linkCount || 0}, Headers: ${st.headerCount || 0}`));
          if (siteResult.detectedAddresses?.all?.length) {
            const da = siteResult.detectedAddresses;
            console.log(chalk.white(`  Solana addresses: ${da.all.length} (wallets: ${da.onCurve?.length||0}, PDAs: ${da.offCurve?.length||0})`));
          }
          if (siteResult.screenshot?.path) console.log(chalk.gray(`  Screenshot: ${siteResult.screenshot.path}`));
        } else {
          console.log(chalk.red(`❌ Failed to extract: ${siteResult?.error || 'Unknown error'}`));
        }
      } catch (e) {
        console.log(chalk.red(`❌ Website extraction error: ${e.message}`));
        siteResult = { success: false, url: websiteUrl, error: e.message };
      }
    } else {
      console.log(chalk.gray('No website available for analysis'));
    }

    // Discovery: merge DB links + site socials
    const discovered = discover_official_links(dbLinks, siteResult ? [siteResult] : []);

    const tokenData = {
      name: token.name,
      symbol: token.symbol,
      address: token.address,
      description: token.description,
      image_url: token.image_url,
      socials_from_db: dbLinks,
      websites_from_db: dbWebsites,
      website_data: siteResult,
      discovered_official_links: discovered,
    };
    all.push(tokenData);
  }

  // Save report
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORTS_DIR, `website-analysis-${ts}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(all, null, 2));
  console.log(chalk.yellow.bold(`\n💾 Report saved to: ${reportPath}`));
  console.log(`REPORT_FILE:${reportPath}`);

  try { await prisma.$disconnect(); } catch {}
}

main().catch(async (e) => { console.error('[Website FATAL]', e?.stack || e); try { await prisma.$disconnect(); } catch {}; process.exit(1); });
