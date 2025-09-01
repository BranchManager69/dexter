-- AlterTable
ALTER TABLE "contest_participants" ADD COLUMN     "refund_transaction_id" INTEGER;

-- AddForeignKey
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_refund_transaction_id_fkey" FOREIGN KEY ("refund_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
