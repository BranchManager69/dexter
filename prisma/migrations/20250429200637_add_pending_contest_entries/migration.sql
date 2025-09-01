-- CreateTable
CREATE TABLE "pending_contest_entries" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "portfolio" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pending_contest_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_contest_entries_wallet_address_idx" ON "pending_contest_entries"("wallet_address");

-- CreateIndex
CREATE INDEX "pending_contest_entries_contest_id_idx" ON "pending_contest_entries"("contest_id");

-- CreateIndex
CREATE INDEX "pending_contest_entries_status_idx" ON "pending_contest_entries"("status");

-- CreateIndex
CREATE INDEX "pending_contest_entries_expires_at_idx" ON "pending_contest_entries"("expires_at");

-- AddForeignKey
ALTER TABLE "pending_contest_entries" ADD CONSTRAINT "pending_contest_entries_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_contest_entries" ADD CONSTRAINT "pending_contest_entries_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
