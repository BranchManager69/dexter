#!/usr/bin/env node

// token-ai/socials/telegram/messages.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ensureReportsDir, REPORTS_DIR } from '../common.js';
import { get_telegram_recent_messages_user_v2, get_telegram_messages_by_author_v2 } from '../tools/telegram-advanced.js';
import { persist_telegram_messages } from '../tools/telegram-persist.js';

function parseArgs(argv){ const args={ kv:{}, target:null }; for(let i=2;i<argv.length;i++){ const a=argv[i]; if(a.startsWith('--')){ const [k,v]=a.split('='); args.kv[k.replace(/^--/,'')] = v===undefined? '1': v; } else if(!args.target){ args.target=a; } } return args; }

async function main(){
  const { kv, target } = parseArgs(process.argv);
  if(!target){ console.error('Usage: npm run telegram:messages -- <t.me/username|@username|inviteLink> [--limit=100] [--since-time=ISO|--since-days=N] [--author=@user] [--mint=<MINT>]'); process.exit(1); }
  ensureReportsDir();
  const limit = kv.limit? parseInt(kv.limit,10):100;
  const since = kv['since-time'] || (kv['since-days']? new Date(Date.now()-parseFloat(kv['since-days'])*86400_000).toISOString(): null);
  const author = kv.author || null;
  const mint = kv.mint || 'unknown';

  let res;
  if(author){
    res = await get_telegram_messages_by_author_v2({ chatUsernameOrInvite: target, authorUsername: author, limit, sinceTime: since });
  } else {
    res = await get_telegram_recent_messages_user_v2({ usernameOrInvite: target, limit, sinceTime: since });
  }
  if(!res.success){ console.error('Fetch failed:', res.error); process.exit(1); }
  console.log(chalk.white(`Fetched ${res.count} messages`));

  // Persist best-effort and write artifact
  const pr = await persist_telegram_messages({ mint, chatRef: target, messages: res.messages });
  console.log(chalk.green(`Persisted: ${pr.persisted}, errors: ${pr.errors}`));
  if(pr.artifact) console.log(chalk.yellow('Saved artifact:'), pr.artifact);
}

main().catch(e=>{ console.error('[Messages FATAL]', e?.stack||e); process.exit(1); });
