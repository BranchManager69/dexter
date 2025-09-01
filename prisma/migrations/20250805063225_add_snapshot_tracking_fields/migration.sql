-- AlterTable
ALTER TABLE "token_holder_snapshot_summary" ADD COLUMN     "exited_holders_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "median_holdings" DECIMAL(20,9),
ADD COLUMN     "new_holders_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "previous_snapshot_id" UUID,
ADD COLUMN     "top_10_percentage" DECIMAL(5,2),
ADD COLUMN     "top_20_percentage" DECIMAL(5,2),
ADD COLUMN     "top_50_percentage" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "token_holder_snapshots" ADD COLUMN     "amount_change" DECIMAL(40,0),
ADD COLUMN     "is_new_holder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previous_amount" DECIMAL(40,0),
ADD COLUMN     "previous_rank" INTEGER;

-- CreateIndex
CREATE INDEX "token_holder_snapshot_summary_previous_snapshot_id_idx" ON "token_holder_snapshot_summary"("previous_snapshot_id");

-- CreateIndex
CREATE INDEX "token_holder_snapshots_is_new_holder_idx" ON "token_holder_snapshots"("is_new_holder");
