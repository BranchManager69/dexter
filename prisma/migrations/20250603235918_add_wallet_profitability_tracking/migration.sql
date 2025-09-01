-- CreateTable
CREATE TABLE "wallet_profitability_snapshots" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_pnl_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "realized_pnl_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "unrealized_pnl_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "total_volume_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "trade_count" INTEGER NOT NULL DEFAULT 0,
    "win_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "avg_trade_size_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "best_trade_pnl_usd" DECIMAL(20,8),
    "worst_trade_pnl_usd" DECIMAL(20,8),
    "portfolio_value_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "calculation_period_days" INTEGER NOT NULL DEFAULT 365,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_profitability_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_token_positions" (
    "id" SERIAL NOT NULL,
    "snapshot_id" INTEGER NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "value_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "cost_basis_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "unrealized_pnl_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "avg_cost_per_token" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "current_price_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "return_percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_token_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_trades_history" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "transaction_hash" VARCHAR(128) NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "trade_type" VARCHAR(20) NOT NULL,
    "input_token_address" VARCHAR(44) NOT NULL,
    "output_token_address" VARCHAR(44) NOT NULL,
    "input_amount" DECIMAL(36,18) NOT NULL,
    "output_amount" DECIMAL(36,18) NOT NULL,
    "input_value_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "output_value_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "pnl_usd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "platform" VARCHAR(50) NOT NULL,
    "activity_type" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_trades_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_profitability_snapshots_wallet_address_idx" ON "wallet_profitability_snapshots"("wallet_address");

-- CreateIndex
CREATE INDEX "wallet_profitability_snapshots_calculated_at_idx" ON "wallet_profitability_snapshots"("calculated_at");

-- CreateIndex
CREATE INDEX "wallet_profitability_snapshots_total_pnl_usd_idx" ON "wallet_profitability_snapshots"("total_pnl_usd");

-- CreateIndex
CREATE INDEX "wallet_token_positions_snapshot_id_idx" ON "wallet_token_positions"("snapshot_id");

-- CreateIndex
CREATE INDEX "wallet_token_positions_token_address_idx" ON "wallet_token_positions"("token_address");

-- CreateIndex
CREATE INDEX "wallet_trades_history_wallet_address_idx" ON "wallet_trades_history"("wallet_address");

-- CreateIndex
CREATE INDEX "wallet_trades_history_timestamp_idx" ON "wallet_trades_history"("timestamp");

-- CreateIndex
CREATE INDEX "wallet_trades_history_trade_type_idx" ON "wallet_trades_history"("trade_type");

-- CreateIndex
CREATE INDEX "wallet_trades_history_pnl_usd_idx" ON "wallet_trades_history"("pnl_usd");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_trades_history_transaction_hash_key" ON "wallet_trades_history"("transaction_hash");

-- AddForeignKey
ALTER TABLE "wallet_token_positions" ADD CONSTRAINT "wallet_token_positions_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "wallet_profitability_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
