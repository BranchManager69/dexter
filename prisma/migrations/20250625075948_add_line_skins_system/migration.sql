-- CreateEnum
CREATE TYPE "LineSkinTier" AS ENUM ('BASIC', 'RARE', 'SPECIAL', 'ADMIN', 'SUPERADMIN');

-- CreateTable
CREATE TABLE "line_skins" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "tier" "LineSkinTier" NOT NULL,
    "design" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_approved" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "line_skins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_line_skins" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "skin_id" INTEGER NOT NULL,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_equipped" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_line_skins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_skins_name_key" ON "line_skins"("name");

-- CreateIndex
CREATE INDEX "line_skins_tier_idx" ON "line_skins"("tier");

-- CreateIndex
CREATE INDEX "line_skins_is_active_idx" ON "line_skins"("is_active");

-- CreateIndex
CREATE INDEX "user_line_skins_wallet_address_idx" ON "user_line_skins"("wallet_address");

-- CreateIndex
CREATE INDEX "user_line_skins_is_equipped_idx" ON "user_line_skins"("is_equipped");

-- CreateIndex
CREATE UNIQUE INDEX "user_line_skins_wallet_address_skin_id_key" ON "user_line_skins"("wallet_address", "skin_id");

-- AddForeignKey
ALTER TABLE "user_line_skins" ADD CONSTRAINT "user_line_skins_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_line_skins" ADD CONSTRAINT "user_line_skins_skin_id_fkey" FOREIGN KEY ("skin_id") REFERENCES "line_skins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
