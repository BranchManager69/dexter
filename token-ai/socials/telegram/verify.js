#!/usr/bin/env node

// token-ai/socials/telegram/verify.js

import dotenv from 'dotenv';
dotenv.config({ override: true });

import chalk from 'chalk';
import readline from 'readline';
import { Api } from 'telegram/tl/index.js';
import { getTelegramClient, connectClient, joinByUsernameOrInvite } from './gramjs-client.js';
import { getTelegramConfig } from '../config.js';

function parseArgs(argv){ const args={ kv:{}, target:null }; for(let i=2;i<argv.length;i++){ const a=argv[i]; if(a.startsWith('--')){ const [k,v]=a.split('='); args.kv[k.replace(/^--/,'')] = v===undefined? '1': v; } else if(!args.target){ args.target=a; } } return args; }

function parseBotDeepLink(url){
  try {
    const u = new URL(url);
    if (u.hostname !== 't.me' && u.hostname !== 'telegram.me') return null;
    const bot = u.pathname.replace(/^\//,'');
    const start = u.searchParams.get('start') || u.searchParams.get('startapp') || u.searchParams.get('startgroup');
    if (bot && start) return { bot, start };
  } catch {}
  return null;
}

async function main(){
  const { kv, target } = parseArgs(process.argv);
  if(!target){
    console.error('Usage: npm run telegram:verify -- <t.me/portal|@portal> [--limit=25] [--dry-run=1]');
    process.exit(1);
  }
  const limit = kv.limit? parseInt(kv.limit,10):25;
  const dryRun = kv['dry-run']==='1' || kv['dry']==='1';
  const debug = kv.debug==='1' || kv.debug==='true';
  const delayMin = parseInt(process.env.TELEGRAM_HUMAN_DELAY_MIN_MS || '1200', 10);
  const delayMax = parseInt(process.env.TELEGRAM_HUMAN_DELAY_MAX_MS || '3500', 10);
  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
  const jitter = ()=> Math.floor(Math.random()*(delayMax - delayMin + 1)) + delayMin;
  const ask = (q)=> new Promise((resolve)=>{ const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (ans)=>{ rl.close(); resolve(ans); }); });

  const tcfg = getTelegramConfig();
  const apiId = tcfg.api_id; const apiHash = tcfg.api_hash;
  if(!apiId || !apiHash){ console.error('Missing TELEGRAM_API_ID/TELEGRAM_API_HASH'); process.exit(1); }
  const { client } = await getTelegramClient({ apiId, apiHash, sessionPath: tcfg.session_path });
  await connectClient(client);

  try {
    // Ensure we’re in the portal; join if invite link
    if (/t\.me\/(\+|joinchat\/)/i.test(target)) {
      console.log(chalk.gray('Joining via invite link...'));
      if (!dryRun) await joinByUsernameOrInvite(client, target);
    }
    const slug = String(target).trim().replace(/^@/,'');
    if (debug) console.log(chalk.gray('Resolving entity for:'), slug);
    const portal = await client.getEntity(slug);
    if (debug) console.log(chalk.gray('Resolved entity type:'), portal?.className || 'unknown');

    // Fetch recent messages with markup
    if (debug) console.log(chalk.gray('Fetching recent messages (GetHistory)...'));
    const resp = await Promise.race([
      client.invoke(new Api.messages.GetHistory({ peer: portal, limit, offsetId: 0, minId: 0, addOffset: 0, maxId: 0, hash: BigInt(0) })),
      new Promise((_, rej) => setTimeout(()=> rej(new Error('GetHistory timeout after 12s')), 12000))
    ]);
    if (debug) console.log(chalk.gray('GetHistory returned messages:'), resp?.messages?.length || 0);
    const msgs = resp.messages || [];

    // Scan buttons
    const actions = [];
    for (const m of msgs) {
      if (!m || (m.className && !String(m.className).toLowerCase().includes('message'))) continue;
      const rm = m.replyMarkup;
      if (!rm || !String(rm.className||'').toLowerCase().includes('inline')) continue;
      for (const row of (rm.rows||[])) {
        for (const b of (row.buttons||[])) {
          const text = b.text || '';
          if (b.url) {
            const url = b.url;
            const deep = parseBotDeepLink(url);
            if (deep) actions.push({ kind: 'bot_deeplink', bot: deep.bot, start: deep.start, sourceMsgId: m.id, buttonText: text, url });
            else if (/t\.me\/(?:\+|joinchat\/|\w+)/i.test(url)) actions.push({ kind: 'join_link', url, sourceMsgId: m.id, buttonText: text });
          } else if (b.data) {
            // Callback button
            actions.push({ kind: 'callback', sourceMsgId: m.id, buttonText: text, data: Buffer.from(b.data).toString('base64') });
          }
        }
      }
    }

    if (!actions.length) {
      console.log(chalk.yellow('No inline buttons found to verify/join.'));
      console.log(chalk.gray('Hints: increase --limit, confirm the portal slug, or run with --debug=1.'));
      return;
    }

    console.log(chalk.cyan('Discovered actions:'));
    actions.slice(0,10).forEach((a,i)=> console.log(`  [${i}] ${a.kind} ${a.buttonText?'- '+a.buttonText:''} ${a.url?'- '+a.url:''} ${a.bot?'- @'+a.bot+' start='+a.start:''}`));

    // Simple priority: bot_deeplink > join_link > callback("verify")
    let chosen = actions.find(a=>a.kind==='bot_deeplink')
              || actions.find(a=>a.kind==='join_link')
              || actions.find(a=>a.kind==='callback' && /verify|i\'?m human|continue/i.test(a.buttonText||''))
              || actions[0];

    console.log(chalk.white('Selected action:'), chosen);

    if (dryRun) { console.log(chalk.gray('[dry-run] not executing.')); return; }
    if (kv.confirm==='1' || kv.confirm==='true') {
      const ans = (await ask('Proceed with this action? (y/N) ')).trim().toLowerCase();
      if (ans !== 'y' && ans !== 'yes') { console.log('Cancelled by user.'); return; }
    }

    if (chosen.kind === 'bot_deeplink') {
      await sleep(jitter());
      const bot = await client.getEntity(chosen.bot);
      console.log(chalk.white(`Starting bot @${chosen.bot} with param: ${chosen.start}`));
      try {
        // Start in PM by sending /start <param>
        await client.sendMessage(chosen.bot, { message: `/start ${chosen.start}` });
        console.log(chalk.green('Bot started. Check bot DM for follow-ups.'));
      } catch (e) {
        console.log(chalk.red('Failed to start bot via message:'), e.message);
        try {
          await client.invoke(new Api.messages.StartBot({ bot, peer: bot, randomId: BigInt(Date.now()), startParam: chosen.start }));
          console.log(chalk.green('Bot started via StartBot API.'));
        } catch (e2) {
          console.log(chalk.red('StartBot API failed:'), e2.message);
        }
      }
    } else if (chosen.kind === 'join_link') {
      await sleep(jitter());
      console.log(chalk.white('Joining via button URL:', chosen.url));
      await joinByUsernameOrInvite(client, chosen.url);
      console.log(chalk.green('Join attempt finished.'));
    } else if (chosen.kind === 'callback') {
      await sleep(jitter());
      const dataBuf = Buffer.from(chosen.data, 'base64');
      console.log(chalk.white('Pressing callback button:', chosen.buttonText));
      try {
        await client.invoke(new Api.messages.GetBotCallbackAnswer({ peer: portal, msgId: chosen.sourceMsgId, data: dataBuf }));
        console.log(chalk.green('Callback pressed.'));
      } catch (e) {
        console.log(chalk.red('Callback press failed:'), e.message);
      }
    }

    console.log(chalk.gray('Done. You may now receive a DM from a bot with a private invite link; run `npm run telegram:join -- <that link>` when you have it.'));
  } finally {
    try { await client.disconnect(); } catch {}
    console.log('[Telegram] Disconnected.');
  }
}

main().catch((e)=>{ console.error('[Verify FATAL]', e?.stack||e); process.exit(1); });
