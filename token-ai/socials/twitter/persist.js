// token-ai/socials/twitter/persist.js

import prisma from '../../../config/prisma.js';

export async function persistTwitterData(tokenAddress, tokenData, helpers) {
  const { parseMetricCount, normalizeJoinDate } = helpers;
  const result = { tweetsCreated: 0, tweetsUpdated: 0 };

  const td = tokenData?.twitter_data || null;
  if (!td) return result;

  if (td.handle && !td.isSuspended) {
    await prisma.twitter_snapshots.create({
      data: {
        token_address: tokenAddress,
        handle: td.handle,
        display_name: td.displayName,
        follower_count: parseMetricCount(td.followersCount),
        following_count: parseMetricCount(td.followingCount),
        tweet_count: td.recentTweets?.length || 0,
        is_verified: td.isVerified || false,
        profile_image_url: td.profileImageUrl,
        header_image_url: td.headerImageUrl,
        bio: td.bio,
        location: td.location,
        website: td.profileWebsite,
        join_date: normalizeJoinDate(td.joinDate)
      }
    });
  }

  if (td.type === 'community' && td.communityName) {
    const twitterUrl = tokenData.socials_from_db?.find(s => s.type === 'twitter')?.url;
    await prisma.twitter_community_snapshots.create({
      data: {
        token_address: tokenAddress,
        community_url: twitterUrl || td.communityUrl || '',
        community_name: td.communityName,
        member_count: parseMetricCount(td.memberCount),
        description: td.description,
        is_private: td.isPrivate || false,
        rules: td.rules || null,
      }
    });
  }

  if (Array.isArray(td.recentTweets) && td.recentTweets.length) {
    for (const tweet of td.recentTweets) {
      if (tweet.author?.handle && td.handle && tweet.author.handle !== td.handle && !tweet.isRetweet) continue;
      if (!tweet.tweetId) continue;

      const existing = await prisma.twitter_tweets.findUnique({ where: { tweet_id: tweet.tweetId } });
      if (existing) {
        await prisma.twitter_tweets.update({
          where: { tweet_id: tweet.tweetId },
          data: {
            last_seen_at: new Date(),
            likes_count: parseMetricCount(tweet.likes) ?? 0,
            retweets_count: parseMetricCount(tweet.retweets) ?? 0,
            replies_count: parseMetricCount(tweet.replies) ?? 0,
            views_count: tweet.views ? BigInt(parseMetricCount(tweet.views) ?? 0) : null,
            replied_tweet_id: tweet.repliedTweetId ?? undefined,
            replied_tweet_data: tweet.repliedContext ?? undefined,
          }
        });
        result.tweetsUpdated++;
      } else {
        const persistedAuthor = tweet.isRetweet
          ? (td.handle || tweet.author?.handle || 'unknown')
          : (tweet.author?.handle || td.handle || 'unknown');

        await prisma.twitter_tweets.create({
          data: {
            tweet_id: tweet.tweetId,
            token_address: tokenAddress,
            author_handle: persistedAuthor,
            author_name: tweet.author?.displayName,
            author_verified: tweet.author?.isVerified || false,
            tweet_text: tweet.text,
            tweet_timestamp: tweet.timestamp ? new Date(tweet.timestamp) : new Date(),
            tweet_url: tweet.url,
            likes_count: parseMetricCount(tweet.likes) ?? 0,
            retweets_count: parseMetricCount(tweet.retweets) ?? 0,
            replies_count: parseMetricCount(tweet.replies) ?? 0,
            views_count: tweet.views ? BigInt(parseMetricCount(tweet.views) ?? 0) : null,
            is_reply: tweet.isReply || false,
            reply_to_handle: tweet.replyingTo,
            replied_tweet_id: tweet.repliedTweetId || null,
            replied_tweet_data: tweet.repliedContext || null,
            is_retweet: tweet.isRetweet || false,
            retweet_of_handle: tweet.originalAuthor?.handle,
            is_quote_tweet: tweet.hasQuoteTweet || false,
            quoted_tweet_id: tweet.quotedTweet?.tweetId || null,
            quoted_tweet_data: tweet.quotedTweet || null,
            is_thread: tweet.isPartOfThread || false,
            has_media: tweet.media?.hasMedia || false,
            media_urls: tweet.media || null,
            hashtags: tweet.hashtags || null,
            mentions: tweet.mentions || null,
            external_links: tweet.externalLinks || null,
          }
        });
        result.tweetsCreated++;
      }
    }

    const seenTweetIds = td.recentTweets
      .filter(t => t.tweetId && (!t.author?.handle || !td.handle || t.author.handle === td.handle))
      .map(t => t.tweetId);

    if (seenTweetIds.length > 0 && td.handle && process.env.SOCIAL_MARK_DELETED === '1') {
      await prisma.twitter_tweets.updateMany({
        where: {
          token_address: tokenAddress,
          author_handle: td.handle,
          tweet_id: { notIn: seenTweetIds },
          deleted_at: null,
        },
        data: { deleted_at: new Date() },
      });
    }
  }

  if (td.communityMembers) {
    const communityUrl = tokenData.socials_from_db?.find(s => s.type === 'twitter')?.url || td.communityUrl || null;
    if (communityUrl) {
      const upsert = async (u) => {
        if (!u?.handle) return;
        try {
          await prisma.twitter_community_members.upsert({
            where: { community_url_user_handle: { community_url: communityUrl, user_handle: u.handle } },
            update: {
              display_name: u.displayName || null,
              avatar_url: u.avatar || null,
              role: u.role || 'member',
              last_seen_at: new Date(),
            },
            create: {
              token_address: tokenAddress,
              community_url: communityUrl,
              user_handle: u.handle,
              display_name: u.displayName || null,
              avatar_url: u.avatar || null,
              role: u.role || 'member',
              first_seen_at: new Date(),
              last_seen_at: new Date(),
            }
          });
        } catch {}
      };
      const cm = td.communityMembers;
      for (const u of [ ...(cm.admins||[]), ...(cm.moderators||[]), ...(cm.members||[]) ]) await upsert(u);
    }
  }

  if (td.communityRoles) {
    const communityUrl = tokenData.socials_from_db?.find(s => s.type === 'twitter')?.url || td.communityUrl || null;
    if (communityUrl) {
      const upsert = async (u) => {
        if (!u?.handle) return;
        try {
          await prisma.twitter_community_members.upsert({
            where: { community_url_user_handle: { community_url: communityUrl, user_handle: u.handle } },
            update: {
              display_name: u.displayName || null,
              avatar_url: u.avatar || null,
              role: u.role || 'member',
              last_seen_at: new Date(),
            },
            create: {
              token_address: tokenAddress,
              community_url: communityUrl,
              user_handle: u.handle,
              display_name: u.displayName || null,
              avatar_url: u.avatar || null,
              role: u.role || 'member',
              first_seen_at: new Date(),
              last_seen_at: new Date(),
            }
          });
        } catch {}
      };
      for (const u of (td.communityRoles.admins || [])) await upsert(u);
      for (const u of (td.communityRoles.moderators || [])) await upsert(u);
    }
  }

  return result;
}

