-- CreateEnum
CREATE TYPE "contest_type" AS ENUM ('REGULAR', 'PROMO', 'CHALLENGE');

-- CreateEnum
CREATE TYPE "challenge_status" AS ENUM ('PENDING_ACCEPTANCE', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "contests" ADD COLUMN     "challenge_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "challenge_status" "challenge_status",
ADD COLUMN     "challenged_wallet" VARCHAR(44),
ADD COLUMN     "challenger_wallet" VARCHAR(44),
ADD COLUMN     "contest_type" "contest_type" NOT NULL DEFAULT 'REGULAR';
