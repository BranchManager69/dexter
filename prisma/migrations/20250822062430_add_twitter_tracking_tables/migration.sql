-- CreateTable
CREATE TABLE "twitter_snapshots" (
    "id" SERIAL NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "snapshot_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "follower_count" INTEGER,
    "following_count" INTEGER,
    "tweet_count" INTEGER,
    "is_verified" BOOLEAN,
    "profile_image_url" TEXT,
    "header_image_url" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "website" TEXT,
    "join_date" TEXT,

    CONSTRAINT "twitter_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twitter_community_snapshots" (
    "id" SERIAL NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "community_url" TEXT NOT NULL,
    "community_name" TEXT,
    "snapshot_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "member_count" INTEGER,
    "description" TEXT,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB,

    CONSTRAINT "twitter_community_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twitter_tweets" (
    "tweet_id" VARCHAR(32) NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "author_handle" VARCHAR(50) NOT NULL,
    "author_name" TEXT,
    "author_verified" BOOLEAN NOT NULL DEFAULT false,
    "tweet_text" TEXT,
    "tweet_timestamp" TIMESTAMPTZ(6) NOT NULL,
    "tweet_url" TEXT,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "likes_count" INTEGER DEFAULT 0,
    "retweets_count" INTEGER DEFAULT 0,
    "replies_count" INTEGER DEFAULT 0,
    "views_count" BIGINT,
    "is_reply" BOOLEAN NOT NULL DEFAULT false,
    "reply_to_handle" VARCHAR(50),
    "is_retweet" BOOLEAN NOT NULL DEFAULT false,
    "retweet_of_handle" VARCHAR(50),
    "is_quote_tweet" BOOLEAN NOT NULL DEFAULT false,
    "quoted_tweet_id" VARCHAR(32),
    "is_thread" BOOLEAN NOT NULL DEFAULT false,
    "has_media" BOOLEAN NOT NULL DEFAULT false,
    "media_urls" JSONB,
    "hashtags" JSONB,
    "mentions" JSONB,
    "external_links" JSONB,

    CONSTRAINT "twitter_tweets_pkey" PRIMARY KEY ("tweet_id")
);

-- CreateIndex
CREATE INDEX "twitter_snapshots_token_address_snapshot_time_idx" ON "twitter_snapshots"("token_address", "snapshot_time");

-- CreateIndex
CREATE INDEX "twitter_snapshots_snapshot_time_idx" ON "twitter_snapshots"("snapshot_time");

-- CreateIndex
CREATE INDEX "twitter_community_snapshots_token_address_snapshot_time_idx" ON "twitter_community_snapshots"("token_address", "snapshot_time");

-- CreateIndex
CREATE INDEX "twitter_community_snapshots_community_url_idx" ON "twitter_community_snapshots"("community_url");

-- CreateIndex
CREATE INDEX "twitter_tweets_token_address_tweet_timestamp_idx" ON "twitter_tweets"("token_address", "tweet_timestamp");

-- CreateIndex
CREATE INDEX "twitter_tweets_author_handle_idx" ON "twitter_tweets"("author_handle");

-- CreateIndex
CREATE INDEX "twitter_tweets_deleted_at_idx" ON "twitter_tweets"("deleted_at");

-- CreateIndex
CREATE INDEX "twitter_tweets_first_seen_at_idx" ON "twitter_tweets"("first_seen_at");

-- AddForeignKey
ALTER TABLE "twitter_snapshots" ADD CONSTRAINT "twitter_snapshots_token_address_fkey" FOREIGN KEY ("token_address") REFERENCES "tokens"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twitter_community_snapshots" ADD CONSTRAINT "twitter_community_snapshots_token_address_fkey" FOREIGN KEY ("token_address") REFERENCES "tokens"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twitter_tweets" ADD CONSTRAINT "twitter_tweets_token_address_fkey" FOREIGN KEY ("token_address") REFERENCES "tokens"("address") ON DELETE CASCADE ON UPDATE CASCADE;
