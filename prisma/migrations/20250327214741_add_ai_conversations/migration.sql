/*
  Warnings:

  - You are about to drop the `ai_conversation_messages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ai_conversations` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ai_conversation_messages" DROP CONSTRAINT "ai_conversation_messages_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_conversations" DROP CONSTRAINT "ai_conversations_wallet_address_fkey";

-- DropTable
DROP TABLE "ai_conversation_messages";

-- DropTable
DROP TABLE "ai_conversations";
