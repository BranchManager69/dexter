-- CreateTable
CREATE TABLE "user_privileges" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "privilege_key" VARCHAR(100) NOT NULL,
    "source" VARCHAR(50),
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "user_privileges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_privileges_wallet_address_idx" ON "user_privileges"("wallet_address");

-- CreateIndex
CREATE INDEX "user_privileges_privilege_key_idx" ON "user_privileges"("privilege_key");

-- CreateIndex
CREATE INDEX "user_privileges_revoked_at_idx" ON "user_privileges"("revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_privileges_wallet_address_privilege_key_key" ON "user_privileges"("wallet_address", "privilege_key");

-- AddForeignKey
ALTER TABLE "user_privileges" ADD CONSTRAINT "user_privileges_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;
