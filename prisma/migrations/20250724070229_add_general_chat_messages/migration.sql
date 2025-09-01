-- CreateTable
CREATE TABLE "general_chat_messages" (
    "id" SERIAL NOT NULL,
    "sender_wallet_address" VARCHAR(44) NOT NULL,
    "message_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "general_chat_messages_created_at_idx" ON "general_chat_messages"("created_at");

-- AddForeignKey
ALTER TABLE "general_chat_messages" ADD CONSTRAINT "general_chat_messages_sender_wallet_address_fkey" FOREIGN KEY ("sender_wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
