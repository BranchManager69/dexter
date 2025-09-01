-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin', 'superadmin');

-- CreateEnum
CREATE TYPE "contest_status" AS ENUM ('pending', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('pending', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('CONTEST_ENTRY', 'PRIZE_PAYOUT', 'DEPOSIT', 'WITHDRAWAL', 'REFERRAL_BONUS', 'PROMOTION');

-- CreateEnum
CREATE TYPE "AIDecisionType" AS ENUM ('BUY', 'SELL', 'HOLD', 'SPECIAL_EVENT');

-- CreateEnum
CREATE TYPE "Chain" AS ENUM ('SOLANA', 'ETHEREUM', 'BSC');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('SOL', 'DUEL', 'SPL');

-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('BUY', 'SELL', 'SHORT', 'CLOSE_SHORT');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReferralRewardType" AS ENUM ('signup_bonus', 'contest_bonus', 'special_event');

-- CreateTable
CREATE TABLE "contest_participants" (
    "id" SERIAL NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initial_dxd_points" DECIMAL(20,0) DEFAULT 0,
    "current_dxd_points" DECIMAL(20,0) DEFAULT 0,
    "rank" INTEGER,
    "prize_amount" DECIMAL(20,0),
    "prize_paid_at" TIMESTAMPTZ(6),
    "refund_amount" DECIMAL(20,0),
    "refunded_at" TIMESTAMPTZ(6),
    "entry_transaction_id" INTEGER,
    "entry_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "final_rank" INTEGER,
    "prize_transaction_id" INTEGER,

    CONSTRAINT "contest_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_portfolios" (
    "id" SERIAL NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "token_id" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_minutes" INTEGER,
    "entry_fee" DECIMAL(20,0) DEFAULT 0,
    "max_participants" INTEGER DEFAULT 2,
    "bucket_requirements" JSONB DEFAULT '{}',
    "scoring_rules" JSONB DEFAULT '{}',
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_token_buckets" (
    "contest_id" INTEGER NOT NULL,
    "token_id" INTEGER NOT NULL,
    "bucket_id" INTEGER NOT NULL,

    CONSTRAINT "contest_token_buckets_pkey" PRIMARY KEY ("contest_id","token_id","bucket_id")
);

-- CreateTable
CREATE TABLE "contest_token_performance" (
    "id" SERIAL NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "token_id" INTEGER NOT NULL,
    "profit_loss" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_token_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_token_prices" (
    "id" SERIAL NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "token_id" INTEGER NOT NULL,
    "amount" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "price" DECIMAL(20,8) NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_token_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_portfolio_trades" (
    "id" SERIAL NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "token_id" INTEGER NOT NULL,
    "type" "TradeType" NOT NULL,
    "old_weight" INTEGER NOT NULL,
    "new_weight" INTEGER NOT NULL,
    "price_at_trade" DECIMAL(20,8) NOT NULL,
    "virtual_amount" DECIMAL(20,0) NOT NULL,
    "executed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_portfolio_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contests" (
    "id" SERIAL NOT NULL,
    "contest_code" TEXT NOT NULL,
    "token_mint" VARCHAR(44),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "entry_fee" DECIMAL(20,8) DEFAULT 0,
    "prize_pool" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "current_prize_pool" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "status" "contest_status" NOT NULL DEFAULT 'pending',
    "settings" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allowed_buckets" INTEGER[],
    "participant_count" INTEGER NOT NULL DEFAULT 0,
    "min_participants" INTEGER NOT NULL DEFAULT 2,
    "max_participants" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,

    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_bucket_memberships" (
    "bucket_id" INTEGER NOT NULL,
    "token_id" INTEGER NOT NULL,

    CONSTRAINT "token_bucket_memberships_pkey" PRIMARY KEY ("bucket_id","token_id")
);

-- CreateTable
CREATE TABLE "token_buckets" (
    "id" SERIAL NOT NULL,
    "bucket_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_prices" (
    "token_id" INTEGER NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_prices_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER DEFAULT 18,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "market_cap" DECIMAL(20,0),
    "change_24h" DECIMAL(5,2),
    "volume_24h" DECIMAL(20,0),
    "image_url" VARCHAR(255),
    "description" TEXT,
    "twitter_url" VARCHAR(255),
    "telegram_url" VARCHAR(255),
    "discord_url" VARCHAR(255),
    "website_url" VARCHAR(255),

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "wallet_address" TEXT,
    "type" "transaction_type" NOT NULL,
    "amount" DECIMAL(20,0) NOT NULL,
    "balance_before" DECIMAL(20,0) NOT NULL,
    "balance_after" DECIMAL(20,0) NOT NULL,
    "contest_id" INTEGER,
    "description" TEXT,
    "status" "transaction_status" DEFAULT 'completed',
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" SERIAL NOT NULL,
    "wallet_address" TEXT,
    "achievement_type" TEXT NOT NULL,
    "value" JSONB DEFAULT '{}',
    "achieved_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_social_profiles" (
    "wallet_address" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT false,
    "verification_date" TIMESTAMPTZ(6),
    "last_verified" TIMESTAMPTZ(6),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_social_profiles_pkey" PRIMARY KEY ("wallet_address","platform")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "wallet_address" TEXT NOT NULL,
    "contests_entered" INTEGER DEFAULT 0,
    "contests_won" INTEGER DEFAULT 0,
    "total_prize_money" DECIMAL(20,0) DEFAULT 0,
    "best_score" DECIMAL(10,2),
    "avg_score" DECIMAL(10,2),
    "last_updated" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("wallet_address")
);

-- CreateTable
CREATE TABLE "user_token_stats" (
    "wallet_address" TEXT NOT NULL,
    "token_address" TEXT NOT NULL,
    "times_picked" INTEGER DEFAULT 0,
    "wins_with_token" INTEGER DEFAULT 0,
    "avg_score_with_token" DECIMAL(10,2),

    CONSTRAINT "user_token_stats_pkey" PRIMARY KEY ("wallet_address","token_address")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "username" TEXT,
    "email" TEXT,
    "nickname" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "user_level_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "last_login" TIMESTAMPTZ(6),
    "total_contests" INTEGER DEFAULT 0,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "referral_code" VARCHAR(20),
    "referred_by_code" VARCHAR(20),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_logs" (
    "id" SERIAL NOT NULL,
    "admin_address" VARCHAR NOT NULL,
    "action" VARCHAR NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR,
    "user_agent" VARCHAR,

    CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "personality" VARCHAR NOT NULL,
    "risk_tolerance" INTEGER NOT NULL,
    "expertise" VARCHAR[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_decisions" (
    "id" SERIAL NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "decision_type" "AIDecisionType" NOT NULL,
    "token_id" INTEGER NOT NULL,
    "amount" DECIMAL(20,0) NOT NULL,
    "reasoning" VARCHAR NOT NULL,
    "market_context" JSONB DEFAULT '{}',
    "external_factors" JSONB DEFAULT '{}',
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success_score" INTEGER,
    "price_impact" DECIMAL(10,2),

    CONSTRAINT "ai_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenges" (
    "wallet_address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("wallet_address")
);

-- CreateTable
CREATE TABLE "blockchain_transactions" (
    "id" SERIAL NOT NULL,
    "tx_hash" VARCHAR NOT NULL,
    "wallet_from" VARCHAR NOT NULL,
    "wallet_to" VARCHAR NOT NULL,
    "amount" DECIMAL(20,0) NOT NULL,
    "token_type" "TokenType" NOT NULL DEFAULT 'SOL',
    "chain" "Chain" NOT NULL DEFAULT 'SOLANA',
    "status" "transaction_status" NOT NULL DEFAULT 'pending',
    "type" "transaction_type" NOT NULL,
    "contest_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),
    "error" VARCHAR,
    "signature" VARCHAR,
    "slot" INTEGER,

    CONSTRAINT "blockchain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_wallets" (
    "id" SERIAL NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "wallet_address" VARCHAR NOT NULL,
    "private_key" VARCHAR NOT NULL,
    "balance" DECIMAL(20,0) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "last_sync" TIMESTAMPTZ(6),

    CONSTRAINT "contest_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seed_wallets" (
    "wallet_address" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "purpose" TEXT,
    "metadata" JSONB,

    CONSTRAINT "seed_wallets_pkey" PRIMARY KEY ("wallet_address")
);

-- CreateTable
CREATE TABLE "participant_influences" (
    "id" SERIAL NOT NULL,
    "decision_id" INTEGER NOT NULL,
    "wallet_address" VARCHAR NOT NULL,
    "persuasion_score" INTEGER NOT NULL,
    "contribution_weight" DECIMAL(5,2) NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_influences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(44),

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "achievement_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_tiers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "color_hex" VARCHAR(7) NOT NULL,
    "points" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_levels" (
    "id" SERIAL NOT NULL,
    "level_number" INTEGER NOT NULL,
    "class_name" VARCHAR(20) NOT NULL,
    "title" VARCHAR(50) NOT NULL,
    "min_exp" INTEGER NOT NULL,
    "bronze_achievements_required" INTEGER NOT NULL,
    "silver_achievements_required" INTEGER NOT NULL,
    "gold_achievements_required" INTEGER NOT NULL,
    "platinum_achievements_required" INTEGER NOT NULL,
    "diamond_achievements_required" INTEGER NOT NULL,
    "icon_url" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_tier_requirements" (
    "id" SERIAL NOT NULL,
    "achievement_type" TEXT NOT NULL,
    "tier_id" INTEGER NOT NULL,
    "requirement_value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_tier_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_rewards" (
    "id" SERIAL NOT NULL,
    "level_id" INTEGER NOT NULL,
    "reward_type" VARCHAR(50) NOT NULL,
    "reward_value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "websocket_messages" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "websocket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vanity_wallet_pool" (
    "id" SERIAL NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMP(3),
    "used_by_contest" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vanity_wallet_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" SERIAL NOT NULL,
    "referrer_id" VARCHAR(44) NOT NULL,
    "referred_id" VARCHAR(44) NOT NULL,
    "referral_code" VARCHAR(20) NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT,
    "landing_page" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "session_id" TEXT,
    "click_timestamp" TIMESTAMPTZ(6),
    "reward_amount" DECIMAL(20,0),
    "reward_paid_at" TIMESTAMPTZ(6),
    "qualified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_clicks" (
    "id" SERIAL NOT NULL,
    "referral_code" VARCHAR(20) NOT NULL,
    "referrer_id" VARCHAR(44) NOT NULL,
    "source" TEXT,
    "landing_page" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "session_id" TEXT NOT NULL,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "converted_at" TIMESTAMPTZ(6),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_rewards" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "reward_type" "ReferralRewardType" NOT NULL,
    "amount" DECIMAL(20,0) NOT NULL,
    "description" TEXT,
    "transaction_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_wallets" (
    "id" TEXT NOT NULL,
    "public_key" VARCHAR(44) NOT NULL,
    "encrypted_private_key" TEXT NOT NULL,
    "label" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "managed_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_periods" (
    "id" SERIAL NOT NULL,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_period_rankings" (
    "id" SERIAL NOT NULL,
    "period_id" INTEGER NOT NULL,
    "user_id" VARCHAR(44) NOT NULL,
    "referral_count" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL,
    "trend" TEXT NOT NULL DEFAULT 'stable',
    "reward_amount" DECIMAL(20,0),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_period_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_milestones" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(44) NOT NULL,
    "milestone_level" INTEGER NOT NULL,
    "referral_count" INTEGER NOT NULL,
    "reward_amount" DECIMAL(20,0) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contest_participants_wallet_address_idx" ON "contest_participants"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "contest_participants_contest_id_wallet_address_key" ON "contest_participants"("contest_id", "wallet_address");

-- CreateIndex
CREATE INDEX "contest_portfolios_wallet_address_idx" ON "contest_portfolios"("wallet_address");

-- CreateIndex
CREATE INDEX "contest_portfolios_token_id_idx" ON "contest_portfolios"("token_id");

-- CreateIndex
CREATE UNIQUE INDEX "contest_portfolios_contest_id_wallet_address_token_id_key" ON "contest_portfolios"("contest_id", "wallet_address", "token_id");

-- CreateIndex
CREATE INDEX "idx_contest_templates_name" ON "contest_templates"("name");

-- CreateIndex
CREATE INDEX "idx_contest_token_buckets_contest" ON "contest_token_buckets"("contest_id");

-- CreateIndex
CREATE INDEX "idx_contest_token_buckets_token" ON "contest_token_buckets"("token_id");

-- CreateIndex
CREATE INDEX "contest_token_performance_contest_id_idx" ON "contest_token_performance"("contest_id");

-- CreateIndex
CREATE INDEX "contest_token_performance_wallet_address_idx" ON "contest_token_performance"("wallet_address");

-- CreateIndex
CREATE INDEX "contest_token_performance_token_id_idx" ON "contest_token_performance"("token_id");

-- CreateIndex
CREATE INDEX "contest_token_prices_contest_id_idx" ON "contest_token_prices"("contest_id");

-- CreateIndex
CREATE INDEX "contest_token_prices_wallet_address_idx" ON "contest_token_prices"("wallet_address");

-- CreateIndex
CREATE INDEX "contest_token_prices_token_id_idx" ON "contest_token_prices"("token_id");

-- CreateIndex
CREATE INDEX "contest_portfolio_trades_contest_id_idx" ON "contest_portfolio_trades"("contest_id");

-- CreateIndex
CREATE INDEX "contest_portfolio_trades_wallet_address_idx" ON "contest_portfolio_trades"("wallet_address");

-- CreateIndex
CREATE INDEX "contest_portfolio_trades_token_id_idx" ON "contest_portfolio_trades"("token_id");

-- CreateIndex
CREATE UNIQUE INDEX "contests_contest_code_key" ON "contests"("contest_code");

-- CreateIndex
CREATE INDEX "contests_status_idx" ON "contests"("status");

-- CreateIndex
CREATE INDEX "contests_start_time_idx" ON "contests"("start_time");

-- CreateIndex
CREATE INDEX "contests_end_time_idx" ON "contests"("end_time");

-- CreateIndex
CREATE INDEX "idx_token_bucket_memberships_token" ON "token_bucket_memberships"("token_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_token_bucket_code" ON "token_buckets"("bucket_code");

-- CreateIndex
CREATE INDEX "idx_token_buckets_code" ON "token_buckets"("bucket_code");

-- CreateIndex
CREATE INDEX "idx_token_prices_updated" ON "token_prices"("updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "unique_token_address" ON "tokens"("address");

-- CreateIndex
CREATE UNIQUE INDEX "unique_token_symbol" ON "tokens"("symbol");

-- CreateIndex
CREATE INDEX "idx_tokens_symbol" ON "tokens"("symbol");

-- CreateIndex
CREATE INDEX "idx_transactions_contest" ON "transactions"("contest_id");

-- CreateIndex
CREATE INDEX "idx_transactions_type_created" ON "transactions"("type", "created_at");

-- CreateIndex
CREATE INDEX "idx_transactions_wallet" ON "transactions"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_user_achievements_wallet" ON "user_achievements"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_user_achievements_type" ON "user_achievements"("achievement_type");

-- CreateIndex
CREATE INDEX "idx_user_social_profiles_platform" ON "user_social_profiles"("platform", "platform_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_platform_user" ON "user_social_profiles"("platform", "platform_user_id");

-- CreateIndex
CREATE INDEX "idx_user_stats_wallet" ON "user_stats"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_user_token_stats_wallet" ON "user_token_stats"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_user_token_stats_token" ON "user_token_stats"("token_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "idx_users_wallet" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_users_username" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_admin_logs_admin" ON "admin_logs"("admin_address");

-- CreateIndex
CREATE INDEX "idx_admin_logs_created" ON "admin_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_ai_decisions_contest_time" ON "ai_decisions"("contest_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_ai_decisions_token_time" ON "ai_decisions"("token_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_auth_challenges_expires" ON "auth_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_transactions_tx_hash_key" ON "blockchain_transactions"("tx_hash");

-- CreateIndex
CREATE INDEX "idx_blockchain_transactions_contest" ON "blockchain_transactions"("contest_id");

-- CreateIndex
CREATE INDEX "idx_blockchain_transactions_signature" ON "blockchain_transactions"("signature");

-- CreateIndex
CREATE INDEX "idx_blockchain_transactions_hash" ON "blockchain_transactions"("tx_hash");

-- CreateIndex
CREATE INDEX "idx_blockchain_transactions_wallets" ON "blockchain_transactions"("wallet_from", "wallet_to");

-- CreateIndex
CREATE UNIQUE INDEX "contest_wallets_contest_id_key" ON "contest_wallets"("contest_id");

-- CreateIndex
CREATE INDEX "idx_contest_wallets_wallet" ON "contest_wallets"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_participant_influences_lookup" ON "participant_influences"("wallet_address", "decision_id");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_categories_name_key" ON "achievement_categories"("name");

-- CreateIndex
CREATE INDEX "idx_achievement_tier_requirements_lookup" ON "achievement_tier_requirements"("achievement_type", "tier_id");

-- CreateIndex
CREATE INDEX "idx_websocket_messages_wallet_type" ON "websocket_messages"("wallet_address", "type");

-- CreateIndex
CREATE INDEX "idx_websocket_messages_timestamp" ON "websocket_messages"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "vanity_wallet_pool_wallet_address_key" ON "vanity_wallet_pool"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "vanity_wallet_pool_used_by_contest_key" ON "vanity_wallet_pool"("used_by_contest");

-- CreateIndex
CREATE INDEX "vanity_wallet_pool_is_used_idx" ON "vanity_wallet_pool"("is_used");

-- CreateIndex
CREATE INDEX "vanity_wallet_pool_pattern_idx" ON "vanity_wallet_pool"("pattern");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "referrals_referred_id_idx" ON "referrals"("referred_id");

-- CreateIndex
CREATE INDEX "referrals_referral_code_idx" ON "referrals"("referral_code");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE INDEX "referral_clicks_referral_code_idx" ON "referral_clicks"("referral_code");

-- CreateIndex
CREATE INDEX "referral_clicks_referrer_id_idx" ON "referral_clicks"("referrer_id");

-- CreateIndex
CREATE INDEX "referral_clicks_session_id_idx" ON "referral_clicks"("session_id");

-- CreateIndex
CREATE INDEX "referral_clicks_ip_address_idx" ON "referral_clicks"("ip_address");

-- CreateIndex
CREATE INDEX "referral_rewards_wallet_address_idx" ON "referral_rewards"("wallet_address");

-- CreateIndex
CREATE INDEX "referral_rewards_created_at_idx" ON "referral_rewards"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "managed_wallets_public_key_key" ON "managed_wallets"("public_key");

-- CreateIndex
CREATE INDEX "referral_period_rankings_period_id_idx" ON "referral_period_rankings"("period_id");

-- CreateIndex
CREATE INDEX "referral_period_rankings_user_id_idx" ON "referral_period_rankings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_period_rankings_period_id_user_id_key" ON "referral_period_rankings"("period_id", "user_id");

-- CreateIndex
CREATE INDEX "referral_milestones_user_id_idx" ON "referral_milestones"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_milestones_user_id_milestone_level_key" ON "referral_milestones"("user_id", "milestone_level");

-- AddForeignKey
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_entry_transaction_id_fkey" FOREIGN KEY ("entry_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_prize_transaction_id_fkey" FOREIGN KEY ("prize_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_portfolios" ADD CONSTRAINT "contest_portfolios_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_portfolios" ADD CONSTRAINT "contest_portfolios_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_portfolios" ADD CONSTRAINT "contest_portfolios_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_token_buckets" ADD CONSTRAINT "contest_token_buckets_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contest_token_buckets" ADD CONSTRAINT "contest_token_buckets_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contest_token_performance" ADD CONSTRAINT "contest_token_performance_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_token_performance" ADD CONSTRAINT "contest_token_performance_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_token_performance" ADD CONSTRAINT "contest_token_performance_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_token_prices" ADD CONSTRAINT "contest_token_prices_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_token_prices" ADD CONSTRAINT "contest_token_prices_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_token_prices" ADD CONSTRAINT "contest_token_prices_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_portfolio_trades" ADD CONSTRAINT "contest_portfolio_trades_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_portfolio_trades" ADD CONSTRAINT "contest_portfolio_trades_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_portfolio_trades" ADD CONSTRAINT "contest_portfolio_trades_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_bucket_memberships" ADD CONSTRAINT "token_bucket_memberships_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "token_buckets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "token_bucket_memberships" ADD CONSTRAINT "token_bucket_memberships_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "token_prices" ADD CONSTRAINT "token_prices_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_user_level_id_fkey" FOREIGN KEY ("user_level_id") REFERENCES "user_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contest_wallets" ADD CONSTRAINT "contest_wallets_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "participant_influences" ADD CONSTRAINT "participant_influences_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "ai_decisions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "participant_influences" ADD CONSTRAINT "participant_influences_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "websocket_messages" ADD CONSTRAINT "websocket_messages_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vanity_wallet_pool" ADD CONSTRAINT "vanity_wallet_pool_used_by_contest_fkey" FOREIGN KEY ("used_by_contest") REFERENCES "contests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_period_rankings" ADD CONSTRAINT "referral_period_rankings_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "referral_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_period_rankings" ADD CONSTRAINT "referral_period_rankings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_milestones" ADD CONSTRAINT "referral_milestones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;

