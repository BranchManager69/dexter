-- AlterTable
ALTER TABLE "telegram_users" ADD COLUMN     "is_linked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "telegram_account_links" (
    "id" TEXT NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_account_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_linking_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_linking_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_account_links_telegram_user_id_key" ON "telegram_account_links"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_linking_tokens_token_key" ON "telegram_linking_tokens"("token");

-- CreateIndex
CREATE INDEX "telegram_users_is_linked_idx" ON "telegram_users"("is_linked");
