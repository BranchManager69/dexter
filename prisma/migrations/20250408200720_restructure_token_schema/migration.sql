/*
  Warnings:

  - You are about to drop the column `change_24h` on the `tokens` table. All the data in the column will be lost.
  - You are about to drop the column `market_cap` on the `tokens` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `tokens` table. All the data in the column will be lost.
  - You are about to drop the column `volume_24h` on the `tokens` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "token_prices" DROP CONSTRAINT "token_prices_token_id_fkey";

-- DropIndex
DROP INDEX "unique_token_symbol";

-- AlterTable
ALTER TABLE "token_prices" ADD COLUMN     "change_24h" DECIMAL(5,2),
ADD COLUMN     "fdv" DECIMAL(20,0),
ADD COLUMN     "liquidity" DECIMAL(20,0),
ADD COLUMN     "market_cap" DECIMAL(20,0),
ADD COLUMN     "volume_24h" DECIMAL(20,0),
ALTER COLUMN "price" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tokens" DROP COLUMN "change_24h",
DROP COLUMN "market_cap",
DROP COLUMN "price",
DROP COLUMN "volume_24h",
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "symbol" DROP NOT NULL,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "decimals" SET DEFAULT 9,
ALTER COLUMN "color" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "token_prices" ADD CONSTRAINT "token_prices_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
