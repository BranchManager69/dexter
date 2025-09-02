-- CreateTable
CREATE TABLE "oauth_user_wallets" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "wallet_id" TEXT NOT NULL,
    "default_wallet" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "oauth_user_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oauth_user_wallets_provider_subject_idx" ON "oauth_user_wallets"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_user_wallets_provider_subject_wallet_id_key" ON "oauth_user_wallets"("provider", "subject", "wallet_id");

-- AddForeignKey
ALTER TABLE "oauth_user_wallets" ADD CONSTRAINT "oauth_user_wallets_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "managed_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
