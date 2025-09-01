-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "raw_supply" BIGINT,
ADD COLUMN     "total_supply" DECIMAL(36,18);
