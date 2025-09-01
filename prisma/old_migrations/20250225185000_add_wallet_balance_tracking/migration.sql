-- CreateTable
CREATE TABLE "wallet_balance_history" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "balance_lamports" BIGINT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_balance_history_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_balance_check" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_known_balance" BIGINT;

-- CreateIndex
CREATE INDEX "idx_wallet_balance_wallet" ON "wallet_balance_history"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_wallet_balance_timestamp" ON "wallet_balance_history"("timestamp");

-- AddForeignKey
ALTER TABLE "wallet_balance_history" ADD CONSTRAINT "wallet_balance_history_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;