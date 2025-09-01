-- CreateEnum
CREATE TYPE "JupLikeStatus" AS ENUM ('LIKING', 'UNLIKED');

-- CreateTable
CREATE TABLE "jup_likes" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JupLikeStatus" NOT NULL DEFAULT 'LIKING',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jup_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jup_likes_username_key" ON "jup_likes"("username");
