-- CreateTable
CREATE TABLE "pulse_buyer_cycles" (
    "id" TEXT NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "token_mint" VARCHAR(44) NOT NULL,
    "state" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buy_amount" TEXT,
    "buy_tx_signature" VARCHAR(88),
    "sells_remaining" INTEGER NOT NULL DEFAULT 2,
    "sell_1_scheduled_at" TIMESTAMPTZ(6),
    "sell_1_tx_signature" VARCHAR(88),
    "sell_2_scheduled_at" TIMESTAMPTZ(6),
    "sell_2_tx_signature" VARCHAR(88),
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "pulse_buyer_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pulse_buyer_cycles_wallet_address_idx" ON "pulse_buyer_cycles"("wallet_address");

-- CreateIndex
CREATE INDEX "pulse_buyer_cycles_state_idx" ON "pulse_buyer_cycles"("state");

-- CreateIndex
CREATE INDEX "pulse_buyer_cycles_start_time_idx" ON "pulse_buyer_cycles"("start_time");
