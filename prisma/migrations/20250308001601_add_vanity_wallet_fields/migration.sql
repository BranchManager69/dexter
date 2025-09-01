-- AlterTable
ALTER TABLE "contest_wallets" ADD COLUMN "is_vanity" BOOLEAN DEFAULT false;
ALTER TABLE "contest_wallets" ADD COLUMN "vanity_type" TEXT;