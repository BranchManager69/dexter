#!/usr/bin/env node

// token-ai/socials/telegram/use.js

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ override: true });

function parseArgs(argv){ const args={ kv:{}, rest:[] }; for(let i=2;i<argv.length;i++){ const a=argv[i]; if(a.startsWith('--')){ const [k,v]=a.split('='); args.kv[k.replace(/^--/,'')] = v===undefined? '1': v; } else args.rest.push(a);} return args; }

function ensureDir(p){ try{ fs.mkdirSync(p,{recursive:true}); }catch{} }

async function main(){
  const { kv, rest } = parseArgs(process.argv);
  const phone = kv.phone || kv.p || rest[0];
  if(!phone){
    console.error('Usage: npm run telegram:use -- --phone=+1XXXXXXXXXX [--session=token-ai/socials/telegram/sessions/+1XXXXXXXXXX.session]');
    process.exit(1);
  }
  const sessionsDir = path.join(process.cwd(),'token-ai','socials','telegram','sessions');
  ensureDir(sessionsDir);
  const sessionPath = kv.session || path.join(sessionsDir, `${String(phone).replace(/[^0-9+]/g,'')}.session`);
  const currentPath = path.join(process.cwd(),'token-ai','socials','telegram','current.json');
  const curr = { phone, session_path: sessionPath };
  ensureDir(path.dirname(currentPath));
  fs.writeFileSync(currentPath, JSON.stringify(curr,null,2));
  console.log('Current Telegram account set:');
  console.log(JSON.stringify(curr,null,2));
  console.log('Next:');
  console.log(' - Login: npm run telegram:login -- --reset=1');
  console.log(' - Restart daemon: pm2 restart tg-daemon --update-env');
}

main().catch(e=>{ console.error('[telegram:use error]', e?.message||e); process.exit(1); });
