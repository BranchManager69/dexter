-- AlterEnum
ALTER TYPE "transaction_type" ADD VALUE 'DIVIDEND';

-- AlterTable
ALTER TABLE "duel_token_daily_balance" ADD COLUMN     "dividend_amount_sol" DECIMAL(20,8),
ADD COLUMN     "dividend_paid_at" TIMESTAMPTZ(6),
ADD COLUMN     "dividend_status" VARCHAR(20) DEFAULT 'pending',
ADD COLUMN     "dividend_transaction_id" INTEGER;

-- CreateIndex
CREATE INDEX "idx_duel_daily_dividend_status" ON "duel_token_daily_balance"("dividend_status");

-- AddForeignKey
ALTER TABLE "duel_token_daily_balance" ADD CONSTRAINT "duel_token_daily_balance_dividend_transaction_id_fkey" FOREIGN KEY ("dividend_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
