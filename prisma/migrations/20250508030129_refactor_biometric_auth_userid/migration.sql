/*
  Warnings:

  - You are about to drop the column `credential_id` on the `auth_challenges` table. All the data in the column will be lost.
  - Changed the type of `user_id` on the `biometric_credentials` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "biometric_credentials" DROP CONSTRAINT "biometric_credentials_user_id_fkey";

-- AlterTable
ALTER TABLE "auth_challenges" DROP COLUMN "credential_id";

-- AlterTable
ALTER TABLE "biometric_credentials" DROP COLUMN "user_id",
ADD COLUMN     "user_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "biometric_auth_challenges" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "challenge" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "credential_id" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "biometric_auth_challenges_challenge_key" ON "biometric_auth_challenges"("challenge");

-- CreateIndex
CREATE INDEX "biometric_auth_challenges_user_id_idx" ON "biometric_auth_challenges"("user_id");

-- CreateIndex
CREATE INDEX "biometric_auth_challenges_expires_at_idx" ON "biometric_auth_challenges"("expires_at");

-- CreateIndex
CREATE INDEX "idx_biometric_credentials_user" ON "biometric_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "biometric_credentials" ADD CONSTRAINT "biometric_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_auth_challenges" ADD CONSTRAINT "biometric_auth_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
