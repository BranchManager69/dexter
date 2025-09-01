-- CreateTable
CREATE TABLE "token_creation_vouchers" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "contest_wallet_private_key" TEXT,
    "token_mint" VARCHAR(44),
    "token_name" VARCHAR(100),
    "token_symbol" VARCHAR(20),
    "token_description" TEXT,
    "image_url" VARCHAR(500),
    "website" VARCHAR(500),
    "twitter" VARCHAR(500),
    "telegram" VARCHAR(500),
    "pool_address" VARCHAR(44),
    "config_key" VARCHAR(44),
    "initial_market_cap" DECIMAL(10,2) DEFAULT 90,
    "migration_cap" DECIMAL(10,2) DEFAULT 400,
    "anti_sniping" BOOLEAN NOT NULL DEFAULT false,
    "lp_locked" BOOLEAN NOT NULL DEFAULT true,
    "quote_token" VARCHAR(10) NOT NULL DEFAULT 'SOL',
    "purchase_amount_sol" DECIMAL(10,8),
    "purchase_tx_signature" VARCHAR(88),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMPTZ(6),

    CONSTRAINT "token_creation_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_launched_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "voucher_id" INTEGER NOT NULL,
    "mint_address" VARCHAR(44) NOT NULL,
    "wallet_private_key" TEXT NOT NULL,
    "launch_timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initial_purchase_tx" VARCHAR(88),

    CONSTRAINT "user_launched_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_creation_vouchers_user_id_claimed_idx" ON "token_creation_vouchers"("user_id", "claimed");

-- CreateIndex
CREATE INDEX "token_creation_vouchers_expires_at_idx" ON "token_creation_vouchers"("expires_at");

-- CreateIndex
CREATE INDEX "token_creation_vouchers_claimed_idx" ON "token_creation_vouchers"("claimed");

-- CreateIndex
CREATE UNIQUE INDEX "token_creation_vouchers_user_id_contest_id_key" ON "token_creation_vouchers"("user_id", "contest_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_launched_tokens_voucher_id_key" ON "user_launched_tokens"("voucher_id");

-- CreateIndex
CREATE INDEX "user_launched_tokens_user_id_idx" ON "user_launched_tokens"("user_id");

-- CreateIndex
CREATE INDEX "user_launched_tokens_mint_address_idx" ON "user_launched_tokens"("mint_address");

-- AddForeignKey
ALTER TABLE "token_creation_vouchers" ADD CONSTRAINT "token_creation_vouchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_creation_vouchers" ADD CONSTRAINT "token_creation_vouchers_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_launched_tokens" ADD CONSTRAINT "user_launched_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_launched_tokens" ADD CONSTRAINT "user_launched_tokens_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "token_creation_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
