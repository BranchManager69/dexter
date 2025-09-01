-- CreateTable
CREATE TABLE "telegram_messages_tokenai" (
    "id" SERIAL NOT NULL,
    "mint" VARCHAR(44) NOT NULL,
    "chat_ref" VARCHAR(255) NOT NULL,
    "message_id" VARCHAR(40) NOT NULL,
    "date" TIMESTAMPTZ(6),
    "text" TEXT,
    "views" INTEGER,
    "forwards" INTEGER,
    "reply_to_msg_id" VARCHAR(40),
    "out" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_messages_tokenai_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_messages_tokenai_mint_chat_ref_date_idx" ON "telegram_messages_tokenai"("mint", "chat_ref", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_messages_tokenai_mint_chat_ref_message_id_key" ON "telegram_messages_tokenai"("mint", "chat_ref", "message_id");
