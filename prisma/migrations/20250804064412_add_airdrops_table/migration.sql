-- CreateEnum
CREATE TYPE "airdrop_status" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- AlterEnum
ALTER TYPE "transaction_type" ADD VALUE 'AIRDROP';

-- CreateTable
CREATE TABLE "airdrops" (
    "id" SERIAL NOT NULL,
    "user_wallet" VARCHAR(44) NOT NULL,
    "recipient_wallet" VARCHAR(44) NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "old_amount" DECIMAL(20,8),
    "user_id" INTEGER,
    "status" "airdrop_status" NOT NULL DEFAULT 'pending',
    "transaction_id" INTEGER,
    "transaction_hash" VARCHAR(128),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "distributed_at" TIMESTAMPTZ(6),

    CONSTRAINT "airdrops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "airdrops_user_wallet_idx" ON "airdrops"("user_wallet");

-- CreateIndex
CREATE INDEX "airdrops_recipient_wallet_idx" ON "airdrops"("recipient_wallet");

-- CreateIndex
CREATE INDEX "airdrops_status_idx" ON "airdrops"("status");

-- CreateIndex
CREATE INDEX "airdrops_user_id_idx" ON "airdrops"("user_id");

-- AddForeignKey
ALTER TABLE "airdrops" ADD CONSTRAINT "airdrops_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "airdrops" ADD CONSTRAINT "airdrops_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
