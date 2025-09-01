/*
  Warnings:

  - Made the column `whale_status` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `checked_at` on table `whale_status_history` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "whale_status_history" DROP CONSTRAINT "fk_whale_history_user";

-- DropIndex
DROP INDEX "idx_users_degen_balance";

-- DropIndex
DROP INDEX "idx_users_whale_status";

-- DropIndex
DROP INDEX "idx_users_whale_tier";

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "degenduel_score" DECIMAL(20,8) DEFAULT 0,
ADD COLUMN     "momentum_indicator" VARCHAR(50) DEFAULT 'stable',
ADD COLUMN     "score_calculated_at" TIMESTAMPTZ(6),
ADD COLUMN     "trend_category" VARCHAR(50) DEFAULT 'Active';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "whale_status" SET NOT NULL;

-- AlterTable
ALTER TABLE "whale_status_history" ALTER COLUMN "checked_at" SET NOT NULL;

-- CreateIndex
CREATE INDEX "idx_tokens_degenduel_score" ON "tokens"("degenduel_score" DESC);

-- CreateIndex
CREATE INDEX "idx_tokens_active_score" ON "tokens"("is_active", "degenduel_score" DESC);

-- CreateIndex
CREATE INDEX "idx_tokens_trend_category" ON "tokens"("trend_category");

-- CreateIndex
CREATE INDEX "idx_tokens_common_query" ON "tokens"("is_active", "metadata_status", "degenduel_score" DESC);

-- AddForeignKey
ALTER TABLE "whale_status_history" ADD CONSTRAINT "whale_status_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
