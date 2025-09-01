-- CreateTable
CREATE TABLE "config_contest_wallet" (
    "id" TEXT NOT NULL,
    "check_interval_ms" INTEGER NOT NULL DEFAULT 60000,
    "min_balance_to_reclaim" DECIMAL(10,8) NOT NULL DEFAULT 0.05,
    "min_amount_to_transfer" DECIMAL(10,8) NOT NULL DEFAULT 0.01,
    "reclaim_contest_statuses" JSONB NOT NULL DEFAULT '["completed", "cancelled"]',
    "vanity_wallet_paths" JSONB NOT NULL DEFAULT '{"DUEL":"/home/websites/degenduel/addresses/keypairs/public/_DUEL", "DEGEN":"/home/websites/degenduel/addresses/keypairs/public/_DEGEN"}',
    "encryption_algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "failure_threshold" INTEGER NOT NULL DEFAULT 5,
    "reset_timeout_ms" INTEGER NOT NULL DEFAULT 60000,
    "min_healthy_period_ms" INTEGER NOT NULL DEFAULT 120000,
    "initial_delay_ms" INTEGER NOT NULL DEFAULT 1000,
    "max_delay_ms" INTEGER NOT NULL DEFAULT 30000,
    "backoff_factor" INTEGER NOT NULL DEFAULT 2,
    "enable_vanity_wallets" BOOLEAN NOT NULL DEFAULT true,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(44),

    CONSTRAINT "config_contest_wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_admin_wallet" (
    "id" TEXT NOT NULL,
    "check_interval_ms" INTEGER NOT NULL DEFAULT 60000,
    "min_sol_balance" DECIMAL(10,8) NOT NULL DEFAULT 0.05,
    "max_parallel_transfers" INTEGER NOT NULL DEFAULT 5,
    "transfer_timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "max_batch_size" INTEGER NOT NULL DEFAULT 50,
    "encryption_algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "key_length" INTEGER NOT NULL DEFAULT 32,
    "iv_length" INTEGER NOT NULL DEFAULT 16,
    "tag_length" INTEGER NOT NULL DEFAULT 16,
    "failure_threshold" INTEGER NOT NULL DEFAULT 7,
    "reset_timeout_ms" INTEGER NOT NULL DEFAULT 80000,
    "min_healthy_period_ms" INTEGER NOT NULL DEFAULT 150000,
    "initial_delay_ms" INTEGER NOT NULL DEFAULT 1000,
    "max_delay_ms" INTEGER NOT NULL DEFAULT 30000,
    "backoff_factor" INTEGER NOT NULL DEFAULT 2,
    "require_admin_approval" BOOLEAN NOT NULL DEFAULT true,
    "large_transfer_threshold" DECIMAL(10,8) NOT NULL DEFAULT 10.0,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(44),

    CONSTRAINT "config_admin_wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_ai_service" (
    "id" TEXT NOT NULL,
    "check_interval_ms" INTEGER NOT NULL DEFAULT 600000,
    "client_error_lookback_minutes" INTEGER NOT NULL DEFAULT 10,
    "min_errors_to_analyze" INTEGER NOT NULL DEFAULT 1,
    "admin_action_lookback_minutes" INTEGER NOT NULL DEFAULT 15,
    "min_actions_to_analyze" INTEGER NOT NULL DEFAULT 1,
    "model_loadouts" JSONB NOT NULL DEFAULT '{"default":{"model":"gpt-4o","maxTokens":4096,"temperature":0.7},"errorAnalysis":{"model":"gpt-4o","maxTokens":8192,"temperature":0.1},"adminAnalysis":{"model":"gpt-4o","maxTokens":8192,"temperature":0.2}}',
    "system_prompts" JSONB NOT NULL DEFAULT '{}',
    "failure_threshold" INTEGER NOT NULL DEFAULT 3,
    "reset_timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "max_tokens_per_minute" INTEGER NOT NULL DEFAULT 100000,
    "max_conversations_per_user" INTEGER NOT NULL DEFAULT 5,
    "enable_error_analysis" BOOLEAN NOT NULL DEFAULT true,
    "enable_admin_analysis" BOOLEAN NOT NULL DEFAULT true,
    "enable_user_ai_convos" BOOLEAN NOT NULL DEFAULT true,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(44),

    CONSTRAINT "config_ai_service_pkey" PRIMARY KEY ("id")
);
