// token-ai/socials/tools/twitter.js

import { chromium } from 'playwright';
import { scrapeTwitter } from '../twitter/scrape.js';

async function getContext(existingContext, storageStatePath) {
  if (existingContext) return { context: existingContext, browser: null };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath && typeof storageStatePath === 'string' ? storageStatePath : undefined });
  return { context, browser };
}

export async function get_twitter_profile({ token, twitterUrl, context, storageStatePath } = {}) {
  const { context: ctx, browser } = await getContext(context, storageStatePath);
  try {
    const page = await ctx.newPage();
    const data = await scrapeTwitter(token || {}, { page, context: ctx, twitterUrl, enrichReplies: false, collectMembers: false, searchMaxSecs: 0, searchMaxTweets: 0 });
    await page.close();
    return data ? {
      handle: data.handle,
      displayName: data.displayName,
      bio: data.bio,
      isVerified: !!data.isVerified,
      followersCount: data.followersCount,
      followingCount: data.followingCount,
      joinDate: data.joinDate,
      profileImageUrl: data.profileImageUrl,
      headerImageUrl: data.headerImageUrl,
      hasSubscription: !!data.hasSubscription,
      isSuspended: !!data.isSuspended,
      suspensionMessage: data.suspensionMessage || null,
    } : null;
  } finally {
    if (browser) await browser.close();
  }
}

export async function get_twitter_recent_tweets({ token, twitterUrl, context, storageStatePath, limit = 50, include_replies = true } = {}) {
  const { context: ctx, browser } = await getContext(context, storageStatePath);
  try {
    const page = await ctx.newPage();
    const data = await scrapeTwitter(token || {}, { page, context: ctx, twitterUrl, enrichReplies: false, collectMembers: false, searchMaxSecs: 0, searchMaxTweets: 0 });
    await page.close();
    let tweets = Array.isArray(data?.recentTweets) ? data.recentTweets : [];
    if (!include_replies) tweets = tweets.filter(t => !t.isReply);
    if (limit && tweets.length > limit) tweets = tweets.slice(0, limit);
    return tweets;
  } finally {
    if (browser) await browser.close();
  }
}

export async function get_twitter_community_meta({ token, twitterUrl, context, storageStatePath } = {}) {
  const { context: ctx, browser } = await getContext(context, storageStatePath);
  try {
    const page = await ctx.newPage();
    const data = await scrapeTwitter(token || {}, { page, context: ctx, twitterUrl, enrichReplies: false, collectMembers: false, searchMaxSecs: 0, searchMaxTweets: 0 });
    await page.close();
    if (!data || data.type !== 'community') return null;
    return {
      communityName: data.communityName,
      memberCount: data.memberCount,
      description: data.description,
      isPrivate: !!data.isPrivate,
      rules: data.rules || null,
    };
  } finally {
    if (browser) await browser.close();
  }
}

export async function get_twitter_community_posts({ token, twitterUrl, context, storageStatePath, limit = 10 } = {}) {
  const { context: ctx, browser } = await getContext(context, storageStatePath);
  try {
    const page = await ctx.newPage();
    const data = await scrapeTwitter(token || {}, { page, context: ctx, twitterUrl, enrichReplies: false, collectMembers: false, searchMaxSecs: 0, searchMaxTweets: 0 });
    await page.close();
    const posts = Array.isArray(data?.recentPosts) ? data.recentPosts : [];
    return posts.slice(0, limit);
  } finally {
    if (browser) await browser.close();
  }
}

export async function get_twitter_community_members({ token, twitterUrl, context, storageStatePath, limit = 200 } = {}) {
  const { context: ctx, browser } = await getContext(context, storageStatePath);
  try {
    const page = await ctx.newPage();
    const data = await scrapeTwitter(token || {}, { page, context: ctx, twitterUrl, collectMembers: true, maxMembers: limit, enrichReplies: false, searchMaxSecs: 0, searchMaxTweets: 0 });
    await page.close();
    const cm = data?.communityMembers || { admins: [], moderators: [], members: [] };
    return cm;
  } finally {
    if (browser) await browser.close();
  }
}

