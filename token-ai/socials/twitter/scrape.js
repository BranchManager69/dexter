// token-ai/socials/twitter/scrape.js

import chalk from 'chalk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export async function scrapeTwitter(token, options) {
  const opts = {
    page: null,
    context: null,
    twitterUrl: null,
    debugScreenshots: false,
    collectMembers: false,
    maxMembers: 50,
    enrichReplies: true,
    searchMaxSecs: 15,
    searchMaxTweets: 60,
  };
  Object.assign(opts, options || {});

  const twitterUrl = opts.twitterUrl || token?.token_socials?.find(s => s.type === 'twitter')?.url;
  if (!twitterUrl) return null;
  const isCommunity = twitterUrl.includes('/i/communities/');
  let page = opts.page || (await opts.context?.newPage());
  if (!page) throw new Error('scrapeTwitter: No Playwright page/context provided');

  const mergeTweets = (base, arr) => {
    const map = new Map();
    for (const t of (base || [])) if (t?.tweetId) map.set(t.tweetId, t);
    for (const t of (arr || [])) if (t?.tweetId && !map.has(t.tweetId)) map.set(t.tweetId, t);
    return Array.from(map.values());
  };

  let targetUrl = twitterUrl;
  if (!isCommunity) targetUrl = twitterUrl.endsWith('/') ? `${twitterUrl}with_replies` : `${twitterUrl}/with_replies`;
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(3000);

  const scrollPositions = [500, 1000, 2000, 3500, 5000, 7000, 9000, 12000];
  for (const pos of scrollPositions) { await page.evaluate(p => window.scrollTo(0, p), pos); await page.waitForTimeout(600); }
  for (let i = 0; i < 4; i++) { await page.evaluate(()=> window.scrollBy(0, Math.floor(window.innerHeight * 0.95))); await page.waitForTimeout(500); }

  const profileData = await page.evaluate((isCommunity) => {
    const parseRelCount = (kind) => {
      const anchors = Array.from(document.querySelectorAll(`main a[href$="/${kind}"], main a[href*="/${kind}?"], a[href$="/${kind}"], a[href*="/${kind}?"]`));
      const parseToken = (t) => {
        if (!t) return null; t = String(t).trim();
        const m = t.match(/^([0-9][0-9.,]*|[0-9.]+\s*[KMB])$/i) || t.match(/([0-9][0-9.,]*|[0-9.]+\s*[KMB])/i);
        if (!m) return null; let v = m[1];
        if (/K$/i.test(v)) return Math.round(parseFloat(v) * 1000);
        if (/M$/i.test(v)) return Math.round(parseFloat(v) * 1000000);
        if (/B$/i.test(v)) return Math.round(parseFloat(v) * 1000000000);
        return parseInt(v.replace(/[,]/g, ''), 10) || null;
      };
      let bestVal = null;
      anchors.forEach((a) => {
        const titled = a.querySelector('span[title]');
        if (titled?.getAttribute('title')) {
          const v = parseToken(titled.getAttribute('title')); if (v != null && (bestVal == null || v > bestVal)) bestVal = v; return;
        }
        const els = Array.from(a.querySelectorAll('span,div'));
        const labelIdx = els.findIndex(el => new RegExp(kind+'\\b', 'i').test(el.innerText||''));
        let localBest = null;
        els.forEach((el, i) => { const val = parseToken(el.innerText || ''); if (val != null && (labelIdx < 0 || i < labelIdx)) localBest = Math.max(localBest??val, val); });
        if (localBest != null && (bestVal == null || localBest > bestVal)) bestVal = localBest;
      });
      if (bestVal == null) {
        const scope = document.querySelector('main') || document.body;
        const txt = (scope?.innerText || '').replace(/\n/g,' ');
        const re = new RegExp('([0-9][\\d,.]*\\s*[KMB]?)\\s+'+kind+'\\b(?!\\s*you\\s*know)','i');
        const m = txt.match(re); if (m) bestVal = parseToken(m[1]);
      }
      return bestVal;
    };

    const collectTweets = () => {
      const tweets = [];
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const tweet = {};
        const authorElement = article.querySelector('[data-testid="User-Name"]');
        if (authorElement) {
          const spans = authorElement.querySelectorAll('span');
          let displayName = null; let handle = null;
          for (const span of spans) { const t = span.innerText; if (t?.startsWith('@')) handle = t; else if (t && !t.includes('·') && !displayName) displayName = t; }
          tweet.author = { displayName: displayName || 'Unknown', handle: handle || null, isVerified: !!authorElement.querySelector('svg[aria-label*="Verified"]') };
        }
        tweet.text = article.querySelector('[data-testid="tweetText"]')?.innerText || null;
        const timeEl = article.querySelector('time');
        tweet.timestamp = timeEl?.getAttribute('datetime') || null;
        tweet.likes = article.querySelector('[data-testid="like"] span')?.innerText || '0';
        tweet.retweets = article.querySelector('[data-testid="retweet"] span')?.innerText || '0';
        tweet.replies = article.querySelector('[data-testid="reply"] span')?.innerText || '0';
        tweet.views = article.querySelector('[data-testid="app-text-transition-container"] span')?.innerText || null;
        const link = article.querySelector('a[href*="/status/"]');
        if (link) {
          const href = link.getAttribute('href') || link.href; const m = href?.match(/\/status\/(\d+)/);
          if (m) { tweet.tweetId = m[1]; tweet.url = href?.startsWith('http') ? href : (tweet.author?.handle ? `https://x.com/${tweet.author.handle.replace('@','')}/status/${tweet.tweetId}` : `https://x.com${href}`); }
        }
        tweet.isReply = !!article.querySelector('[data-testid="inReplyToLink"]');
        tweet.isRetweet = !!(article.querySelector('[data-testid="socialContext"]')?.innerText.includes('reposted'));
        const qArticle = article.querySelector('[data-testid="tweetText"]')?.closest('article');
        if (qArticle && qArticle !== article) tweet.hasQuoteTweet = true;
        // Media extraction (photos, videos, link cards)
        try {
          const media = { hasMedia: false, photos: [], videos: [], cards: [] };
          // Photos
          const photoImgs = article.querySelectorAll('[data-testid="tweetPhoto"] img');
          photoImgs.forEach((img) => {
            const u = img?.src || null;
            if (u) media.photos.push({ url: u });
          });
          // Link card thumbnail
          const card = article.querySelector('a[role="link"][data-testid="card.wrapper"]');
          if (card) {
            const href = card.getAttribute('href') || card.href || null;
            const img = card.querySelector('img');
            const thumb = img?.src || null;
            media.cards.push({ url: href, image: thumb });
          }
          // Videos/GIFs (best-effort detect)
          const vid = article.querySelector('video');
          if (vid) {
            const vsrc = vid.getAttribute('src') || null;
            // Try to find a poster image near the video
            const posterImg = article.querySelector('img[src*="video_thumb"], img');
            const poster = posterImg?.src || null;
            media.videos.push({ url: vsrc, poster });
          }
          if (media.photos.length || media.videos.length || media.cards.length) {
            media.hasMedia = true;
            tweet.media = media;
          }
        } catch {}

        if (tweet.tweetId && (tweet.text || tweet.timestamp)) tweets.push(tweet);
      }
      return tweets;
    };

    const data = {};
    data.type = isCommunity ? 'community' : 'profile';

    if (!isCommunity) {
      const suspendedElement = document.querySelector('[data-testid="emptyState"]');
      const pageText = document.body.innerText.toLowerCase();
      if (suspendedElement || pageText.includes('account suspended') || pageText.includes('has been suspended')) {
        data.isSuspended = true; data.suspensionDetected = true;
        data.suspensionMessage = suspendedElement?.innerText || document.querySelector('h1')?.innerText || 'Account suspended';
        return data;
      }
    }

    if (isCommunity) {
      const mainContent = document.querySelector('main');
      const h2InMain = mainContent?.querySelector('h2');
      data.communityName = h2InMain?.innerText || document.querySelector('nav h2[dir="auto"]')?.innerText || null;
      const txt = (document.querySelector('main') || document.body).innerText || '';
      const m1 = txt.match(/(\d+[\d,\.]*\s*[KMB]?)\s*Members?/i) || txt.match(/Members?\s*(\d+[\d,\.]*\s*[KMB]?)/i);
      if (m1) data.memberCount = m1[1];
      data.description = document.querySelector('[data-testid="communityDescription"], div[data-testid="community-description"], header + div span[dir="auto"]')?.innerText || null;
      const rules = [];
      document.querySelectorAll('[data-testid="communityRule"], div[aria-label*="rule"], div[role="article"] li').forEach(el => { const t = el.innerText; if (t && t.length > 5) rules.push(t); });
      data.rules = rules.length ? rules : null;
      const posts = [];
      const arts = document.querySelectorAll('article[data-testid="tweet"]');
      for (let i = 0; i < Math.min(3, arts.length); i++) {
        const a = arts[i];
        const authorName = a.querySelector('[data-testid="User-Name"] span')?.innerText;
        const tweetText = a.querySelector('[data-testid="tweetText"]')?.innerText;
        const timeEl = a.querySelector('time');
        if (tweetText) posts.push({ author: authorName || 'Unknown', text: tweetText, timestamp: timeEl?.getAttribute('datetime') || null });
      }
      data.recentPosts = posts;
      data.recentTweets = collectTweets();
      data.isPrivate = !!document.querySelector('[data-testid="communityPrivate"]');
      const mods = [];
      document.querySelectorAll('[data-testid="communityModerator"]').forEach(mod => { const n = mod.querySelector('span')?.innerText; if (n) mods.push(n); });
      if (mods.length) data.moderators = mods;
    } else {
      const nameElement = document.querySelector('[data-testid="UserName"] span');
      data.displayName = nameElement?.innerText || null;
      const handleEls = document.querySelectorAll('[data-testid="UserName"] span');
      for (const el of handleEls) { if ((el.innerText||'').startsWith('@')) { data.handle = el.innerText; break; } }
      data.bio = document.querySelector('[data-testid="UserDescription"]')?.innerText || null;
      data.isVerified = !!document.querySelector('[data-testid="UserName"] svg[aria-label*="Verified"]');
      data.followersCount = parseRelCount('followers');
      data.followingCount = parseRelCount('following');
      data.location = document.querySelector('[data-testid="UserLocation"]')?.innerText || null;
      data.profileWebsite = document.querySelector('[data-testid="UserUrl"]')?.innerText || null;
      data.joinDate = document.querySelector('[data-testid="UserJoinDate"]')?.innerText || null;
      const headerImg = document.querySelector('a[href$="/header_photo"] img') || document.querySelector('img[draggable="true"][class*="css-"]');
      data.headerImageUrl = headerImg?.src || null;
      const profileImg = document.querySelector('a[href*="/photo"] img') || document.querySelector('[data-testid*="UserAvatar-Container"] img') || document.querySelector('img[alt="Opens profile photo"]');
      data.profileImageUrl = profileImg?.src || null;
      const pinnedEl = document.querySelector('[data-testid="socialContext"]');
      if (pinnedEl && pinnedEl.innerText.includes('Pinned')) data.pinnedTweet = pinnedEl.closest('article')?.querySelector('[data-testid="tweetText"]')?.innerText || null;
      data.recentTweets = collectTweets();
      data.hasSubscription = !!document.querySelector('[data-testid*="subscribe"]');
      const bioLinks = []; document.querySelectorAll('[data-testid="UserDescription"] a')?.forEach(a => { const href = a.getAttribute('href'); if (href) bioLinks.push(href); });
      data.bioLinks = bioLinks;
    }

    return data;
  }, isCommunity);

  const twitterData = { ...profileData, scrapeSuccess: true };

  try {
    const queries = [];
    const tokenSymbol = (token?.symbol || token?.symbols || token?.ticker || '').toString().trim();
    const SYMBOL = tokenSymbol ? tokenSymbol.toUpperCase() : '';
    const MINT = token?.address || '';
    const isCashtagable = !!SYMBOL && /^[A-Z]{1,6}$/.test(SYMBOL);
    if (isCashtagable) queries.push(`$${SYMBOL}`);
    if (SYMBOL && (!isCashtagable || SYMBOL.length >= 7)) queries.push(`#${SYMBOL}`);
    if (MINT && MINT.length >= 32) queries.push(MINT);

    const collectTweetsFromDom = () => {
      const tweets = [];
      const arts = document.querySelectorAll('article[data-testid="tweet"]');
      for (let i = 0; i < arts.length; i++) {
        const a = arts[i]; const t = {};
        const authorElement = a.querySelector('[data-testid="User-Name"]');
        if (authorElement) {
          const spans = authorElement.querySelectorAll('span');
          let displayName = null, handle = null;
          for (const s of spans) { const tx = s.innerText; if (tx?.startsWith('@')) handle = tx; else if (tx && !tx.includes('·') && !displayName) displayName = tx; }
          t.author = { displayName: displayName || 'Unknown', handle: handle || null, isVerified: !!authorElement.querySelector('svg[aria-label*="Verified"]') };
        }
        t.text = a.querySelector('[data-testid="tweetText"]')?.innerText || null;
        const timeEl = a.querySelector('time'); t.timestamp = timeEl?.getAttribute('datetime') || null;
        t.likes = a.querySelector('[data-testid="like"] span')?.innerText || '0';
        t.retweets = a.querySelector('[data-testid="retweet"] span')?.innerText || '0';
        t.replies = a.querySelector('[data-testid="reply"] span')?.innerText || '0';
        t.views = a.querySelector('[data-testid="app-text-transition-container"] span')?.innerText || null;
        const link = a.querySelector('a[href*="/status/"]');
        if (link) {
          const href = link.getAttribute('href') || link.href; const m = href?.match(/\/status\/(\d+)/);
          if (m) { t.tweetId = m[1]; t.url = href?.startsWith('http') ? href : (t.author?.handle ? `https://x.com/${t.author.handle.replace('@','')}/status/${t.tweetId}` : `https://x.com${href}`); }
        }
        t.isReply = !!a.querySelector('[data-testid="inReplyToLink"]');
        t.isRetweet = !!(a.querySelector('[data-testid="socialContext"]')?.innerText.includes('reposted'));
        if (t.tweetId && (t.text || t.timestamp)) tweets.push(t);
      }
      return tweets;
    };

    for (const q of queries) {
      try {
        const url = `https://x.com/search?q=${encodeURIComponent(q)}&f=live`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1200);
        const start = Date.now(); let last = 0, stable = 0;
        while (true) {
          const count = await page.evaluate(() => document.querySelectorAll('article[data-testid="tweet"]').length);
          if (count > last) { last = count; stable = 0; } else { stable++; }
          if (last >= opts.searchMaxTweets) break;
          if (stable >= 4) break;
          if ((Date.now() - start)/1000 >= opts.searchMaxSecs) break;
          await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.95)));
          await page.waitForTimeout(500);
        }
        const found = await page.evaluate(collectTweetsFromDom);
        twitterData.recentTweets = mergeTweets(twitterData.recentTweets, found);
      } catch {}
    }
  } catch {}

  if (isCommunity) {
    try {
      const roles = await page.evaluate(() => {
        const out = { admins: [], moderators: [] };
        const candidates = Array.from(document.querySelectorAll('main [role="listitem"], main [data-testid="UserCell"], main article, main div'));
        candidates.forEach(c => {
          const tx = (c.innerText||'').toLowerCase();
          const handle = Array.from(c.querySelectorAll('span')).map(s => s.innerText).find(t => t?.startsWith('@')) || null;
          if (!handle) return;
          const displayName = Array.from(c.querySelectorAll('span')).map(s => s.innerText).find(t => t && !t.startsWith('@') && !t.includes('·')) || null;
          if (tx.includes('admin')) out.admins.push({ handle, displayName, role: 'admin' });
          else if (tx.includes('moderator') || tx.includes('mod')) out.moderators.push({ handle, displayName, role: 'moderator' });
        });
        return out;
      });
      if (roles?.admins?.length || roles?.moderators?.length) twitterData.communityRoles = roles;
    } catch {}

    if (opts.collectMembers) {
      try {
        const baseCommunityUrl = twitterUrl.split('?')[0].replace(/\/$/, '');
        await page.goto(`${baseCommunityUrl}/members`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1200);
        const collected = new Map();
        const addUsersFromDom = () => {
          const users = [];
          const nodes = document.querySelectorAll('main [role="listitem"], main [data-testid="UserCell"], main article, main div');
          nodes.forEach(n => {
            const spans = n.querySelectorAll('span');
            let displayName = null, handle = null;
            for (const s of spans) { const tx = s.innerText; if (tx?.startsWith('@')) handle = tx; else if (tx && !tx.includes('·') && !displayName) displayName = tx; }
            if (handle) users.push({ handle, displayName, role: 'member' });
          });
          return users;
        };
        let stable = 0, last = 0;
        while (collected.size < (opts.maxMembers || 50) && stable < 5) {
          const found = await page.evaluate(addUsersFromDom);
          found.forEach(u => { if (!collected.has(u.handle)) collected.set(u.handle, u); });
          if (collected.size > last) { last = collected.size; stable = 0; } else { stable++; }
          if (collected.size >= (opts.maxMembers || 50)) break;
          await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.95)));
          await page.waitForTimeout(600);
        }
        const admins = []; const moderators = []; const members = [];
        for (const u of collected.values()) members.push(u);
        twitterData.communityMembers = { counts: { totalCollected: collected.size, admins: admins.length, moderators: moderators.length, members: members.length }, admins, moderators, members };
      } catch {}
    }
  }

  if (!isCommunity && opts.enrichReplies && Array.isArray(twitterData.recentTweets)) {
    // placeholder: keep parity with original but avoid heavy reply enrichment in beta
  }

  // Optional: download media locally (photos/cards posters). Controlled by env flags.
  try {
    const SAVE_MEDIA = process.env.TOKEN_AI_SAVE_MEDIA !== '0';
    const SAVE_VIDEOS = process.env.TOKEN_AI_SAVE_VIDEOS === '1';
    if (SAVE_MEDIA && Array.isArray(twitterData.recentTweets) && token?.address) {
      const maxPerTweet = Math.max(0, parseInt(process.env.TOKEN_AI_MEDIA_MAX_PER_TWEET || '4', 10));
      const maxBytes = Math.max(1024 * 100, parseInt(process.env.TOKEN_AI_MEDIA_MAX_BYTES || String(10 * 1024 * 1024), 10)); // default 10MB
      const baseDir = process.env.TOKEN_AI_MEDIA_DIR || path.join(process.cwd(), 'token-ai', 'socials', 'reports', 'twitter-media', token.address);
      try { fs.mkdirSync(baseDir, { recursive: true }); } catch {}

      const extFromType = (ct) => {
        if (!ct) return 'bin';
        if (ct.includes('jpeg')) return 'jpg';
        if (ct.includes('png')) return 'png';
        if (ct.includes('webp')) return 'webp';
        if (ct.includes('gif')) return 'gif';
        if (ct.includes('mp4')) return 'mp4';
        return 'bin';
      };

      for (const tw of twitterData.recentTweets) {
        let saved = 0;
        const id = tw.tweetId || String(Date.now());
        // Photos
        for (const [i, p] of (tw.media?.photos || []).entries()) {
          if (saved >= maxPerTweet) break;
          const url = p?.url; if (!url) continue;
          try {
            const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000, maxContentLength: maxBytes });
            const ct = String(resp.headers['content-type'] || '').toLowerCase();
            if (!ct.startsWith('image/')) continue;
            const ext = extFromType(ct);
            const file = path.join(baseDir, `${id}-photo-${i}.${ext}`);
            fs.writeFileSync(file, resp.data);
            p.local_path = file;
            saved++;
          } catch {}
        }
        // Card thumbnails
        for (const [i, c] of (tw.media?.cards || []).entries()) {
          if (saved >= maxPerTweet) break;
          const url = c?.image; if (!url) continue;
          try {
            const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000, maxContentLength: maxBytes });
            const ct = String(resp.headers['content-type'] || '').toLowerCase();
            if (!ct.startsWith('image/')) continue;
            const ext = extFromType(ct);
            const file = path.join(baseDir, `${id}-card-${i}.${ext}`);
            fs.writeFileSync(file, resp.data);
            c.local_image = file;
            saved++;
          } catch {}
        }
        // Videos (poster by default; full video only when enabled and direct URL available)
        for (const [i, v] of (tw.media?.videos || []).entries()) {
          if (saved >= maxPerTweet) break;
          if (SAVE_VIDEOS && v?.url && /^https?:\/\//i.test(v.url)) {
            try {
              const resp = await axios.get(v.url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: maxBytes });
              const ct = String(resp.headers['content-type'] || '').toLowerCase();
              if (!ct.includes('video')) continue;
              const ext = extFromType(ct);
              const file = path.join(baseDir, `${id}-video-${i}.${ext}`);
              fs.writeFileSync(file, resp.data);
              v.local_path = file;
              saved++;
            } catch {}
          } else if (v?.poster) {
            try {
              const resp = await axios.get(v.poster, { responseType: 'arraybuffer', timeout: 12000, maxContentLength: maxBytes });
              const ct = String(resp.headers['content-type'] || '').toLowerCase();
              if (!ct.startsWith('image/')) continue;
              const ext = extFromType(ct);
              const file = path.join(baseDir, `${id}-video-poster-${i}.${ext}`);
              fs.writeFileSync(file, resp.data);
              v.local_poster = file;
              saved++;
            } catch {}
          }
        }
      }
    }
  } catch {}

  if (opts.debugScreenshots) {
    try { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300); await page.screenshot({ path: `screenshots/x-${Date.now()}.png`, fullPage: false }); } catch {}
  }

  return twitterData;
}
