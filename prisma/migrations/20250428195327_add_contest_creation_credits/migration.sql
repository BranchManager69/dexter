-- AlterTable
ALTER TABLE "contests" ADD COLUMN     "created_by_user" VARCHAR(44),
ADD COLUMN     "creator_credit_used" INTEGER,
ADD COLUMN     "visibility" VARCHAR(20) NOT NULL DEFAULT 'public';

-- CreateTable
CREATE TABLE "contest_creation_credits" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(44) NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "price_paid" DECIMAL(20,8),
    "transaction_id" VARCHAR(64),
    "granted_by" VARCHAR(44),
    "metadata" JSONB DEFAULT '{}',
    "purchase_txn_signature" VARCHAR(100),
    "receipt_number" VARCHAR(30),
    "contest_settings" JSONB DEFAULT '{}',

    CONSTRAINT "contest_creation_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contest_creation_credits_user_id_idx" ON "contest_creation_credits"("user_id");

-- CreateIndex
CREATE INDEX "contest_creation_credits_status_idx" ON "contest_creation_credits"("status");

-- CreateIndex
CREATE INDEX "contest_creation_credits_expires_at_idx" ON "contest_creation_credits"("expires_at");

-- CreateIndex
CREATE INDEX "contest_creation_credits_source_idx" ON "contest_creation_credits"("source");

-- CreateIndex
CREATE INDEX "contests_visibility_idx" ON "contests"("visibility");

-- CreateIndex
CREATE INDEX "contests_created_by_user_idx" ON "contests"("created_by_user");

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_created_by_user_fkey" FOREIGN KEY ("created_by_user") REFERENCES "users"("wallet_address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_creator_credit_used_fkey" FOREIGN KEY ("creator_credit_used") REFERENCES "contest_creation_credits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_creation_credits" ADD CONSTRAINT "contest_creation_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;
