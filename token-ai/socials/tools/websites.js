// token-ai/socials/tools/websites.js

import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { PublicKey } from '@solana/web3.js';

const DEFAULT_TIMEOUT_MS = 30000;

export async function extract_website_content(url, opts = {}) {
  const options = {
    screenshotDir: opts.screenshotDir || path.join(process.cwd(), 'token-ai', 'socials', 'reports', 'websites'),
    timeoutMs: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
    headless: opts.headless !== false,
    maxTextLength: opts.maxTextLength || 1_000_000,
    browser: opts.browser || null,
  };
  if (!fs.existsSync(options.screenshotDir)) fs.mkdirSync(options.screenshotDir, { recursive: true });

  let usedPlaywright = true;
  let screenshotPath = null;
  let screenshotViewport = null;

  const processHtml = async (rawHtml) => {
    const $ = cheerio.load(rawHtml);
    $('script, style, noscript, iframe, svg').remove();
    const fullTextRaw = $('body').text().replace(/\s+/g, ' ').trim();
    const originalTextLength = fullTextRaw.length;
    let fullText = fullTextRaw;
    let wasTextTruncated = false;
    if (fullText.length > options.maxTextLength) { fullText = fullText.substring(0, options.maxTextLength); wasTextTruncated = true; }

    const sections = [];
    $('main, article, section, div, header, footer').each((i, elem) => {
      const $elem = $(elem);
      const directText = $elem.clone().children().remove().end().text().trim();
      const full = $elem.text().trim();
      if (full.length > 50) {
        sections.push({
          tag: elem.tagName?.toLowerCase?.() || elem.name || 'node',
          id: $elem.attr('id') || null,
          class: $elem.attr('class') || null,
          directText: directText.substring(0, 500),
          fullText: full.substring(0, 2000),
        });
      }
    });

    const allLinks = [];
    $('a[href]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      allLinks.push({ text: $a.text().trim(), href });
    });

    const meta = {
      title: $('title').text() || null,
      description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || null,
      keywords: $('meta[name="keywords"]').attr('content') || null,
      ogImage: $('meta[property="og:image"]').attr('content') || null,
      canonicalUrl: $('link[rel="canonical"]').attr('href') || null,
    };

    const socialLinks = {
      twitter: allLinks.filter(l => l.href?.match(/twitter\.com|x\.com/i)),
      telegram: allLinks.filter(l => l.href?.match(/t\.me|telegram/i)),
      discord: allLinks.filter(l => l.href?.match(/discord\.(com|gg)/i)),
      github: allLinks.filter(l => l.href?.match(/github\.com/i)),
      medium: allLinks.filter(l => l.href?.match(/medium\.com/i)),
      youtube: allLinks.filter(l => l.href?.match(/youtube\.com|youtu\.be/i)),
      reddit: allLinks.filter(l => l.href?.match(/reddit\.com/i)),
    };

    const base58Candidates = fullTextRaw.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [];
    const valid = new Set(); const onCurve = new Set(); const offCurve = new Set(); const tokenMints = new Set();
    for (const addr of base58Candidates) {
      try {
        const pubkey = new PublicKey(addr);
        const s = pubkey.toBase58(); valid.add(s);
        if (PublicKey.isOnCurve(pubkey.toBytes())) onCurve.add(s); else offCurve.add(s);
        const idx = fullTextRaw.indexOf(addr); const ctx = fullTextRaw.substring(Math.max(0, idx - 50), idx).toLowerCase();
        if (addr.endsWith('pump') || ctx.includes('ca:') || ctx.includes('mint:') || ctx.includes('contract:') || ctx.includes('token:')) tokenMints.add(s);
      } catch {}
    }

    return {
      success: true,
      url,
      usedPlaywright,
      meta,
      stats: { totalTextLength: originalTextLength, sectionCount: sections.length, linkCount: allLinks.length },
      fullText,
      wasTextTruncated,
      sections,
      allLinks,
      socialLinks,
      detectedAddresses: {
        all: Array.from(valid),
        onCurve: Array.from(onCurve),
        offCurve: Array.from(offCurve),
        likelyTokenMints: Array.from(tokenMints),
      },
      screenshot: { path: screenshotPath, viewport: screenshotViewport, fullPage: true },
      timestamp: new Date().toISOString(),
    };
  };

  // Playwright path
  try {
    const launchedHere = !options.browser;
    const browser = options.browser || await chromium.launch({ headless: options.headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await page.waitForTimeout(3000);
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight / 2); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
    await page.waitForTimeout(500);
    const html = await page.content();
    const shotName = `website-${Date.now()}.png`;
    screenshotPath = path.join(options.screenshotDir, shotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshotViewport = page.viewportSize();
    const result = await processHtml(html);
    await context.close();
    if (launchedHere) await browser.close();
    return result;
  } catch (ePlaywright) {
    usedPlaywright = false;
    try {
      const resp = await axios.get(url, {
        timeout: Math.min(15000, options.timeoutMs),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        maxRedirects: 5,
      });
      const result = await processHtml(resp.data);
      result.usedPlaywright = false; return result;
    } catch (eAxios) {
      return { success: false, url, error: eAxios?.message || ePlaywright?.message || 'Extraction failed', usedPlaywright: false, timestamp: new Date().toISOString() };
    }
  }
}

export async function extract_websites_for_token(urls = [], opts = {}) {
  const results = [];
  const browser = opts.browser || null;
  for (const url of urls) {
    try { results.push(await extract_website_content(url, { ...opts, browser })); }
    catch (e) { results.push({ success: false, url, error: e.message }); }
  }
  return results;
}

export function find_social_links_in_site(extractedSite) {
  const sl = extractedSite?.socialLinks || {};
  const canonical = [];
  const pushSet = (type, arr) => (arr||[]).forEach(l => canonical.push({ type, url: l.href, text: l.text }));
  pushSet('twitter', sl.twitter);
  pushSet('telegram', sl.telegram);
  pushSet('discord', sl.discord);
  pushSet('github', sl.github);
  pushSet('medium', sl.medium);
  pushSet('youtube', sl.youtube);
  pushSet('reddit', sl.reddit);
  return canonical;
}

