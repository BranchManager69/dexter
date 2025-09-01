-- AlterTable
ALTER TABLE "duel_token_daily_balance" ADD COLUMN     "dividend_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "total_registered_supply_lamports" BIGINT NOT NULL DEFAULT 0;
