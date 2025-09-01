-- AlterTable
ALTER TABLE "token_holder_snapshot_summary" ADD COLUMN     "top_10_total_percentage" DECIMAL(5,2),
ADD COLUMN     "top_20_total_percentage" DECIMAL(5,2),
ADD COLUMN     "top_50_total_percentage" DECIMAL(5,2);
