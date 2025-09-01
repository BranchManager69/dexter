/*
  Warnings:

  - You are about to drop the `authorized_devices` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `is_vanity` on table `contest_wallets` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "authorized_devices" DROP CONSTRAINT "authorized_devices_wallet_address_fkey";

-- AlterTable
ALTER TABLE "contest_wallets" ALTER COLUMN "is_vanity" SET NOT NULL,
ALTER COLUMN "vanity_type" SET DATA TYPE VARCHAR;

-- DropTable
DROP TABLE "authorized_devices";
