-- AlterTable
ALTER TABLE "token_pools" ADD COLUMN     "labels" TEXT,
ADD COLUMN     "liquidity_usd" DECIMAL(20,2),
ADD COLUMN     "pool_price" DECIMAL(20,10),
ADD COLUMN     "volume_24h" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "pool_derived_liquidity" DECIMAL(20,2),
ADD COLUMN     "pool_derived_market_cap" DECIMAL(20,2),
ADD COLUMN     "pool_derived_price" DECIMAL(20,10),
ADD COLUMN     "pool_derived_volume_24h" DECIMAL(20,2),
ADD COLUMN     "pool_price_calculated_at" TIMESTAMPTZ(6),
ADD COLUMN     "price_calculation_method" VARCHAR(50);

-- CreateIndex
CREATE INDEX "token_pools_liquidity_usd_idx" ON "token_pools"("liquidity_usd" DESC);

-- CreateIndex
CREATE INDEX "token_pools_volume_24h_idx" ON "token_pools"("volume_24h" DESC);
