#!/usr/bin/env node

// token-ai/socials/fetch-beta-x.js

process.on('uncaughtException', (err) => { console.error('[uncaughtException]', (err && err.stack) || err); process.exit(1); });
process.on('unhandledRejection', (reason) => { console.error('[unhandledRejection]', (reason && reason.stack) || reason); process.exit(1); });

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { chromium } from 'playwright';
import prisma from '../../config/prisma.js';
import { scrapeTwitter } from './twitter/scrape.js';
import { persistTwitterData } from './twitter/persist.js';
import { ensureReportsDir, REPORTS_DIR, TWITTER_SESSION_PATH, getTimestamp, parseMetricCount, normalizeJoinDate } from './common.js';
import { ensure_token_enriched } from './tools/foundation.js';

console.log('\n[Beta-X] Starting X (Twitter) refactor script...');

async function main() {
  const args = process.argv.slice(2);
  const mintAddress = args.find(a => !a.startsWith('--')) || null;
  const debugScreenshots = args.includes('--debug') || process.env.SOCIAL_DEBUG_SCREENSHOT === '1';
  const collectMembers = args.includes('--collect-members') || process.env.SOCIAL_COLLECT_MEMBERS === '1';
  const maxMembersArg = args.find(a => a.startsWith('--max-members='));
  const maxMembers = maxMembersArg ? parseInt(maxMembersArg.split('=')[1], 10) : (process.env.SOCIAL_MAX_MEMBERS ? parseInt(process.env.SOCIAL_MAX_MEMBERS, 10) : 50);
  const enrichReplies = !args.includes('--no-enrich-replies') && (process.env.SOCIAL_ENRICH_REPLIES !== '0');
  const searchMaxSecs = parseInt(process.env.SOCIAL_SEARCH_MAX_SECS || '15', 10);
  const searchMaxTweets = parseInt(process.env.SOCIAL_SEARCH_MAX_TWEETS || '60', 10);
  const doRefreshEnrich = !args.includes('--no-refresh-enrich') && (process.env.SOCIALS_REFRESH_ENRICH !== '0');

  ensureReportsDir();

  let tokens = [];
  if (mintAddress) {
    const token = await prisma.tokens.findFirst({ where: { address: mintAddress }, include: { token_socials: true, token_websites: true } });
    if (!token) {
      console.log(chalk.red(`Token not found in DB: ${mintAddress}`));
      process.exit(1);
    }
    tokens = [token];
  } else {
    tokens = await prisma.tokens.findMany({ where: { is_active: true }, take: 3, orderBy: { updated_at: 'desc' }, include: { token_socials: true, token_websites: true } });
  }

  if (!fs.existsSync(TWITTER_SESSION_PATH)) {
    console.log(chalk.yellow('Twitter session file not found at'), TWITTER_SESSION_PATH);
    console.log(chalk.gray('To create session: Run scripts/twitter/utils/twitter-login-and-save-session.cjs locally'));
  }
  const browser = await chromium.launch({ headless: true });
  const twitterContext = await browser.newContext({ storageState: fs.existsSync(TWITTER_SESSION_PATH) ? TWITTER_SESSION_PATH : undefined });

  const allTokenData = [];

  for (const token of tokens) {
    console.log(chalk.cyan.bold(`\n╔══════════════════════════════════════════════════════════════╗`));
    console.log(chalk.cyan.bold(`║   𝕏 Twitter/X Analysis: ${token.symbol || token.name || token.address}   ║`));
    console.log(chalk.cyan.bold(`╚══════════════════════════════════════════════════════════════╝`));

    const tokenData = {
      name: token.name,
      symbol: token.symbol,
      address: token.address,
      description: token.description,
      image_url: token.image_url,
      socials_from_db: token.token_socials?.map(s => ({ type: s.type, url: s.url })) || [],
      websites_from_db: token.token_websites?.map(w => ({ label: w.label, url: w.url })) || [],
      twitter_data: null,
    };

    try {
      const twitterUrl = token.token_socials?.find(s => s.type === 'twitter')?.url;
      if (!twitterUrl) {
        console.log(chalk.gray('No Twitter URL for token; skipping.'));
      } else {
        // Quick enrichment refresh even if already enriched (no poll) to catch updated socials
        if (doRefreshEnrich) { try { await ensure_token_enriched(token.address, { timeoutSec: 0, poll: false }); } catch {} }
        const page = await twitterContext.newPage();
        const twitter_data = await scrapeTwitter(token, {
          page,
          context: twitterContext,
          twitterUrl,
          debugScreenshots,
          collectMembers,
          maxMembers,
          enrichReplies,
          searchMaxSecs,
          searchMaxTweets,
        });
        await page.close();
        tokenData.twitter_data = twitter_data;
      }
    } catch (e) {
      tokenData.twitter_data = { scrapeSuccess: false, error: e.message };
      console.log(chalk.red(`❌ X scrape failed: ${e.message}`));
    }

    try {
      const res = await persistTwitterData(token.address, tokenData, { parseMetricCount, normalizeJoinDate });
      const tweetsLen = tokenData.twitter_data?.recentTweets?.length || 0;
      if (tweetsLen > 0) {
        console.log(chalk.green(`   ✅ Persisted (tweets: ${tweetsLen}, created: ${res.tweetsCreated}, updated: ${res.tweetsUpdated})`));
      } else {
        console.log(chalk.green(`   ✅ Persisted`));
      }
    } catch (e) {
      console.log(chalk.red(`   ❌ Persist failed: ${e.message}`));
    }

    allTokenData.push(tokenData);
  }

  const timestamp = getTimestamp();
  const reportPath = path.join(REPORTS_DIR, `beta-x-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(allTokenData, null, 2));
  console.log(chalk.yellow.bold(`\n💾 Report saved to: ${reportPath}`));
  console.log(`REPORT_FILE:${reportPath}`);

  await twitterContext.close();
  await browser.close();
  return allTokenData;
}

main()
  .then(async () => { console.log('\n[Beta-X] Completed.'); try { await prisma.$disconnect(); } catch {}; process.exit(0); })
  .catch(async (err) => { console.error('\n[FATAL]', (err && err.stack) || err); try{ await prisma.$disconnect(); } catch{} process.exit(1); });
