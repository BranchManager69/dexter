-- CreateTable
CREATE TABLE "token_refresh_priority_tiers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "priority_score" INTEGER NOT NULL,
    "refresh_interval_seconds" INTEGER NOT NULL,
    "rank_threshold" INTEGER NOT NULL,
    "volatility_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "max_tokens_per_batch" INTEGER,
    "batch_delay_ms" INTEGER,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" VARCHAR(44),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "token_refresh_priority_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_refresh_priority_tiers_name_key" ON "token_refresh_priority_tiers"("name");

-- CreateIndex
CREATE INDEX "token_refresh_priority_tiers_priority_score_idx" ON "token_refresh_priority_tiers"("priority_score");

-- CreateIndex
CREATE INDEX "token_refresh_priority_tiers_refresh_interval_seconds_idx" ON "token_refresh_priority_tiers"("refresh_interval_seconds");

-- CreateIndex
CREATE INDEX "token_refresh_priority_tiers_rank_threshold_idx" ON "token_refresh_priority_tiers"("rank_threshold");

-- CreateIndex
CREATE INDEX "token_refresh_priority_tiers_is_active_idx" ON "token_refresh_priority_tiers"("is_active");
