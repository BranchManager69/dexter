// Format orchestrator data into readable text for AI comprehension
// This converts the nested JSON structure into a narrative format

export function formatOrchestratorData(data) {
  if (!data) return '';
  
  const sections = [];
  
  // Header with token basics
  sections.push('=== TOKEN OVERVIEW ===');
  if (data.symbol || data.name) {
    sections.push(`Token: ${data.symbol || 'Unknown'} (${data.name || 'Unknown'})`);
  }
  sections.push(`Address: ${data.address}`);
  sections.push('');
  
  // Market Data
  if (data.market) {
    sections.push('=== MARKET DATA ===');
    const m = data.market;
    if (m.price !== undefined) sections.push(`Price: $${m.price}`);
    if (m.fdv !== undefined) sections.push(`FDV: $${m.fdv.toLocaleString()}`);
    if (m.liquidity !== undefined) sections.push(`Liquidity: $${m.liquidity.toLocaleString()}`);
    if (m.vol24h !== undefined) sections.push(`24h Volume: $${m.vol24h.toLocaleString()}`);
    if (m.vol1h !== undefined) sections.push(`1h Volume: $${m.vol1h.toLocaleString()}`);
    
    if (m.top_pool) {
      sections.push(`\nTop Pool:`);
      sections.push(`  Chain: ${m.top_pool.chain}`);
      sections.push(`  DEX: ${m.top_pool.dex}`);
      if (m.top_pool.pairAddress) sections.push(`  Pair: ${m.top_pool.pairAddress}`);
      if (m.top_pool.baseToken) {
        sections.push(`  Base Token: ${m.top_pool.baseToken.symbol} (${m.top_pool.baseToken.name})`);
      }
    }
    sections.push('');
  }
  
  // Official Links
  if (data.official_links && data.official_links.length > 0) {
    sections.push('=== OFFICIAL LINKS ===');
    data.official_links.forEach(link => {
      sections.push(`${link.platform}: ${link.url}`);
    });
    sections.push('');
  }
  
  // Website Content
  if (data.website) {
    sections.push('=== WEBSITE ===');
    sections.push(`URL: ${data.website.url}`);
    if (data.website.meta?.title) sections.push(`Title: ${data.website.meta.title}`);
    if (data.website.meta?.description) sections.push(`Description: ${data.website.meta.description}`);
    
    if (data.website.fullText) {
      sections.push('\nWebsite Content:');
      // Include full text, no truncation
      sections.push(data.website.fullText);
    }
    
    if (data.website.socialLinks && data.website.socialLinks.length > 0) {
      sections.push('\nSocial Links Found on Website:');
      data.website.socialLinks.forEach(link => {
        sections.push(`  - ${link.platform}: ${link.url}`);
      });
    }
    sections.push('');
  }
  
  // Telegram
  if (data.telegram) {
    sections.push('=== TELEGRAM ===');
    if (data.telegram.handle) sections.push(`Handle: @${data.telegram.handle}`);
    if (data.telegram.title) sections.push(`Title: ${data.telegram.title}`);
    if (data.telegram.memberCount !== undefined) sections.push(`Members: ${data.telegram.memberCount.toLocaleString()}`);
    if (data.telegram.description) {
      sections.push(`Description: ${data.telegram.description}`);
    }
    sections.push('');
  }
  
  // Twitter/X - Profile
  if (data.twitter) {
    sections.push('=== TWITTER/X ===');
    const t = data.twitter;
    
    if (t.handle) {
      sections.push(`Profile: @${t.handle}`);
      if (t.displayName) sections.push(`Name: ${t.displayName}`);
      if (t.isVerified) sections.push(`Verified: ✓`);
      if (t.followersCount !== undefined) sections.push(`Followers: ${t.followersCount.toLocaleString()}`);
      if (t.bio) sections.push(`Bio: ${t.bio}`);
    }
    
    // Recent Tweets - FULL CONTENT, NO TRUNCATION
    if (t.recentTweets && t.recentTweets.length > 0) {
      sections.push('\n--- RECENT TWEETS ---');
      t.recentTweets.forEach((tweet, idx) => {
        sections.push(`\nTweet ${idx + 1}:`);
        sections.push(`Author: @${tweet.author}`);
        sections.push(`Time: ${tweet.timestamp}`);
        sections.push(`Engagement: ${tweet.likes || 0} likes, ${tweet.retweets || 0} RTs, ${tweet.views || 0} views`);
        if (tweet.media && tweet.media.length > 0) {
          sections.push(`Media: ${tweet.media.length} attachment(s)`);
        }
        sections.push(`URL: ${tweet.url}`);
        sections.push('Content:');
        // FULL TWEET TEXT - NO TRUNCATION
        sections.push(tweet.text);
        sections.push('---');
      });
    }
    
    // Community Posts - FULL CONTENT
    if (t.communityPosts && t.communityPosts.length > 0) {
      sections.push('\n--- X COMMUNITY POSTS ---');
      t.communityPosts.forEach((post, idx) => {
        sections.push(`\nCommunity Post ${idx + 1}:`);
        sections.push(`Author: @${post.author}`);
        sections.push(`Time: ${post.timestamp}`);
        sections.push(`Engagement: ${post.likes || 0} likes, ${post.retweets || 0} RTs`);
        sections.push('Content:');
        // FULL POST TEXT - NO TRUNCATION
        sections.push(post.text);
        sections.push('---');
      });
    }
    
    // Community Info
    if (t.community) {
      sections.push('\n--- X COMMUNITY INFO ---');
      const c = t.community;
      if (c.name) sections.push(`Name: ${c.name}`);
      if (c.memberCount !== undefined) sections.push(`Members: ${c.memberCount.toLocaleString()}`);
      if (c.description) sections.push(`Description: ${c.description}`);
      if (c.rules && c.rules.length > 0) {
        sections.push('Rules:');
        c.rules.forEach((rule, idx) => {
          sections.push(`  ${idx + 1}. ${rule.title}: ${rule.description}`);
        });
      }
    }
    
    // Community Members
    if (t.communityMembers && t.communityMembers.length > 0) {
      sections.push(`\nCommunity Members (${t.communityMembers.length} collected):`);
      const memberList = t.communityMembers.map(m => `@${m.handle} (${m.followersCount || 0} followers)`);
      sections.push(memberList.join(', '));
    }
    
    sections.push('');
  }
  
  return sections.join('\n');
}