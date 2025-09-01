/*
  Warnings:

  - You are about to drop the column `discord_url` on the `tokens` table. All the data in the column will be lost.
  - You are about to drop the column `telegram_url` on the `tokens` table. All the data in the column will be lost.
  - You are about to drop the column `twitter_url` on the `tokens` table. All the data in the column will be lost.
  - You are about to drop the column `website_url` on the `tokens` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tokens" DROP COLUMN "discord_url",
DROP COLUMN "telegram_url",
DROP COLUMN "twitter_url",
DROP COLUMN "website_url";
