-- CreateTable
CREATE TABLE "user_ip_history" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "first_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_count" INTEGER NOT NULL DEFAULT 1,
    "country_code" VARCHAR(2),
    "region" VARCHAR(100),
    "city" VARCHAR(100),
    "is_suspicious" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "user_ip_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_user_ip_address" ON "user_ip_history"("ip_address");

-- CreateIndex
CREATE INDEX "idx_user_ip_wallet" ON "user_ip_history"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_user_ip_suspicious" ON "user_ip_history"("is_suspicious");

-- CreateIndex
CREATE INDEX "idx_user_ip_first_seen" ON "user_ip_history"("first_seen");

-- CreateIndex
CREATE INDEX "idx_user_ip_last_seen" ON "user_ip_history"("last_seen");

-- CreateIndex
CREATE UNIQUE INDEX "user_ip_history_wallet_address_ip_address_key" ON "user_ip_history"("wallet_address", "ip_address");

-- AddForeignKey
ALTER TABLE "user_ip_history" ADD CONSTRAINT "user_ip_history_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;
