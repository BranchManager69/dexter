#!/usr/bin/env node

// token-ai/socials/telegram/accounts.js

import fs from 'fs';
import path from 'path';

const sessionsDir = path.join(process.cwd(), 'token-ai', 'socials', 'telegram', 'sessions');
const currentPath = path.join(process.cwd(), 'token-ai', 'socials', 'telegram', 'current.json');

function listSessions(dir){
  try { if (!fs.existsSync(dir)) return []; return fs.readdirSync(dir).filter(f=>f.endsWith('.session')).map(f=>path.join(dir,f)); } catch { return []; }
}

function readCurrent(){
  try { if (fs.existsSync(currentPath)) return JSON.parse(fs.readFileSync(currentPath,'utf8')); } catch {}
  return {}; 
}

function main(){
  const curr = readCurrent();
  const sessions = listSessions(sessionsDir);
  console.log('
Telegram accounts (sessions):');
  sessions.forEach((p,idx)=>{
    const mark = (curr.session_path && path.resolve(curr.session_path)===path.resolve(p)) ? '*' : ' ';
    console.log(`${mark} [${idx}] ${p}`);
  });
  if (sessions.length===0) console.log('(none found)');
  console.log('
Current:');
  console.log(JSON.stringify(curr,null,2));
}

main();
