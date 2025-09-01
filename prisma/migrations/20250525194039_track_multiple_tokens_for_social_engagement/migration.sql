-- CreateTable
CREATE TABLE "tokens_to_monitor" (
    "id" SERIAL NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "token_name" VARCHAR(255),
    "token_symbol" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "discord_role_id" VARCHAR(20),
    "role_name" VARCHAR(100),
    "check_interval_seconds" INTEGER NOT NULL DEFAULT 10,
    "privilege_key" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tokens_to_monitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_to_monitor_token_address_key" ON "tokens_to_monitor"("token_address");

-- CreateIndex
CREATE INDEX "tokens_to_monitor_is_active_idx" ON "tokens_to_monitor"("is_active");

-- CreateIndex
CREATE INDEX "tokens_to_monitor_token_address_idx" ON "tokens_to_monitor"("token_address");
