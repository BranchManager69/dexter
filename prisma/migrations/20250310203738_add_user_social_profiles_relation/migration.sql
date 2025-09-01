-- AddForeignKey
ALTER TABLE "user_social_profiles" ADD CONSTRAINT "user_social_profiles_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;
