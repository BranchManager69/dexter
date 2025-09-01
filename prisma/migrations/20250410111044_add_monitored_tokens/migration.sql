-- CreateTable
CREATE TABLE "monitored_tokens" (
    "token_address" VARCHAR(44) NOT NULL,
    "token_name" TEXT,
    "token_symbol" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 9,
    "monitor_buys" BOOLEAN NOT NULL DEFAULT true,
    "monitor_sells" BOOLEAN NOT NULL DEFAULT true,
    "min_transaction_value" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitored_tokens_pkey" PRIMARY KEY ("token_address")
);

-- AddForeignKey
ALTER TABLE "monitored_tokens" ADD CONSTRAINT "monitored_tokens_token_address_fkey" FOREIGN KEY ("token_address") REFERENCES "tokens"("address") ON DELETE CASCADE ON UPDATE CASCADE;
