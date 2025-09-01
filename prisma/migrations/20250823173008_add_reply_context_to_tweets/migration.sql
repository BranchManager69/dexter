-- AlterTable
ALTER TABLE "twitter_tweets" ADD COLUMN     "replied_tweet_data" JSONB,
ADD COLUMN     "replied_tweet_id" VARCHAR(32);
