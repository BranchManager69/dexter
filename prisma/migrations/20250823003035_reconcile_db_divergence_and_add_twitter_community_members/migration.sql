-- DropForeignKey
ALTER TABLE "twitter_community_snapshots" DROP CONSTRAINT "twitter_community_snapshots_token_address_fkey";

-- DropForeignKey
ALTER TABLE "twitter_snapshots" DROP CONSTRAINT "twitter_snapshots_token_address_fkey";

-- DropForeignKey
ALTER TABLE "twitter_tweets" DROP CONSTRAINT "twitter_tweets_token_address_fkey";

-- AlterTable
ALTER TABLE "twitter_tweets" ALTER COLUMN "tweet_timestamp" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "twitter_community_members" (
    "token_address" VARCHAR(44) NOT NULL,
    "community_url" TEXT NOT NULL,
    "user_handle" VARCHAR(50) NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twitter_community_members_pkey" PRIMARY KEY ("community_url","user_handle")
);

-- CreateIndex
CREATE INDEX "twitter_community_members_token_address_idx" ON "twitter_community_members"("token_address");

-- CreateIndex
CREATE INDEX "twitter_community_members_community_url_idx" ON "twitter_community_members"("community_url");

-- CreateIndex
CREATE INDEX "twitter_community_members_role_idx" ON "twitter_community_members"("role");
