-- CreateTable
CREATE TABLE "token_holder_snapshots" (
    "id" SERIAL NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "token_symbol" VARCHAR(20) NOT NULL,
    "owner_address" VARCHAR(44) NOT NULL,
    "token_account" VARCHAR(44),
    "amount" DECIMAL(40,0) NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 9,
    "ui_amount" DECIMAL(20,9) NOT NULL,
    "rank" INTEGER,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "snapshot_batch_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_holder_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_holder_snapshot_summary" (
    "id" SERIAL NOT NULL,
    "snapshot_batch_id" UUID NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "token_symbol" VARCHAR(20) NOT NULL,
    "total_holders" INTEGER NOT NULL,
    "registered_holders" INTEGER NOT NULL,
    "total_supply_held" DECIMAL(40,0) NOT NULL,
    "registered_supply_held" DECIMAL(40,0) NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(20) NOT NULL DEFAULT 'solscan',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_holder_snapshot_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_holder_snapshots_token_address_idx" ON "token_holder_snapshots"("token_address");

-- CreateIndex
CREATE INDEX "token_holder_snapshots_owner_address_idx" ON "token_holder_snapshots"("owner_address");

-- CreateIndex
CREATE INDEX "token_holder_snapshots_user_id_idx" ON "token_holder_snapshots"("user_id");

-- CreateIndex
CREATE INDEX "token_holder_snapshots_timestamp_idx" ON "token_holder_snapshots"("timestamp");

-- CreateIndex
CREATE INDEX "token_holder_snapshots_snapshot_batch_id_idx" ON "token_holder_snapshots"("snapshot_batch_id");

-- CreateIndex
CREATE INDEX "token_holder_snapshot_summary_token_address_idx" ON "token_holder_snapshot_summary"("token_address");

-- CreateIndex
CREATE INDEX "token_holder_snapshot_summary_snapshot_batch_id_idx" ON "token_holder_snapshot_summary"("snapshot_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_holder_snapshot_summary_snapshot_batch_id_key" ON "token_holder_snapshot_summary"("snapshot_batch_id");

-- AddForeignKey
ALTER TABLE "token_holder_snapshots" ADD CONSTRAINT "token_holder_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;