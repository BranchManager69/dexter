-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "context" VARCHAR(50),
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "total_tokens_used" INTEGER NOT NULL DEFAULT 0,
    "first_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "tokens" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversations_conversation_id_key" ON "ai_conversations"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_conversations_wallet_address_idx" ON "ai_conversations"("wallet_address");

-- CreateIndex
CREATE INDEX "ai_conversations_conversation_id_idx" ON "ai_conversations"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_conversations_last_message_at_idx" ON "ai_conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "ai_conversation_messages_conversation_id_idx" ON "ai_conversation_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_conversation_messages_created_at_idx" ON "ai_conversation_messages"("created_at");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_messages" ADD CONSTRAINT "ai_conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;
