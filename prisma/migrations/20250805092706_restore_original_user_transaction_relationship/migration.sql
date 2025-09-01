-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE NO ACTION ON UPDATE NO ACTION;
