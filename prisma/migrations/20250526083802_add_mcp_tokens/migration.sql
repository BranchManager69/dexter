/*
  Warnings:

  - A unique constraint covering the columns `[mcp_token]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mcp_token" TEXT,
ADD COLUMN     "mcp_token_created_at" TIMESTAMPTZ(6),
ADD COLUMN     "mcp_token_last_used" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "users_mcp_token_key" ON "users"("mcp_token");
