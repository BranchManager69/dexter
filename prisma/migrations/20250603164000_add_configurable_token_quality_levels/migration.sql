-- CreateTable
CREATE TABLE "token_quality_levels" (
    "id" SERIAL NOT NULL,
    "level_name" VARCHAR(50) NOT NULL,
    "min_liquidity" INTEGER NOT NULL DEFAULT 0,
    "min_volume_24h" INTEGER NOT NULL DEFAULT 0,
    "min_market_cap" INTEGER NOT NULL DEFAULT 0,
    "require_image" BOOLEAN NOT NULL DEFAULT false,
    "max_age_days" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(255),

    CONSTRAINT "token_quality_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_quality_levels_level_name_key" ON "token_quality_levels"("level_name");

-- CreateIndex  
CREATE INDEX "idx_token_quality_levels_active" ON "token_quality_levels"("is_active");

-- Insert default quality levels (migrating from hardcoded values)
INSERT INTO "token_quality_levels" (level_name, min_liquidity, min_volume_24h, min_market_cap, require_image, max_age_days, description, updated_by) VALUES
('strict', 25000, 100000, 100000, true, 7, 'Contest-ready tokens with high liquidity and volume', 'migration'),
('relaxed', 10000, 50000, 50000, true, 7, 'Good quality tokens for general trading', 'migration'),
('minimal', 1000, 5000, 10000, false, 30, 'Basic quality filter with rug protection', 'migration');