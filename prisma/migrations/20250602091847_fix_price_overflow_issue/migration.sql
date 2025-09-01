-- AlterTable
ALTER TABLE "ai_decisions" ALTER COLUMN "price_impact" SET DATA TYPE DECIMAL(20,8);

-- AlterTable
ALTER TABLE "pool_price_changes" ALTER COLUMN "changePercent" SET DATA TYPE DECIMAL(20,8);

-- AlterTable
ALTER TABLE "token_prices" ALTER COLUMN "change_24h" SET DATA TYPE DECIMAL(20,8);
