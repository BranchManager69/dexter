-- CreateTable
CREATE TABLE "ai_app_users" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255),
    "role" VARCHAR(32) NOT NULL DEFAULT 'user',
    "ext_user_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_user_tokens" (
    "token" VARCHAR(255) NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_user_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "ai_user_settings" (
    "user_id" TEXT NOT NULL,
    "default_wallet_id" TEXT,
    "last_used_wallet_id" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ai_wallet_aliases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "alias" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_wallet_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_trade_audit" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT,
    "wallet_id" TEXT,
    "token_mint" VARCHAR(64),
    "action" VARCHAR(32) NOT NULL,
    "amount_ui" DECIMAL(24,9),
    "tx_hash" VARCHAR(128),
    "frames_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_trade_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_user_settings_user_id_idx" ON "ai_user_settings"("user_id");

-- CreateIndex
CREATE INDEX "ai_wallet_aliases_user_id_alias_idx" ON "ai_wallet_aliases"("user_id", "alias");

-- CreateIndex
CREATE INDEX "ai_wallet_aliases_wallet_id_idx" ON "ai_wallet_aliases"("wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_wallet_aliases_user_id_alias_key" ON "ai_wallet_aliases"("user_id", "alias");

-- CreateIndex
CREATE INDEX "ai_trade_audit_user_id_created_at_idx" ON "ai_trade_audit"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_trade_audit_wallet_id_created_at_idx" ON "ai_trade_audit"("wallet_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_user_tokens" ADD CONSTRAINT "ai_user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "ai_app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_user_settings" ADD CONSTRAINT "ai_user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "ai_app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_wallet_aliases" ADD CONSTRAINT "ai_wallet_aliases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "ai_app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_trade_audit" ADD CONSTRAINT "ai_trade_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "ai_app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
