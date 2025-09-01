-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "coingeckoId" TEXT;

-- CreateTable
CREATE TABLE "token_pools" (
    "address" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "dex" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "dataSize" INTEGER NOT NULL,
    "tokenOffset" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_pools_pkey" PRIMARY KEY ("address","tokenAddress")
);

-- CreateIndex
CREATE INDEX "token_pools_dex_idx" ON "token_pools"("dex");

-- CreateIndex
CREATE INDEX "token_pools_tokenAddress_idx" ON "token_pools"("tokenAddress");

-- AddForeignKey
ALTER TABLE "token_pools" ADD CONSTRAINT "token_pools_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "tokens"("address") ON DELETE CASCADE ON UPDATE CASCADE;
