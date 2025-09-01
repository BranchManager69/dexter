-- CreateTable
CREATE TABLE "ai_trade_decisions" (
    "id" TEXT NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "decision_type" VARCHAR(20) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "confidence_score" DECIMAL(5,4) NOT NULL,
    "confidence_components" JSONB DEFAULT '{}',
    "amount_sol" DECIMAL(20,9),
    "price_target" DECIMAL(20,9),
    "slippage_tolerance" DECIMAL(5,4) NOT NULL DEFAULT 0.02,
    "analysis_data" JSONB DEFAULT '{}',
    "indicators" JSONB DEFAULT '{}',
    "market_conditions" JSONB DEFAULT '{}',
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "execution_id" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_trade_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_trade_executions" (
    "id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "signature" VARCHAR(88) NOT NULL,
    "transaction_type" VARCHAR(20) NOT NULL,
    "amount_in" DECIMAL(20,9) NOT NULL,
    "amount_out" DECIMAL(20,9) NOT NULL,
    "token_in" VARCHAR(44) NOT NULL,
    "token_out" VARCHAR(44) NOT NULL,
    "execution_price" DECIMAL(20,9) NOT NULL,
    "slippage" DECIMAL(5,4),
    "gas_fee" DECIMAL(20,9),
    "platform_fee" DECIMAL(20,9),
    "position_size_before" DECIMAL(20,9),
    "position_size_after" DECIMAL(20,9),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_trade_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_trade_performance" (
    "id" TEXT NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "entry_execution_id" TEXT NOT NULL,
    "exit_execution_id" TEXT,
    "entry_price" DECIMAL(20,9) NOT NULL,
    "entry_amount_sol" DECIMAL(20,9) NOT NULL,
    "entry_timestamp" TIMESTAMPTZ(6) NOT NULL,
    "exit_price" DECIMAL(20,9),
    "exit_amount_sol" DECIMAL(20,9),
    "exit_timestamp" TIMESTAMPTZ(6),
    "exit_reason" VARCHAR(50),
    "pnl_sol" DECIMAL(20,9),
    "pnl_percentage" DECIMAL(10,4),
    "holding_period_minutes" INTEGER,
    "max_drawdown" DECIMAL(10,4),
    "max_profit" DECIMAL(10,4),
    "entry_confidence" DECIMAL(5,4) NOT NULL,
    "entry_analysis" JSONB DEFAULT '{}',
    "exit_analysis" JSONB DEFAULT '{}',
    "strategy_version" VARCHAR(20),
    "market_regime" VARCHAR(20),
    "lessons_learned" JSONB DEFAULT '{}',
    "is_winner" BOOLEAN,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_trade_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_strategy_parameters" (
    "id" TEXT NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "max_position_size_sol" DECIMAL(20,9) NOT NULL DEFAULT 0.5,
    "max_portfolio_exposure" DECIMAL(5,4) NOT NULL DEFAULT 0.3,
    "max_single_loss_sol" DECIMAL(20,9) NOT NULL DEFAULT 0.1,
    "stop_loss_percentage" DECIMAL(5,4) NOT NULL DEFAULT 0.15,
    "take_profit_percentage" DECIMAL(5,4) NOT NULL DEFAULT 0.3,
    "min_confidence_score" DECIMAL(5,4) NOT NULL DEFAULT 0.65,
    "min_liquidity_usd" DECIMAL(20,2) NOT NULL DEFAULT 50000,
    "min_volume_24h_usd" DECIMAL(20,2) NOT NULL DEFAULT 10000,
    "max_price_impact" DECIMAL(5,4) NOT NULL DEFAULT 0.02,
    "scan_interval_seconds" INTEGER NOT NULL DEFAULT 300,
    "decision_cooldown_minutes" INTEGER NOT NULL DEFAULT 30,
    "max_hold_duration_hours" INTEGER NOT NULL DEFAULT 72,
    "technical_weight" DECIMAL(5,4) NOT NULL DEFAULT 0.4,
    "social_weight" DECIMAL(5,4) NOT NULL DEFAULT 0.3,
    "fundamental_weight" DECIMAL(5,4) NOT NULL DEFAULT 0.2,
    "risk_weight" DECIMAL(5,4) NOT NULL DEFAULT 0.1,
    "max_daily_trades" INTEGER NOT NULL DEFAULT 10,
    "max_daily_loss_sol" DECIMAL(20,9) NOT NULL DEFAULT 1.0,
    "max_consecutive_losses" INTEGER NOT NULL DEFAULT 3,
    "pause_on_circuit_break" BOOLEAN NOT NULL DEFAULT true,
    "min_win_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.4,
    "target_sharpe_ratio" DECIMAL(10,4) NOT NULL DEFAULT 1.5,
    "description" TEXT,
    "created_by" VARCHAR(100) NOT NULL DEFAULT 'system',
    "performance_stats" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(6),
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_strategy_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_trade_decisions_token_address_created_at_idx" ON "ai_trade_decisions"("token_address", "created_at");

-- CreateIndex
CREATE INDEX "ai_trade_decisions_executed_created_at_idx" ON "ai_trade_decisions"("executed", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_trade_executions_decision_id_key" ON "ai_trade_executions"("decision_id");

-- CreateIndex
CREATE INDEX "ai_trade_executions_wallet_id_created_at_idx" ON "ai_trade_executions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_trade_executions_status_created_at_idx" ON "ai_trade_executions"("status", "created_at");

-- CreateIndex
CREATE INDEX "ai_trade_performance_token_address_created_at_idx" ON "ai_trade_performance"("token_address", "created_at");

-- CreateIndex
CREATE INDEX "ai_trade_performance_status_created_at_idx" ON "ai_trade_performance"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_strategy_parameters_version_key" ON "ai_strategy_parameters"("version");

-- CreateIndex
CREATE INDEX "ai_strategy_parameters_is_active_version_idx" ON "ai_strategy_parameters"("is_active", "version");

-- AddForeignKey
ALTER TABLE "ai_trade_executions" ADD CONSTRAINT "ai_trade_executions_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "ai_trade_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_trade_executions" ADD CONSTRAINT "ai_trade_executions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "managed_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_trade_performance" ADD CONSTRAINT "ai_trade_performance_entry_execution_id_fkey" FOREIGN KEY ("entry_execution_id") REFERENCES "ai_trade_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_trade_performance" ADD CONSTRAINT "ai_trade_performance_exit_execution_id_fkey" FOREIGN KEY ("exit_execution_id") REFERENCES "ai_trade_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
