/*
  Warnings:

  - You are about to drop the `token_price_updates` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "token_price_updates" DROP CONSTRAINT "token_price_updates_tokenAddress_fkey";

-- DropTable
DROP TABLE "token_price_updates";

-- CreateTable
CREATE TABLE "pool_price_changes" (
    "id" SERIAL NOT NULL,
    "tokenAddress" VARCHAR(44) NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "previousPrice" DECIMAL(20,8) NOT NULL,
    "changePercent" DECIMAL(10,2) NOT NULL,
    "liquidity" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pool_price_changes_tokenAddress_idx" ON "pool_price_changes"("tokenAddress");

-- CreateIndex
CREATE INDEX "pool_price_changes_poolAddress_idx" ON "pool_price_changes"("poolAddress");

-- CreateIndex
CREATE INDEX "pool_price_changes_timestamp_idx" ON "pool_price_changes"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "pool_price_changes_tokenAddress_timestamp_idx" ON "pool_price_changes"("tokenAddress", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "pool_price_changes_changePercent_idx" ON "pool_price_changes"("changePercent" DESC);

-- AddForeignKey
ALTER TABLE "pool_price_changes" ADD CONSTRAINT "pool_price_changes_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "tokens"("address") ON DELETE CASCADE ON UPDATE CASCADE;
