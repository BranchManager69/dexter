/*
  Warnings:

  - You are about to drop the column `created_at` on the `jup_likes` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[token_address,username]` on the table `jup_likes` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `token_address` to the `jup_likes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "jup_likes" DROP COLUMN "created_at",
ADD COLUMN     "token_address" VARCHAR(44) NOT NULL;

-- CreateIndex
CREATE INDEX "jup_likes_token_address_idx" ON "jup_likes"("token_address");

-- CreateIndex
CREATE INDEX "jup_likes_username_idx" ON "jup_likes"("username");

-- CreateIndex
CREATE UNIQUE INDEX "jup_likes_token_address_username_key" ON "jup_likes"("token_address", "username");
