#!/usr/bin/env node

// token-ai/socials/history-twitter.js

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import prisma from '../../config/prisma.js';
import { ensureReportsDir, REPORTS_DIR } from './common.js';

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

function parseSince(kv) {
  if (kv['since-time']) {
    const d = new Date(kv['since-time']);
    if (!isNaN(d.getTime())) return d;
  }
  if (kv['since-days']) {
    const days = parseFloat(kv['since-days']);
    if (!isNaN(days) && days > 0) return new Date(Date.now() - days * 86400_000);
  }
  return null;
}

async function main() {
  const { flags, kv, mint } = parseArgs(process.argv);
  if (!mint) {
    console.error('Usage: npm run socials:history:twitter -- <MINT> [--limit=100] [--since-days=7|--since-time=ISO] [--include-replies=0] [--include-retweets=0] [--include-deleted=1] [--include-snapshots=0] [--snapshots-limit=20]');
    process.exit(1);
  }

  const limit = kv.limit ? parseInt(kv.limit, 10) : 100;
  const since = parseSince(kv);
  const boolTrue = (v, def=true) => v === undefined ? def : (v === '1' || v === 'true');
  const boolFalse = (v, def=false) => v === undefined ? def : (v === '1' || v === 'true');
  // Defaults: include replies/retweets/snapshots by default; exclude deleted by default
  const includeReplies = boolTrue(kv['include-replies'], true);
  const includeRetweets = boolTrue(kv['include-retweets'], true);
  const includeDeleted = boolFalse(kv['include-deleted'], false);
  const includeSnapshots = boolTrue(kv['include-snapshots'], true);
  const snapshotsLimit = kv['snapshots-limit'] ? parseInt(kv['snapshots-limit'], 10) : 20;
  const handleFilter = kv['author'] || null;

  ensureReportsDir();

  console.log(chalk.cyan.bold(`\n════════ TWITTER HISTORY: ${mint} ════════`));

  const where = { token_address: mint };
  if (!includeReplies) where.is_reply = false;
  if (!includeRetweets) where.is_retweet = false;
  if (!includeDeleted) where.deleted_at = null;
  if (handleFilter) where.author_handle = handleFilter;
  if (since) where.tweet_timestamp = { gte: since };

  let tweets = [];
  let snapshots = [];
  try {
    tweets = await prisma.twitter_tweets.findMany({
      where,
      orderBy: { tweet_timestamp: 'desc' },
      take: isNaN(limit) ? 100 : limit,
    });
  } catch (e) {
    console.error(chalk.red('Failed to query tweets:'), e.message);
  }
  if (includeSnapshots) {
    try {
      const whereSnap = { token_address: mint };
      if (since) whereSnap.snapshot_time = { gte: since };
      try {
        snapshots = await prisma.twitter_snapshots.findMany({
          where: whereSnap,
          orderBy: { snapshot_time: 'desc' },
          take: isNaN(snapshotsLimit) ? 20 : snapshotsLimit,
        });
      } catch {
        // Fallback if created_at column is absent
        snapshots = await prisma.twitter_snapshots.findMany({
          where: { token_address: mint },
          take: isNaN(snapshotsLimit) ? 20 : snapshotsLimit,
        });
      }
    } catch (e) {
      console.error(chalk.red('Failed to query snapshots:'), e.message);
    }
  }

  const summary = {
    mint,
    filters: { limit, since: since?.toISOString() || null, includeReplies, includeRetweets, includeDeleted, author: handleFilter },
    count: tweets.length,
  };

  console.log(chalk.white(`Found ${tweets.length} tweets${since ? ` since ${since.toISOString()}` : ''}`));
  if (tweets[0]) {
    console.log(chalk.gray(`Latest: ${tweets[0].tweet_timestamp?.toISOString?.() || tweets[0].tweet_timestamp} — ${tweets[0].tweet_url || tweets[0].tweet_id}`));
  }

  // Compute snapshot deltas if we have 2+
  let snapshot_summary = null;
  let snapshot_deltas = [];
  if (includeSnapshots && Array.isArray(snapshots) && snapshots.length > 0) {
    // Normalize time field
    const norm = (s) => ({
      time: s.snapshot_time || s.created_at || s.first_seen_at || null,
      followers: s.follower_count ?? null,
      following: s.following_count ?? null,
      tweet_count: s.tweet_count ?? null,
      is_verified: s.is_verified ?? null,
      handle: s.handle ?? null,
      display_name: s.display_name ?? null,
      raw: s,
    });
    const series = snapshots.map(norm).filter(x => x.time).sort((a,b)=> new Date(b.time) - new Date(a.time)); // desc
    if (series.length) {
      const latest = series[0];
      const oldest = series[series.length-1];
      const dtHours = (new Date(latest.time) - new Date(oldest.time)) / 3600_000;
      const fDelta = (latest.followers ?? 0) - (oldest.followers ?? 0);
      const foDelta = (latest.following ?? 0) - (oldest.following ?? 0);
      const tDelta = (latest.tweet_count ?? 0) - (oldest.tweet_count ?? 0);
      snapshot_summary = {
        count: series.length,
        latest: latest.time,
        oldest: oldest.time,
        hours_between: dtHours,
        followers: { latest: latest.followers, oldest: oldest.followers, delta: fDelta, per_hour: dtHours>0 ? fDelta/dtHours : null },
        following: { latest: latest.following, oldest: oldest.following, delta: foDelta, per_hour: dtHours>0 ? foDelta/dtHours : null },
        tweet_count: { latest: latest.tweet_count, oldest: oldest.tweet_count, delta: tDelta, per_hour: dtHours>0 ? tDelta/dtHours : null },
        handle: latest.handle,
        display_name: latest.display_name,
        verified_latest: latest.is_verified,
      };
      // Pairwise deltas (adjacent points)
      if (series.length >= 2) {
        for (let i = 0; i < series.length-1; i++) {
          const a = series[i+1]; // older
          const b = series[i];   // newer
          const hours = (new Date(b.time)-new Date(a.time))/3600_000;
          snapshot_deltas.push({
            from: a.time,
            to: b.time,
            hours,
            followers_delta: (b.followers ?? 0) - (a.followers ?? 0),
            following_delta: (b.following ?? 0) - (a.following ?? 0),
            tweet_count_delta: (b.tweet_count ?? 0) - (a.tweet_count ?? 0),
            verified_change: a.is_verified === b.is_verified ? false : { was: a.is_verified, now: b.is_verified }
          });
        }
      }
    }
  }

  const report = { summary, tweets, snapshots, snapshot_summary, snapshot_deltas };
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(REPORTS_DIR, `twitter-history-${mint}-${ts}.json`);
  const replacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);
  fs.writeFileSync(outPath, JSON.stringify(report, replacer, 2));

  console.log(chalk.yellow.bold(`\n💾 History report saved to: ${outPath}`));
  console.log(`REPORT_FILE:${outPath}`);

  try { await prisma.$disconnect(); } catch {}
}

main().catch(async (e) => { console.error('[History FATAL]', e?.stack || e); try { await prisma.$disconnect(); } catch {}; process.exit(1); });
