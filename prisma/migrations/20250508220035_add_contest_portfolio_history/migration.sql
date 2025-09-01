-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_ai_agent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "contest_portfolio_history" (
    "id" SERIAL NOT NULL,
    "contest_participant_id" INTEGER NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "portfolio_value" DECIMAL(20,8) NOT NULL,

    CONSTRAINT "contest_portfolio_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contest_portfolio_history_contest_participant_id_timestamp_idx" ON "contest_portfolio_history"("contest_participant_id", "timestamp");

-- AddForeignKey
ALTER TABLE "contest_portfolio_history" ADD CONSTRAINT "contest_portfolio_history_contest_participant_id_fkey" FOREIGN KEY ("contest_participant_id") REFERENCES "contest_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
