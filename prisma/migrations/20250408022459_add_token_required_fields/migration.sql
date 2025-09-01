-- First update any NULL values in the existing columns
UPDATE "tokens" SET "is_active" = true WHERE "is_active" IS NULL;
UPDATE "tokens" SET "change_24h" = 0.00 WHERE "change_24h" IS NULL;

-- Then alter the table with new columns and make existing columns required
ALTER TABLE "tokens" 
ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#888888',
ADD COLUMN     "price" DECIMAL(20,8) NOT NULL DEFAULT 0.00000000,
ALTER COLUMN "is_active" SET NOT NULL,
ALTER COLUMN "change_24h" SET NOT NULL,
ALTER COLUMN "change_24h" SET DEFAULT 0.00;

-- CreateTable
CREATE TABLE "token_price_history" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "source" VARCHAR(50),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_price_history_token_id_idx" ON "token_price_history"("token_id");

-- CreateIndex
CREATE INDEX "token_price_history_timestamp_idx" ON "token_price_history"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "token_price_history_token_id_timestamp_idx" ON "token_price_history"("token_id", "timestamp" DESC);

-- AddForeignKey
ALTER TABLE "token_price_history" ADD CONSTRAINT "token_price_history_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
