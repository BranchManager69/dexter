// token-ai/socials/tools/derivers.js

export function summarize_website_signal(site) {
  if (!site || site.success === false) return { success: false, reason: site?.error || 'no site' };
  const title = site.meta?.title || '';
  const desc = site.meta?.description || '';
  const hasSocials = Object.values(site.socialLinks || {}).some(arr => (arr||[]).length > 0);
  const addrCount = site.detectedAddresses?.all?.length || 0;
  const legitimacyCues = [];
  if (hasSocials) legitimacyCues.push('has_social_links');
  if (title.length > 0) legitimacyCues.push('has_title');
  if (desc.length > 0) legitimacyCues.push('has_description');
  if (addrCount > 0) legitimacyCues.push('mentions_solana_addresses');
  return {
    success: true,
    title: title.slice(0,100),
    hasSocials,
    addrCount,
    legitimacyCues,
    summary: `${title ? title + ' — ' : ''}${desc.slice(0,140)}`,
  };
}

export function summarize_twitter_signal(profileAndTweets) {
  if (!profileAndTweets) return { success: false, reason: 'no data' };
  const pd = profileAndTweets;
  const tweets = Array.isArray(pd.recentTweets) ? pd.recentTweets : [];
  const n = tweets.length;
  const avgLikes = n ? Math.round(tweets.reduce((a,b)=> a + (parseInt((b.likes||'0').toString().replace(/[,]/g,''))||0),0)/n) : 0;
  const replies = tweets.filter(t => t.isReply).length;
  const retweets = tweets.filter(t => t.isRetweet).length;
  const cadenceHint = n >= 10 ? 'high' : (n >= 3 ? 'medium' : 'low');
  const textConcat = tweets.slice(0,10).map(t=>t.text||'').join(' ').toLowerCase();
  const cta = /buy|launch|presale|mint|token|airdrop/.test(textConcat);
  return {
    success: true,
    handle: pd.handle,
    followers: pd.followersCount ?? null,
    cadence: cadenceHint,
    avgLikes,
    mix: { replies, retweets, original: n - replies - retweets },
    hasCTAStyle: cta,
  };
}

export function summarize_community_signal({ xCommunity, telegram, discord } = {}) {
  const out = { success: true, hints: [] };
  if (xCommunity) {
    const members = parseInt((xCommunity.memberCount||'').toString().replace(/[,KMB]/gi,'')) || null;
    if (members) out.hints.push(members > 1000 ? 'x_comm_large' : 'x_comm_small');
    if (xCommunity.rules?.length) out.hints.push('x_comm_has_rules');
  }
  if (telegram) {
    if (telegram.memberCount) out.hints.push(telegram.memberCount > 1000 ? 'tg_large' : 'tg_small');
    if (telegram.hasProtectedContent) out.hints.push('tg_protected');
  }
  if (discord) {
    out.hints.push('discord_present');
  }
  return out;
}

export function compile_official_presence({ dbLinks = [], discovered = [] } = {}) {
  const map = new Map();
  const push = (type, url, source) => {
    if (!url) return; const key = `${type}:${url}`.toLowerCase();
    if (!map.has(key)) map.set(key, { type, url, sources: new Set([source]) });
    else map.get(key).sources.add(source);
  };
  dbLinks.forEach(l => push(l.type, l.url, 'db'));
  discovered.forEach(l => push(l.type, l.url, 'site'));
  const items = Array.from(map.values()).map(v => ({ type: v.type, url: v.url, sources: Array.from(v.sources) }));
  return { items };
}

