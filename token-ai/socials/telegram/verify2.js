#!/usr/bin/env node

// token-ai/socials/telegram/verify2.js

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
    console.error('Usage: npm run telegram:verify2 -- <t.me/portal|@portal> [--limit=25] [--dry-run=1] [--debug=1]');
    process.exit(1);
  }
  const limit = kv.limit? parseInt(kv.limit,10):25;
  const dryRun = kv['dry-run']==='1' || kv['dry']==='1';
  const debug = kv.debug==='1' || kv.debug==='true';
  const ask = (q)=> new Promise((resolve)=>{ const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (ans)=>{ rl.close(); resolve(ans); }); });

  const tcfg = getTelegramConfig();
  const apiId = tcfg.api_id; const apiHash = tcfg.api_hash;
  if(!apiId || !apiHash){ console.error('Missing TELEGRAM_API_ID/TELEGRAM_API_HASH'); process.exit(1); }
  const { client } = await getTelegramClient({ apiId, apiHash, sessionPath: tcfg.session_path });

  console.log(chalk.gray('[Verify2] Connecting via MTProto (pinned 443)...'));
  try {
    await connectClient(client);
  } catch (e) {
    console.error(chalk.red('[Verify2] Connect failed:'), e?.message||e);
    process.exit(2);
  }
  console.log(chalk.gray('[Verify2] Connected.'));

  try {
    const slug = String(target).trim().replace(/^@/,'');
    if (/t\.me\/(\+|joinchat\/)/i.test(slug)) {
      console.log(chalk.gray('[Verify2] Invite link detected; joining (dry-run:', !!dryRun, ')'));
      if (!dryRun) await joinByUsernameOrInvite(client, slug);
    }
    if (debug) console.log(chalk.gray('[Verify2] Resolving entity for:'), slug);
    const portal = await Promise.race([
      client.getEntity(slug),
      new Promise((_, rej)=> setTimeout(()=> rej(new Error('getEntity timeout after 10s')), 10000))
    ]).catch(e=>{ throw new Error('getEntity failed: '+(e?.message||e)); });
    if (debug) console.log(chalk.gray('[Verify2] Resolved entity type:'), portal?.className || 'unknown');

    if (debug) console.log(chalk.gray('[Verify2] Fetching recent messages (GetHistory)...'));
    const resp = await Promise.race([
      client.invoke(new Api.messages.GetHistory({ peer: portal, limit, offsetId: 0, minId: 0, addOffset: 0, maxId: 0, hash: BigInt(0) })),
      new Promise((_, rej)=> setTimeout(()=> rej(new Error('GetHistory timeout after 12s')), 12000))
    ]).catch(e=>{ throw new Error('GetHistory failed: '+(e?.message||e)); });
    const msgs = resp?.messages || [];
    console.log(chalk.gray('[Verify2] Messages fetched:'), msgs.length);

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
            actions.push({ kind: 'callback', sourceMsgId: m.id, buttonText: text, data: Buffer.from(b.data).toString('base64') });
          }
        }
      }
    }

    if (!actions.length) {
      console.log(chalk.yellow('[Verify2] No inline buttons found to verify/join.'));
      console.log(chalk.gray('Hints: increase --limit, confirm the portal slug, or run with --debug=1.'));
      return;
    }

    console.log(chalk.cyan('[Verify2] Discovered actions:'));
    actions.slice(0,10).forEach((a,i)=> console.log(`  [${i}] ${a.kind} ${a.buttonText?'- '+a.buttonText:''} ${a.url?'- '+a.url:''} ${a.bot?'- @'+a.bot+' start='+a.start:''}`));

    const chosen = actions.find(a=>a.kind==='bot_deeplink')
              || actions.find(a=>a.kind==='join_link')
              || actions.find(a=>a.kind==='callback' && /verify|i'?m human|continue/i.test(a.buttonText||''))
              || actions[0];

    console.log(chalk.white('[Verify2] Selected action:'), chosen);
    if (dryRun) { console.log(chalk.gray('[Verify2] dry-run enabled; not executing.')); return; }

    if (kv.confirm==='1' || kv.confirm==='true') {
      const ans = (await ask('Proceed with this action? (y/N) ')).trim().toLowerCase();
      if (ans !== 'y' && ans !== 'yes') { console.log('[Verify2] Cancelled by user.'); return; }
    }

    if (chosen.kind === 'bot_deeplink') {
      console.log(chalk.white(`[Verify2] Starting bot @${chosen.bot} with param: ${chosen.start}`));
      try {
        await client.sendMessage(chosen.bot, { message: `/start ${chosen.start}` });
        console.log(chalk.green('[Verify2] Bot started. Check bot DM for follow-ups.'));
      } catch (e) {
        console.log(chalk.red('[Verify2] Failed to start bot via message:'), e.message);
        try {
          const bot = await client.getEntity(chosen.bot);
          await client.invoke(new Api.messages.StartBot({ bot, peer: bot, randomId: BigInt(Date.now()), startParam: chosen.start }));
          console.log(chalk.green('[Verify2] Bot started via StartBot API.'));
        } catch (e2) {
          console.log(chalk.red('[Verify2] StartBot API failed:'), e2.message);
        }
      }
    } else if (chosen.kind === 'join_link') {
      console.log(chalk.white('[Verify2] Joining via button URL:', chosen.url));
      await joinByUsernameOrInvite(client, chosen.url);
      console.log(chalk.green('[Verify2] Join attempt finished.'));
    } else if (chosen.kind === 'callback') {
      console.log(chalk.white('[Verify2] Pressing callback button:', chosen.buttonText));
      try {
        const dataBuf = Buffer.from(chosen.data, 'base64');
        await client.invoke(new Api.messages.GetBotCallbackAnswer({ peer: portal, msgId: chosen.sourceMsgId, data: dataBuf }));
        console.log(chalk.green('[Verify2] Callback pressed.'));
      } catch (e) {
        console.log(chalk.red('[Verify2] Callback press failed:'), e.message);
      }
    }

    console.log(chalk.gray('[Verify2] Done. If you receive a DM invite link, run: npm run telegram:join -- <link>'));
  } finally {
    try { await client.disconnect(); } catch {}
    console.log('[Telegram] Disconnected.');
  }
}

main().catch((e)=>{ console.error('[Verify2 FATAL]', e?.stack||e); process.exit(1); });
