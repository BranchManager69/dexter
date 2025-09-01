#!/usr/bin/env node

// token-ai/socials/telegram/speak.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import chalk from 'chalk';
import { startGroupCallSend } from './voice.js';

function parseArgs(argv){ const args={ kv:{}, target:null }; for(let i=2;i<argv.length;i++){ const a=argv[i]; if(a.startsWith('--')){ const [k,v]=a.split('='); args.kv[k.replace(/^--/,'')] = v===undefined? '1': v; } else if(!args.target){ args.target=a; } } return args; }

async function main(){
  const { kv, target } = parseArgs(process.argv);
  const file = kv.file || kv.audio || null;
  if(!target || !file){ console.error('Usage: npm run telegram:speak -- <t.me/username|@username|inviteLink> --file=/path/to/audio.ogg'); process.exit(1); }
  console.log(chalk.cyan(`Streaming audio to group call ${target} from ${file}...`));
  const res = await startGroupCallSend({ usernameOrInvite: target, filePath: file });
  if(res.success){ console.log(chalk.green('Done.')); } else { console.log(chalk.red('Failed:'), res.error); }
}

main().catch(e=>{ console.error('[Speak FATAL]', e?.stack||e); process.exit(1); });
