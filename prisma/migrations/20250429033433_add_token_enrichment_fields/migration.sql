-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "discovery_count" INTEGER DEFAULT 0,
ADD COLUMN     "first_discovery" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_discovery" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "metadata_status" TEXT DEFAULT 'pending';
