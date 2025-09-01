-- CreateTable
CREATE TABLE "telegram_users" (
    "id" SERIAL NOT NULL,
    "telegram_user_id" VARCHAR(20) NOT NULL,
    "username" VARCHAR(32),
    "first_name" VARCHAR(64),
    "last_name" VARCHAR(64),
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "timeout_count" INTEGER NOT NULL DEFAULT 0,
    "ban_count" INTEGER NOT NULL DEFAULT 0,
    "first_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "telegram_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_messages" (
    "id" SERIAL NOT NULL,
    "message_id" VARCHAR(20) NOT NULL,
    "chat_id" VARCHAR(20) NOT NULL,
    "telegram_user_id" VARCHAR(20) NOT NULL,
    "username" VARCHAR(32),
    "first_name" VARCHAR(64),
    "text" TEXT,
    "message_type" VARCHAR(20) NOT NULL DEFAULT 'text',
    "caption" TEXT,
    "forward_from_user_id" VARCHAR(20),
    "forward_from_chat_id" VARCHAR(20),
    "forward_from_chat_type" VARCHAR(20),
    "forward_signature" VARCHAR(100),
    "forward_date" TIMESTAMPTZ(6),
    "reply_to_message_id" VARCHAR(20),
    "reply_to_text" TEXT,
    "reply_to_user_id" VARCHAR(20),
    "has_media" BOOLEAN NOT NULL DEFAULT false,
    "media_type" VARCHAR(20),
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "event_type" VARCHAR(20),
    "raw_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_users_telegram_user_id_key" ON "telegram_users"("telegram_user_id");

-- CreateIndex
CREATE INDEX "telegram_users_telegram_user_id_idx" ON "telegram_users"("telegram_user_id");

-- CreateIndex
CREATE INDEX "telegram_users_username_idx" ON "telegram_users"("username");

-- CreateIndex
CREATE INDEX "telegram_users_last_seen_idx" ON "telegram_users"("last_seen");

-- CreateIndex
CREATE INDEX "telegram_users_is_admin_idx" ON "telegram_users"("is_admin");

-- CreateIndex
CREATE INDEX "telegram_messages_chat_id_created_at_idx" ON "telegram_messages"("chat_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "telegram_messages_telegram_user_id_idx" ON "telegram_messages"("telegram_user_id");

-- CreateIndex
CREATE INDEX "telegram_messages_created_at_idx" ON "telegram_messages"("created_at" DESC);

-- CreateIndex
CREATE INDEX "telegram_messages_message_type_idx" ON "telegram_messages"("message_type");

-- CreateIndex
CREATE INDEX "telegram_messages_event_type_idx" ON "telegram_messages"("event_type");

-- CreateIndex
CREATE INDEX "telegram_messages_chat_id_telegram_user_id_created_at_idx" ON "telegram_messages"("chat_id", "telegram_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_messages_chat_id_message_id_key" ON "telegram_messages"("chat_id", "message_id");

-- AddForeignKey
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_telegram_user_id_fkey" FOREIGN KEY ("telegram_user_id") REFERENCES "telegram_users"("telegram_user_id") ON DELETE CASCADE ON UPDATE CASCADE;
