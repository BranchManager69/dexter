-- Add attempts_per_second field to vanity_wallet_pool table for performance analytics
ALTER TABLE "vanity_wallet_pool" ADD COLUMN "attempts_per_second" DOUBLE PRECISION;

-- Add index for performance queries
CREATE INDEX "vanity_wallet_pool_attempts_per_second_idx" ON "vanity_wallet_pool"("attempts_per_second");