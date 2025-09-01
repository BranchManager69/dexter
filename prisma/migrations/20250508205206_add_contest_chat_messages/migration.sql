-- CreateTable
CREATE TABLE "contest_chat_messages" (
    "id" SERIAL NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "sender_wallet_address" VARCHAR(44) NOT NULL,
    "message_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contest_chat_messages_contest_id_created_at_idx" ON "contest_chat_messages"("contest_id", "created_at");

-- AddForeignKey
ALTER TABLE "contest_chat_messages" ADD CONSTRAINT "contest_chat_messages_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_chat_messages" ADD CONSTRAINT "contest_chat_messages_sender_wallet_address_fkey" FOREIGN KEY ("sender_wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
