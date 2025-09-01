-- AlterTable
ALTER TABLE "managed_wallets" ADD COLUMN     "ownerId" INTEGER;

-- CreateIndex
CREATE INDEX "managed_wallets_ownerId_idx" ON "managed_wallets"("ownerId");

-- AddForeignKey
ALTER TABLE "managed_wallets" ADD CONSTRAINT "managed_wallets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
