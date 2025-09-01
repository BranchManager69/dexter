-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "key_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_wallet_address_idx" ON "api_keys"("wallet_address");

-- CreateIndex
CREATE INDEX "api_keys_is_active_idx" ON "api_keys"("is_active");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
