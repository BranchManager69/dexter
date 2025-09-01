-- CreateTable
CREATE TABLE "duel_token_balance_history" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "balance_lamports" BIGINT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duel_token_balance_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_duel_balance_wallet" ON "duel_token_balance_history"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_duel_balance_timestamp" ON "duel_token_balance_history"("timestamp");

-- AddForeignKey
ALTER TABLE "duel_token_balance_history" ADD CONSTRAINT "duel_token_balance_history_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;
