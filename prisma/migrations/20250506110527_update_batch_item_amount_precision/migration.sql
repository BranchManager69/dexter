-- CreateTable
CREATE TABLE "batch_transfer_items" (
    "id" TEXT NOT NULL,
    "batchIdentifier" TEXT NOT NULL,
    "itemIdentifier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "signature" TEXT,
    "error" TEXT,
    "fromWalletAddress" VARCHAR(44) NOT NULL,
    "toAddress" VARCHAR(44) NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "mint" VARCHAR(44),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "batch_transfer_items_itemIdentifier_key" ON "batch_transfer_items"("itemIdentifier");

-- CreateIndex
CREATE INDEX "batch_transfer_items_batchIdentifier_idx" ON "batch_transfer_items"("batchIdentifier");

-- CreateIndex
CREATE INDEX "batch_transfer_items_fromWalletAddress_idx" ON "batch_transfer_items"("fromWalletAddress");

-- CreateIndex
CREATE INDEX "batch_transfer_items_toAddress_idx" ON "batch_transfer_items"("toAddress");

-- CreateIndex
CREATE INDEX "batch_transfer_items_status_idx" ON "batch_transfer_items"("status");
