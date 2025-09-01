-- CreateTable
CREATE TABLE "token_price_updates" (
    "id" SERIAL NOT NULL,
    "tokenAddress" VARCHAR(44) NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "previousPrice" DECIMAL(20,8) NOT NULL,
    "changePercent" DECIMAL(10,2) NOT NULL,
    "liquidity" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_price_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_price_updates_tokenAddress_idx" ON "token_price_updates"("tokenAddress");

-- CreateIndex
CREATE INDEX "token_price_updates_poolAddress_idx" ON "token_price_updates"("poolAddress");

-- CreateIndex
CREATE INDEX "token_price_updates_timestamp_idx" ON "token_price_updates"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_price_updates_tokenAddress_timestamp_idx" ON "token_price_updates"("tokenAddress", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_price_updates_changePercent_idx" ON "token_price_updates"("changePercent" DESC);

-- AddForeignKey
ALTER TABLE "token_price_updates" ADD CONSTRAINT "token_price_updates_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "tokens"("address") ON DELETE CASCADE ON UPDATE CASCADE;
