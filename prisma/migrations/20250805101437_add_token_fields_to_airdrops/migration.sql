-- AlterTable
ALTER TABLE "airdrops" ADD COLUMN     "token_address" VARCHAR(44),
ADD COLUMN     "token_decimals" INTEGER DEFAULT 6;
