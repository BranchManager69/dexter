-- AlterTable
ALTER TABLE "token_holder_snapshot_summary" ADD COLUMN     "circulating_supply" DECIMAL(40,0),
ADD COLUMN     "liquidity_pool_amount" DECIMAL(40,0),
ADD COLUMN     "liquidity_pool_percentage" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "token_holder_snapshots" ADD COLUMN     "wallet_label" VARCHAR(100),
ADD COLUMN     "wallet_type" VARCHAR(30);
