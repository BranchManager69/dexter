#!/usr/bin/env node

// token-ai/socials/telegram/safeguard-headless.js
// 1) Pull the latest VERIFY WebView button from @safeguard DM
// 2) Request a fresh WebView URL via MTProto (RequestWebView)
// 3) Open it in a headless browser (mobile UA), using optional SOCKS proxy
// 4) Poll the DM; on success DM/link arrival, auto-join and confirm

import dotenv from 'dotenv';
dotenv.config({ override: true });

import fs from 'fs';
import path from 'path';
import { Api } from 'telegram/tl/index.js';
import { getTelegramClient, connectClient, joinByUsernameOrInvite } from './gramjs-client.js';

function usage(){
  console.log('Usage: node token-ai/socials/telegram/safeguard-headless.js [--bot=@safeguard] [--param=-1002683778860] [--timeoutMs=600000] [--pollMs=5000] [--proxyUrl=socks5://127.0.0.1:11182] [--screenshots=1] [--portalSlug=t.me/devdegenduel] [--ua=customUA] [--lang=en-US,en] [--viewport=412x915]');
}

function parseArgs(argv){
  const kv = {}; const rest = [];
  for (let i=2;i<argv.length;i++){ const a=argv[i]; if (a.startsWith('--')){ const [k,v]=a.split('='); kv[k.replace(/^--/,'')] = v ?? '1'; } else rest.push(a); }
  return { kv, rest };
}

function nowTs(){ const d=new Date(); const pad=(n)=> String(n).padStart(2,'0'); return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; }

function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function pickVerifyUrlFromMessages(msgs){
  // Look for KeyboardButtonWebView first, then any button url to safeguard domain
  const isVerifyBtn = (b)=> String(b?.type||'').toLowerCase().includes('webview') && /verify/i.test(b?.text||'');
  for (const m of msgs){
    const btns = Array.isArray(m?.replyMarkup?.rows) ? m.replyMarkup.rows.flatMap(r=> r.buttons||[]) : [];
    for (const b of btns){ if (isVerifyBtn(b) && b.url) return b.url; }
  }
  for (const m of msgs){
    const btns = Array.isArray(m?.replyMarkup?.rows) ? m.replyMarkup.rows.flatMap(r=> r.buttons||[]) : [];
    for (const b of btns){ if (b?.url && /safeguard\.run/i.test(b.url)) return b.url; }
  }
  return null;
}

function findJoinTargetInSimple(messages = []){
  const rxInvite = /https?:\/\/t\.me\/(?:\+|joinchat\/)\S+/i;
  const rxAnyTme = /https?:\/\/t\.me\/[A-Za-z0-9_+\-/?#=]+/i;
  for (const m of messages) {
    if (m?.message && rxInvite.test(m.message)) return m.message.match(rxInvite)[0];
    const btns = Array.isArray(m?.inline_buttons) ? m.inline_buttons : [];
    for (const b of btns) { if (b?.url && rxInvite.test(b.url)) return b.url; }
  }
  for (const m of messages) {
    if (m?.message && rxAnyTme.test(m.message)) return m.message.match(rxAnyTme)[0];
    const btns = Array.isArray(m?.inline_buttons) ? m.inline_buttons : [];
    for (const b of btns) { if (b?.url && rxAnyTme.test(b.url)) return b.url; }
  }
  return null;
}

async function requestFreshWebViewUrl(client, { botUsername, verifyUrl, platform='android' }){
  const botEntity = await getBotEntity(client, botUsername);
  const peer = botEntity;
  // Use RequestWebView with the button URL so Telegram appends auth data
  const res = await client.invoke(new Api.messages.RequestWebView({
    peer,
    bot: botEntity,
    url: verifyUrl,
    fromBotMenu: false,
    platform,
  }));
  // Expect WebViewResultUrl with .url
  const url = res?.url || null;
  if (!url) throw new Error('RequestWebView returned no url');
  return url;
}

async function getBotEntity(client, hint){
  const slug = String(hint||'').replace(/^@/,'').trim();
  // Try direct resolution first
  if (slug) {
    try { return await client.getEntity(slug); } catch {}
  }
  // Fallback: scan dialogs for bot named “Safeguard”
  const dialogs = await client.getDialogs({ limit: 200 });
  let candidate = null;
  for (const d of dialogs) {
    const e = d?.entity; if (!e) continue;
    if (e.bot && (String(e.username||'').toLowerCase().includes('safeguard') || String(e.title||e.firstName||'').toLowerCase().includes('safeguard'))) {
      candidate = e; break;
    }
  }
  if (candidate) return candidate;
  throw new Error(`Cannot locate Safeguard bot entity (hint=${hint||''})`);
}

function firstProxyFromEnv(){
  const p1 = process.env.HEADLESS_PROXY_URL || '';
  if (p1) return p1;
  const p2 = process.env.TELEGRAM_PROXY_URL || '';
  if (p2) return p2;
  const list = (process.env.TELEGRAM_PROXY_URLS || '').split(/[\s,]+/).filter(Boolean);
  if (list.length) return list[0];
  return '';
}

function buildUAFromTelegramConfig(tcfg){
  const dev = tcfg?.client?.device_model || 'Google Pixel 6';
  // Try to extract Android version like "Android 13" from system_version if present
  const sys = tcfg?.client?.system_version || 'Android 13; Pixel 6 Build/TQ3A.230805.001';
  const app = tcfg?.client?.app_version || '10.12.2';
  // Derive Android version token
  let android = 'Android 13';
  const m = String(sys).match(/Android\s+([^;]+)/i);
  if (m) android = `Android ${m[1].trim()}`;
  // Compose UA similar to Telegram Android
  return `Mozilla/5.0 (Linux; ${android}; ${dev}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 Telegram-Android/${app}`;
}

async function launchHeadlessTo(url, { proxyUrl=null, screenshots=true, timeoutMs=600000, ua=null, lang='en-US,en', viewport='412x915' }){
  let puppeteer;
  try { ({ default: puppeteer } = await import('puppeteer')); }
  catch { throw new Error('Puppeteer is not installed. Run: npm i -D puppeteer'); }

  const args = [
    '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--lang=en-US,en',
  ];
  if (proxyUrl) args.push(`--proxy-server=${proxyUrl}`);

  const browser = await puppeteer.launch({ headless: 'new', args });
  const page = await browser.newPage();
  await page.setUserAgent(ua || 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 Telegram-Android/10.12.2');
  const [vw, vh] = String(viewport||'412x915').split('x').map(x=> parseInt(x,10));
  await page.setViewport({ width: vw||412, height: vh||915, deviceScaleFactor: 2 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': `${lang},q=0.9` });

  const shotsDir = path.join(process.cwd(), 'token-ai', 'socials', 'telegram', 'reports');
  ensureDir(shotsDir);
  const prefix = path.join(shotsDir, `safeguard-${nowTs()}`);

  page.on('console', (msg)=>{
    try { console.log('[webview]', msg.type().toUpperCase(), msg.text()); } catch {}
  });
  page.on('pageerror', (e)=> console.log('[webview] pageerror:', e?.message||e));
  page.on('requestfailed', (req)=> console.log('[webview] requestfailed:', req.url(), req.failure()?.errorText));

  const start = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (screenshots) await page.screenshot({ path: `${prefix}-1-initial.png`, fullPage: true }).catch(()=>{});

  // Try to wait for some spinner/captcha marker, then idle; do not attempt to solve.
  try { await page.waitForTimeout(2000); } catch {}
  try { await page.waitForNetworkIdle({ idleTime: 1500, timeout: 15000 }); } catch {}
  if (screenshots) await page.screenshot({ path: `${prefix}-2-after-load.png`, fullPage: true }).catch(()=>{});

  // Keep the page open until timeout; caller will poll DM.
  return { browser, page, prefix, until: start + timeoutMs };
}

async function main(){
  const { kv } = parseArgs(process.argv);
  if (kv.help) return usage();
  const bot = kv.bot || 'safeguard';
  const param = kv.param || kv.p || ''; // may be unused if verifyUrl already in DM
  const portalSlug = kv.portalSlug || 't.me/devdegenduel';
  const timeoutMs = parseInt(kv.timeoutMs || '600000', 10);
  const pollMs = parseInt(kv.pollMs || '5000', 10);
  const cfgAll = await import('../config.js');
  const tcfg = cfgAll.getTelegramConfig();
  const defaultUa = buildUAFromTelegramConfig(tcfg);
  const proxyUrl = kv.proxyUrl || firstProxyFromEnv();
  const ua = kv.ua || process.env.HEADLESS_UA || defaultUa;
  const lang = kv.lang || process.env.HEADLESS_LANG || 'en-US,en';
  const viewport = kv.viewport || process.env.HEADLESS_VIEWPORT || '412x915';
  const screenshots = (kv.screenshots||'1') !== '0';
  // Log effective fingerprints for verification
  console.log('[headless] Using proxy:', proxyUrl ? '(set)' : '(none)');
  console.log('[headless] UA:', ua);
  console.log('[headless] Lang:', lang, 'Viewport:', viewport);

  const { client } = await getTelegramClient({ apiId: tcfg.api_id, apiHash: tcfg.api_hash, sessionPath: tcfg.session_path });
  await connectClient(client);

  // Optionally nudge bot with /start param if provided
  if (param) { try { await client.sendMessage(bot.replace(/^@/, ''), { message: `/start ${param}` }); } catch {} }

  // Fetch recent messages and find VERIFY button url
  const botEntity = await getBotEntity(client, bot);
  const hist = await client.invoke(new Api.messages.GetHistory({ peer: botEntity, limit: 10, offsetId: 0, minId: 0, addOffset: 0, maxId: 0, hash: BigInt(0) }));
  const msgs = hist?.messages || [];
  let verifyUrl = pickVerifyUrlFromMessages(msgs);
  if (!verifyUrl) throw new Error('Could not find VERIFY webview button URL in bot DM');

  // Get a fresh, authorized WebView URL from Telegram
  let webviewUrl = null;
  try {
    webviewUrl = await requestFreshWebViewUrl(client, { botUsername: bot, verifyUrl, platform: 'android' });
    console.log('[headless] WebView URL:', webviewUrl);
  } catch (e) {
    const msg = e?.message || String(e);
    console.log('[headless] RequestWebView blocked or failed:', msg);
    const allowFallback = (kv.allowFallback || '0') === '1';
    if (/FROZEN|420/i.test(msg)) {
      console.log('[headless] Account appears frozen; aborting (no fallback).');
      process.exitCode = 2;
      try { await client.disconnect(); } catch {}
      return;
    }
    if (!allowFallback) {
      console.log('[headless] Fallback to DM verify URL is disabled. Re-run with --allowFallback=1 to try raw link.');
      process.exitCode = 3;
      try { await client.disconnect(); } catch {}
      return;
    }
    webviewUrl = verifyUrl;
    console.log('[headless] Using DM verify URL (fallback enabled):', webviewUrl);
  }

  // Start headless browser (optional SOCKS proxy)
  const { browser, page, until } = await launchHeadlessTo(webviewUrl, { proxyUrl: proxyUrl || null, screenshots, timeoutMs, ua, lang, viewport });

  // Attempt gentle auto-advance: click common CTA buttons to reach captcha
  try {
    await page.evaluate(() => {
      function visible(el){ const r = el.getBoundingClientRect(); const style = getComputedStyle(el); return r.width>2 && r.height>2 && style.visibility!=='hidden' && style.display!=='none' && style.opacity!=='0'; }
      const labels = ['verify','start','continue','begin','open','i\'m human','human'];
      const all = Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"], input[type="button"], input[type="submit"]'));
      for (const el of all) {
        const t = (el.textContent||'').trim().toLowerCase();
        if (!t) continue;
        if (labels.some(l=> t.includes(l)) && visible(el)) { el.click(); break; }
      }
    });
    await page.waitForTimeout(1500);
  } catch {}

  // Detect captcha widgets and log sitekeys, take periodic screenshots
  const shotEveryMs = 10000;
  let nextShotAt = Date.now() + shotEveryMs;
  let lastDetect = '';

  async function detectAndLog(){
    try {
      const info = await page.evaluate(() => {
        const out = { hcaptcha: null, turnstile: null, anyIframe: 0 };
        // hCaptcha
        const h1 = document.querySelector('[data-sitekey][data-theme][data-size]');
        if (h1) out.hcaptcha = { sitekey: h1.getAttribute('data-sitekey') };
        const iframes = Array.from(document.querySelectorAll('iframe'));
        out.anyIframe = iframes.length;
        for (const f of iframes){
          const src = f.getAttribute('src')||'';
          if (/hcaptcha\.com/i.test(src)) out.hcaptcha = out.hcaptcha || { sitekey: null };
          if (/challenges\.cloudflare\.com/i.test(src) || /turnstile\.js/i.test(src)) out.turnstile = out.turnstile || { sitekey: null };
        }
        // Cloudflare Turnstile sitekey
        const t1 = document.querySelector('.cf-turnstile, [data-sitekey][data-cf-challenge]');
        if (t1){ out.turnstile = out.turnstile || {}; out.turnstile.sitekey = t1.getAttribute('data-sitekey'); }
        return out;
      });
      const sig = JSON.stringify(info);
      if (sig !== lastDetect) { console.log('[headless] captcha-detect:', sig); lastDetect = sig; }
    } catch {}
  }

  // Periodic loop: screenshots/detection + DM polling
  const rxTme = /https?:\/\/t\.me\/[A-Za-z0-9_+\-/?#=]+/i;
  while (Date.now() < until) {
    // Detect and capture
    await detectAndLog();
    if (screenshots && Date.now() >= nextShotAt) {
      const ts = nowTs();
      try { await page.screenshot({ path: path.join(shotsDir, `safeguard-${ts}-tick.png`), fullPage: true }); } catch {}
      nextShotAt += shotEveryMs;
    }

    // Poll the DM for any link to join and auto-join
    try {
      const h = await client.invoke(new Api.messages.GetHistory({ peer: botEntity, limit: 25, offsetId: 0, minId: 0, addOffset: 0, maxId: 0, hash: BigInt(0) }));
      const m2 = h?.messages || [];
      let link = null;
      for (const m of m2) {
        if (m?.message && rxTme.test(m.message)) { link = m.message.match(rxTme)[0]; break; }
        const rm = m?.replyMarkup?.rows || [];
        for (const r of rm) { for (const b of (r.buttons||[])) { if (b?.url && rxTme.test(b.url)) { link = b.url; break; } } }
        if (link) break;
      }
      if (link) {
        console.log('[headless] Found link in DM:', link);
        try {
          const joinRes = await joinByUsernameOrInvite(client, link);
          console.log('[headless] Join result:', joinRes?.className || 'ok');
        } catch (e) { console.log('[headless] Join failed:', e?.message||String(e)); }
        // After join, try to fetch community/portal history to confirm
        try {
          const ph = await client.invoke(new Api.messages.GetHistory({ peer: await client.getEntity(portalSlug.replace(/^@/,'').replace(/^(https?:\/\/)?t\.me\//i,'')), limit: 10, offsetId: 0, minId: 0, addOffset: 0, maxId: 0, hash: BigInt(0) }));
          const cnt = (ph?.messages||[]).length; console.log('[headless] Portal history count:', cnt);
        } catch {}
        break;
      }
    } catch (e) {
      console.log('[headless] poll error:', e?.message || String(e));
    }
    await new Promise(r=> setTimeout(r, pollMs));
  }

  try { await browser.close(); } catch {}
  try { await client.disconnect(); } catch {}
}

main().catch((e)=>{ console.error('[headless] fatal:', e?.message || e); process.exit(1); });
