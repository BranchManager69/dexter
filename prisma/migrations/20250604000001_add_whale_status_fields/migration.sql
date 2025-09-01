-- Add whale status fields to users table
ALTER TABLE "users" 
ADD COLUMN "degen_token_balance" BIGINT DEFAULT 0,
ADD COLUMN "whale_status" BOOLEAN DEFAULT FALSE,
ADD COLUMN "whale_tier" VARCHAR(20),
ADD COLUMN "last_balance_update" TIMESTAMPTZ;

-- Create index for whale status queries
CREATE INDEX "idx_users_whale_status" ON "users"("whale_status");
CREATE INDEX "idx_users_whale_tier" ON "users"("whale_tier");
CREATE INDEX "idx_users_degen_balance" ON "users"("degen_token_balance" DESC);

-- Create whale status history table for tracking changes
CREATE TABLE "whale_status_history" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "balance" BIGINT NOT NULL,
  "is_whale" BOOLEAN NOT NULL,
  "tier" VARCHAR(20),
  "checked_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_whale_history_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_whale_history_user" ON "whale_status_history"("user_id");
CREATE INDEX "idx_whale_history_checked" ON "whale_status_history"("checked_at" DESC);