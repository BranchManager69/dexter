-- CreateTable
CREATE TABLE "token_rank_history" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50),
    "snapshot_id" VARCHAR(100),

    CONSTRAINT "token_rank_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_volume_history" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "volume" DECIMAL(20,0) NOT NULL,
    "volume_usd" DECIMAL(20,2),
    "change_24h" DECIMAL(5,2),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50),
    "snapshot_id" VARCHAR(100),

    CONSTRAINT "token_volume_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_liquidity_history" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "liquidity" DECIMAL(20,0) NOT NULL,
    "change_24h" DECIMAL(5,2),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50),
    "snapshot_id" VARCHAR(100),

    CONSTRAINT "token_liquidity_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_market_cap_history" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "market_cap" DECIMAL(20,0) NOT NULL,
    "fdv" DECIMAL(20,0),
    "change_24h" DECIMAL(5,2),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50),
    "snapshot_id" VARCHAR(100),

    CONSTRAINT "token_market_cap_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_rank_history_token_id_idx" ON "token_rank_history"("token_id");

-- CreateIndex
CREATE INDEX "token_rank_history_timestamp_idx" ON "token_rank_history"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_rank_history_token_id_timestamp_idx" ON "token_rank_history"("token_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_rank_history_rank_idx" ON "token_rank_history"("rank");

-- CreateIndex
CREATE INDEX "token_volume_history_token_id_idx" ON "token_volume_history"("token_id");

-- CreateIndex
CREATE INDEX "token_volume_history_timestamp_idx" ON "token_volume_history"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_volume_history_token_id_timestamp_idx" ON "token_volume_history"("token_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_volume_history_volume_usd_idx" ON "token_volume_history"("volume_usd" DESC);

-- CreateIndex
CREATE INDEX "token_liquidity_history_token_id_idx" ON "token_liquidity_history"("token_id");

-- CreateIndex
CREATE INDEX "token_liquidity_history_timestamp_idx" ON "token_liquidity_history"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_liquidity_history_token_id_timestamp_idx" ON "token_liquidity_history"("token_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_liquidity_history_liquidity_idx" ON "token_liquidity_history"("liquidity" DESC);

-- CreateIndex
CREATE INDEX "token_market_cap_history_token_id_idx" ON "token_market_cap_history"("token_id");

-- CreateIndex
CREATE INDEX "token_market_cap_history_timestamp_idx" ON "token_market_cap_history"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_market_cap_history_token_id_timestamp_idx" ON "token_market_cap_history"("token_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_market_cap_history_market_cap_idx" ON "token_market_cap_history"("market_cap" DESC);

-- AddForeignKey
ALTER TABLE "token_rank_history" ADD CONSTRAINT "token_rank_history_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_volume_history" ADD CONSTRAINT "token_volume_history_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_liquidity_history" ADD CONSTRAINT "token_liquidity_history_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_market_cap_history" ADD CONSTRAINT "token_market_cap_history_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
