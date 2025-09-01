/*
  Warnings:

  - Added the required column `quantity` to the `contest_portfolios` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "contest_portfolios" ADD COLUMN     "quantity" DECIMAL(20,8) NOT NULL;
