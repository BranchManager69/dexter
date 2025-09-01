-- CreateTable
CREATE TABLE "websocket_connections" (
    "id" SERIAL NOT NULL,
    "connection_id" TEXT NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "wallet_address" VARCHAR(44),
    "nickname" VARCHAR(100),
    "is_authenticated" BOOLEAN NOT NULL DEFAULT false,
    "environment" VARCHAR(20),
    "origin" TEXT,
    "connected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMPTZ(6),
    "duration_seconds" INTEGER,
    "close_code" INTEGER,
    "close_reason" TEXT,
    "subscribed_topics" JSONB DEFAULT '[]',
    "messages_received" INTEGER NOT NULL DEFAULT 0,
    "messages_sent" INTEGER NOT NULL DEFAULT 0,
    "connection_error" TEXT,
    "country" VARCHAR(2),
    "region" VARCHAR(100),
    "city" VARCHAR(100),
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "websocket_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "websocket_connections_connection_id_idx" ON "websocket_connections"("connection_id");

-- CreateIndex
CREATE INDEX "websocket_connections_ip_address_idx" ON "websocket_connections"("ip_address");

-- CreateIndex
CREATE INDEX "websocket_connections_wallet_address_idx" ON "websocket_connections"("wallet_address");

-- CreateIndex
CREATE INDEX "websocket_connections_connected_at_idx" ON "websocket_connections"("connected_at");

-- CreateIndex
CREATE INDEX "websocket_connections_disconnected_at_idx" ON "websocket_connections"("disconnected_at");

-- CreateIndex
CREATE INDEX "websocket_connections_is_authenticated_idx" ON "websocket_connections"("is_authenticated");
