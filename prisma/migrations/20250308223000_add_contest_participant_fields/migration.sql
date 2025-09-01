-- AlterTable
ALTER TABLE "contest_participants" 
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "portfolio_value" DECIMAL(20,8) DEFAULT 0,
ADD COLUMN "initial_balance" DECIMAL(20,8) DEFAULT 0;

-- CreateIndex
CREATE INDEX "contest_participants_status_idx" ON "contest_participants"("status");

-- CreateIndex
CREATE INDEX "contest_participants_portfolio_value_idx" ON "contest_participants"("portfolio_value");