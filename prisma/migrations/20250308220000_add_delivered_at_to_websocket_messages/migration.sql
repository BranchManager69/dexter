-- AlterTable
ALTER TABLE "websocket_messages" ADD COLUMN "delivered_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "idx_websocket_messages_delivered_at" ON "websocket_messages"("delivered_at");