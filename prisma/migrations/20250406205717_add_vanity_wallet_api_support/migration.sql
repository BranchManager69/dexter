/*
  Warnings:

  - A unique constraint covering the columns `[job_id]` on the table `vanity_wallet_pool` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "VanityWalletStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "vanity_wallet_pool" ADD COLUMN     "attempts" BIGINT,
ADD COLUMN     "callback_url" TEXT,
ADD COLUMN     "case_sensitive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "duration_ms" BIGINT,
ADD COLUMN     "is_suffix" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "job_id" TEXT,
ADD COLUMN     "request_ip" TEXT,
ADD COLUMN     "requested_by" TEXT,
ADD COLUMN     "status" "VanityWalletStatus" NOT NULL DEFAULT 'pending',
ALTER COLUMN "wallet_address" DROP NOT NULL,
ALTER COLUMN "private_key" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "vanity_wallet_pool_job_id_key" ON "vanity_wallet_pool"("job_id");

-- CreateIndex
CREATE INDEX "vanity_wallet_pool_status_idx" ON "vanity_wallet_pool"("status");

-- CreateIndex
CREATE INDEX "vanity_wallet_pool_job_id_idx" ON "vanity_wallet_pool"("job_id");
