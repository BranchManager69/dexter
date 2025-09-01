-- CreateTable
CREATE TABLE "banned_ips" (
    "id" SERIAL NOT NULL,
    "ip_address" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "is_permanent" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(44) NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "num_attempts" INTEGER NOT NULL DEFAULT 0,
    "troll_level" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "banned_ips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banned_ips_ip_address_key" ON "banned_ips"("ip_address");

-- CreateIndex
CREATE INDEX "idx_banned_ips_address" ON "banned_ips"("ip_address");

-- CreateIndex
CREATE INDEX "idx_banned_ips_expires" ON "banned_ips"("expires_at");
