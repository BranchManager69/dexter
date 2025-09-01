#!/usr/bin/env node

// token-ai/socials/fetch-beta-telegram.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import prisma from '../../config/prisma.js';
import { ensureReportsDir, REPORTS_DIR } from './common.js';
import { ensure_token_activated, ensure_token_enriched } from './tools/foundation.js';
import { get_telegram_group_meta } from './tools/telegram.js';

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

async function main() {
  const { kv, mint } = parseArgs(process.argv);
  const limit = parseInt(kv.limit || process.env.SOCIALS_TELEGRAM_LIMIT || '3', 10);
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
    console.log(chalk.cyan.bold(`\n════════ TELEGRAM ANALYSIS: ${token.symbol || token.name || token.address} ════════`));

    // Ensure enrichment exists to discover socials
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

    const t2 = await prisma.tokens.findFirst({ where: { address: token.address }, include: { token_socials: true, token_websites: true } });
    const tgUrl = (t2.token_socials || []).find(s => (s.type || '').toLowerCase() === 'telegram')?.url;

    const tokenData = {
      name: token.name,
      symbol: token.symbol,
      address: token.address,
      telegram_url: tgUrl || null,
      telegram_data: null,
    };

    if (!tgUrl) {
      console.log(chalk.gray('No Telegram URL available'));
    } else {
      const meta = await get_telegram_group_meta(tgUrl);
      tokenData.telegram_data = meta;
      if (meta.scrapeSuccess) {
        console.log(chalk.green('✅ Telegram meta fetched'));
        console.log(chalk.white(`  Title : ${meta.title || 'N/A'}`));
        console.log(chalk.white(`  Type  : ${meta.type || 'N/A'}`));
        if (meta.memberCount != null) console.log(chalk.white(`  Members: ${meta.memberCount.toLocaleString?.() || meta.memberCount}`));
        if (meta.hasProtectedContent) console.log(chalk.yellow('  🔒 Protected content (forwarding disabled)'));
      } else {
        console.log(chalk.yellow(`⚠️  Telegram meta unavailable: ${meta.error || 'Unknown error'}`));
      }
    }

    all.push(tokenData);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORTS_DIR, `telegram-analysis-${ts}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(all, null, 2));
  console.log(chalk.yellow.bold(`\n💾 Report saved to: ${reportPath}`));
  console.log(`REPORT_FILE:${reportPath}`);

  try { await prisma.$disconnect(); } catch {}
}

main().catch(async (e) => { console.error('[Telegram FATAL]', e?.stack || e); try { await prisma.$disconnect(); } catch {}; process.exit(1); });
