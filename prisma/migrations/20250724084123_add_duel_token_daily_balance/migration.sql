-- CreateTable
CREATE TABLE "duel_token_daily_balance" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "date" DATE NOT NULL,
    "average_balance_lamports" BIGINT NOT NULL,
    "snapshot_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duel_token_daily_balance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_duel_daily_wallet" ON "duel_token_daily_balance"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_duel_daily_date" ON "duel_token_daily_balance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "idx_duel_daily_wallet_date" ON "duel_token_daily_balance"("wallet_address", "date");

-- AddForeignKey
ALTER TABLE "duel_token_daily_balance" ADD CONSTRAINT "duel_token_daily_balance_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;
