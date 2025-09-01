-- AlterTable
ALTER TABLE "websocket_messages" 
ADD COLUMN "read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "read_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "idx_websocket_messages_read_wallet" ON "websocket_messages"("read", "wallet_address");