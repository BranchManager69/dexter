-- AlterTable
ALTER TABLE "token_holder_snapshots" ADD COLUMN     "dex_program" VARCHAR(50),
ADD COLUMN     "is_liquidity_pool" BOOLEAN NOT NULL DEFAULT false;
