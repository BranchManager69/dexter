/*
  Warnings:

  - The values [PENDING,COMPLETED,EXPIRED,REJECTED] on the enum `ReferralStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `updated_at` on the `referrals` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ReferralStatus_new" AS ENUM ('pending', 'qualified', 'rewarded', 'expired');
ALTER TABLE "referrals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "referrals" ALTER COLUMN "status" TYPE "ReferralStatus_new" USING ("status"::text::"ReferralStatus_new");
ALTER TYPE "ReferralStatus" RENAME TO "ReferralStatus_old";
ALTER TYPE "ReferralStatus_new" RENAME TO "ReferralStatus";
DROP TYPE "ReferralStatus_old";
ALTER TABLE "referrals" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- AlterTable
ALTER TABLE "referrals" DROP COLUMN "updated_at",
ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateTable
CREATE TABLE "circuit_breaker_states" (
    "id" SERIAL NOT NULL,
    "service_name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'closed',
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_failure" TIMESTAMP(3),
    "recovery_attempts" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circuit_breaker_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuit_breaker_incidents" (
    "id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "message" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3),
    "metrics" JSONB,

    CONSTRAINT "circuit_breaker_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuit_breaker_config" (
    "service_name" TEXT NOT NULL,
    "failure_threshold" INTEGER NOT NULL DEFAULT 5,
    "recovery_timeout" INTEGER NOT NULL DEFAULT 30000,
    "request_limit" INTEGER NOT NULL DEFAULT 100,
    "monitoring_window" INTEGER NOT NULL DEFAULT 60000,
    "minimum_requests" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circuit_breaker_config_pkey" PRIMARY KEY ("service_name")
);

-- CreateIndex
CREATE UNIQUE INDEX "circuit_breaker_states_service_name_key" ON "circuit_breaker_states"("service_name");

-- CreateIndex
CREATE INDEX "circuit_breaker_states_state_idx" ON "circuit_breaker_states"("state");

-- CreateIndex
CREATE INDEX "circuit_breaker_incidents_service_name_status_idx" ON "circuit_breaker_incidents"("service_name", "status");

-- CreateIndex
CREATE INDEX "circuit_breaker_incidents_start_time_idx" ON "circuit_breaker_incidents"("start_time");

-- AddForeignKey
ALTER TABLE "circuit_breaker_incidents" ADD CONSTRAINT "circuit_breaker_incidents_service_name_fkey" FOREIGN KEY ("service_name") REFERENCES "circuit_breaker_states"("service_name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_breaker_config" ADD CONSTRAINT "circuit_breaker_config_service_name_fkey" FOREIGN KEY ("service_name") REFERENCES "circuit_breaker_states"("service_name") ON DELETE RESTRICT ON UPDATE CASCADE;
