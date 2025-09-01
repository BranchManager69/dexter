-- CreateTable
CREATE TABLE "config_solana_engine" (
    "id" TEXT NOT NULL,
    "token_metadata_ttl" INTEGER NOT NULL DEFAULT 86400,
    "token_price_ttl" INTEGER NOT NULL DEFAULT 3600,
    "wallet_data_ttl" INTEGER NOT NULL DEFAULT 300,
    "connection_strategy" TEXT NOT NULL DEFAULT 'adaptive',
    "health_check_interval" INTEGER NOT NULL DEFAULT 60000,
    "failure_threshold" INTEGER NOT NULL DEFAULT 2,
    "recovery_threshold" INTEGER NOT NULL DEFAULT 3,
    "max_concurrent_requests" INTEGER NOT NULL DEFAULT 5,
    "request_spacing_ms" INTEGER NOT NULL DEFAULT 100,
    "base_backoff_ms" INTEGER NOT NULL DEFAULT 250,
    "endpoint_weights" JSONB DEFAULT '{}',
    "admin_bypass_cache" BOOLEAN NOT NULL DEFAULT false,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(44),

    CONSTRAINT "config_solana_engine_pkey" PRIMARY KEY ("id")
);
