/*
  Warnings:

  - You are about to drop the column `first_discovery` on the `tokens` table. All the data in the column will be lost.
  - You are about to drop the column `last_discovery` on the `tokens` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tokens" DROP COLUMN "first_discovery",
DROP COLUMN "last_discovery",
ADD COLUMN     "first_seen_on_jupiter_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_is_active_evaluation_at" TIMESTAMP(3),
ADD COLUMN     "last_jupiter_sync_at" TIMESTAMP(3),
ADD COLUMN     "manually_activated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metadata_last_updated_at" TIMESTAMP(3),
ALTER COLUMN "is_active" SET DEFAULT false,
ALTER COLUMN "updated_at" DROP DEFAULT;
