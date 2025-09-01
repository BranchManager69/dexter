-- CreateIndex
CREATE INDEX "idx_token_prices_hot_tokens" ON "token_prices"("market_cap" DESC, "volume_24h" DESC, "liquidity" DESC);

-- CreateIndex
CREATE INDEX "idx_token_prices_change_desc" ON "token_prices"("change_24h" DESC);

-- CreateIndex
CREATE INDEX "idx_token_prices_volume_desc" ON "token_prices"("volume_24h" DESC);
