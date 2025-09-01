#!/usr/bin/env node

// token-ai/socials/telegram/record.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import chalk from 'chalk';
import { startGroupCallReceive } from './voice.js';

function parseArgs(argv){ const args={ kv:{}, target:null }; for(let i=2;i<argv.length;i++){ const a=argv[i]; if(a.startsWith('--')){ const [k,v]=a.split('='); args.kv[k.replace(/^--/,'')] = v===undefined? '1': v; } else if(!args.target){ args.target=a; } } return args; }

async function main(){
  const { kv, target } = parseArgs(process.argv);
  if(!target){ console.error('Usage: npm run telegram:record -- <t.me/username|@username|inviteLink> [--duration=60]'); process.exit(1); }
  const duration = kv.duration? parseInt(kv.duration,10):60;
  console.log(chalk.cyan(`Recording group call from ${target} for ${duration}s...`));
  const res = await startGroupCallReceive({ usernameOrInvite: target, durationSec: duration });
  if(res.success){ console.log(chalk.green('Saved to:'), res.path); } else { console.log(chalk.red('Failed:'), res.error); }
}

main().catch(e=>{ console.error('[Record FATAL]', e?.stack||e); process.exit(1); });
