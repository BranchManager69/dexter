-- AddForeignKey
ALTER TABLE "contest_portfolios" ADD CONSTRAINT "contest_portfolios_contest_id_wallet_address_fkey" FOREIGN KEY ("contest_id", "wallet_address") REFERENCES "contest_participants"("contest_id", "wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
