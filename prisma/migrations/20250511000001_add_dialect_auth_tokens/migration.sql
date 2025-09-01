-- CreateTable
CREATE TABLE "dialect_auth_tokens" (
    "id" SERIAL NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dialect_auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialect_blinks_usage" (
    "id" SERIAL NOT NULL,
    "blink_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "transaction_signature" TEXT,
    "metadata" JSONB,

    CONSTRAINT "dialect_blinks_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dialect_auth_tokens_wallet_address_idx" ON "dialect_auth_tokens"("wallet_address");

-- CreateIndex
CREATE INDEX "dialect_auth_tokens_expires_at_idx" ON "dialect_auth_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "dialect_blinks_usage_blink_id_idx" ON "dialect_blinks_usage"("blink_id");

-- CreateIndex
CREATE INDEX "dialect_blinks_usage_wallet_address_idx" ON "dialect_blinks_usage"("wallet_address");

-- CreateIndex
CREATE INDEX "dialect_blinks_usage_timestamp_idx" ON "dialect_blinks_usage"("timestamp");