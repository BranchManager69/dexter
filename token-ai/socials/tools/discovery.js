// token-ai/socials/tools/discovery.js

// Normalize handles and build canonical URLs per platform
export function resolve_social_handle(raw, platform) {
  if (!raw) return null;
  const s = String(raw).trim();
  const out = { platform, handle: null, url: null };

  const toHandle = (h) => (h.startsWith('@') ? h : `@${h}`);

  switch ((platform || '').toLowerCase()) {
    case 'twitter':
    case 'x': {
      // Robust handling: preserve community URLs; only treat simple /<handle> as a profile
      try {
        if (/^https?:\/\//i.test(s)) {
          const u = new URL(s);
          if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(u.hostname)) break;
          const segs = u.pathname.split('/').filter(Boolean); // e.g., ['i','communities','123'] or ['elonmusk']
          // Community URLs: /i/communities/<id>
          if (segs.length >= 3 && segs[0].toLowerCase() === 'i' && segs[1].toLowerCase() === 'communities') {
            const id = segs[2];
            out.handle = null;
            out.url = `https://x.com/i/communities/${id}`;
            break;
          }
          // Profile handle URLs
          const reserved = new Set(['i','home','explore','settings','notifications','messages','compose','search','hashtag','intent','share','login','signup']);
          if (segs.length >= 1) {
            const candidate = segs[0];
            if (!reserved.has(candidate.toLowerCase()) && /^[A-Za-z0-9_]{1,15}$/.test(candidate)) {
              out.handle = toHandle(candidate);
              out.url = `https://x.com/${candidate}`;
              break;
            }
          }
          // Unknown X path → keep full URL, no handle
          out.handle = null;
          out.url = s;
          break;
        }
      } catch {}
      // Non-URL: treat as handle like @name or name
      const hm = s.match(/^@?([A-Za-z0-9_]{1,15})$/);
      if (hm) {
        out.handle = toHandle(hm[1]);
        out.url = `https://x.com/${hm[1]}`;
      }
      break;
    }
    case 'telegram': {
      // Accept t.me/@username links or @username
      const m = s.match(/(?:https?:\/\/t\.me\/)?@?([A-Za-z0-9_]{5,64})/i);
      if (m) {
        out.handle = toHandle(m[1]);
        out.url = `https://t.me/${m[1]}`;
      }
      break;
    }
    case 'discord': {
      // Accept discord.com/invite/<code> or discord.gg/<code>
      const m = s.match(/(?:https?:\/\/(?:discord\.gg|discord\.com\/invite)\/)([A-Za-z0-9-]+)/i);
      if (m) {
        out.handle = null;
        out.url = `https://discord.gg/${m[1]}`;
      }
      break;
    }
    case 'github': {
      const m = s.match(/(?:https?:\/\/github\.com\/)([A-Za-z0-9_.-]{1,100})(?:\b|\/|$)/i);
      if (m) {
        out.handle = toHandle(m[1]);
        out.url = `https://github.com/${m[1]}`;
      }
      break;
    }
    case 'youtube': {
      // Keep URL as-is if looks like YT
      if (/youtube\.com|youtu\.be/i.test(s)) { out.url = s; }
      break;
    }
    case 'medium': {
      if (/medium\.com/i.test(s)) { out.url = s; }
      break;
    }
    case 'reddit': {
      if (/reddit\.com/i.test(s)) { out.url = s; }
      break;
    }
    case 'website': {
      if (/^https?:\/\//i.test(s)) out.url = s;
      break;
    }
  }
  return (out.handle || out.url) ? out : null;
}

// Merge DB links and website-extracted socials into a canonical set
export function discover_official_links(dbLinks = [], sitePayloads = []) {
  const candidates = [];

  // From DB
  for (const l of dbLinks) {
    if (!l?.type || !l?.url) continue;
    const p = l.type.toLowerCase();
    const r = resolve_social_handle(l.url, p);
    if (r) candidates.push({ ...r, source: 'db', confidence: 0.9 });
  }

  // From extracted sites
  for (const site of sitePayloads) {
    const sl = site?.socialLinks || {};
    const pushArr = (type, arr) => {
      (arr || []).forEach((item) => {
        const r = resolve_social_handle(item?.href || item, type);
        if (r) candidates.push({ ...r, source: 'site', confidence: 0.6 });
      });
    };
    pushArr('twitter', sl.twitter);
    pushArr('telegram', sl.telegram);
    pushArr('discord', sl.discord);
    pushArr('github', sl.github);
    pushArr('medium', sl.medium);
    pushArr('youtube', sl.youtube);
    pushArr('reddit', sl.reddit);
  }

  // Deduplicate preferring DB over site by confidence
  const key = (r) => `${r.platform || ''}:${(r.url || r.handle || '').toLowerCase()}`;
  const map = new Map();
  for (const c of candidates) {
    const k = key(c);
    const prev = map.get(k);
    if (!prev || (c.confidence || 0) > (prev.confidence || 0)) map.set(k, c);
  }

  // Return sorted by platform then by confidence desc
  const list = Array.from(map.values()).sort((a, b) => {
    if ((a.platform || '').localeCompare(b.platform || '') !== 0) return (a.platform || '').localeCompare(b.platform || '');
    return (b.confidence || 0) - (a.confidence || 0);
  });
  return list;
}
