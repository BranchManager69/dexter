-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "last_price_change" TIMESTAMP(3),
ADD COLUMN     "last_refresh_attempt" TIMESTAMP(3),
ADD COLUMN     "last_refresh_success" TIMESTAMP(3),
ADD COLUMN     "priority_score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refresh_interval_seconds" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "refresh_metadata" JSONB DEFAULT '{}';
