-- AlterTable
ALTER TABLE "telegram_messages" ADD COLUMN     "external_reply_author_signature" VARCHAR(100),
ADD COLUMN     "external_reply_chat_id" VARCHAR(20),
ADD COLUMN     "external_reply_origin_type" VARCHAR(20),
ADD COLUMN     "has_protected_content" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_automatic_forward" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quote_position" INTEGER,
ADD COLUMN     "quote_text" TEXT;

-- CreateTable
CREATE TABLE "didi_user_intelligence_notes" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "personality_profile" JSONB DEFAULT '{}',
    "behavior_patterns" JSONB DEFAULT '[]',
    "expertise" JSONB DEFAULT '{}',
    "interests" JSONB DEFAULT '[]',
    "relationships" JSONB DEFAULT '{}',
    "quirks" JSONB DEFAULT '[]',
    "ai_notes" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "didi_user_intelligence_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "didi_user_scores" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "helpfulness" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "engagement" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "expertise" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "sentiment" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "influence" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "consistency" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "growth" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "leadership" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "overall_score" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "didi_user_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "didi_conversation_summaries" (
    "id" SERIAL NOT NULL,
    "chat_id" VARCHAR(20) NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "summary" TEXT NOT NULL,
    "topics" JSONB DEFAULT '[]',
    "participants" JSONB DEFAULT '{}',
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "didi_conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "didi_user_sentiment_history" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "chat_id" VARCHAR(20) NOT NULL,
    "sentiment_score" DECIMAL(3,2) NOT NULL,
    "message_window_start" TIMESTAMPTZ(6) NOT NULL,
    "message_window_end" TIMESTAMPTZ(6) NOT NULL,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "didi_user_sentiment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "didi_user_topic_interests" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "topic" TEXT NOT NULL,
    "interest_score" DECIMAL(3,2) NOT NULL DEFAULT 0.0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_engagement" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "didi_user_topic_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "didi_user_behavior_changes" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "change_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "before_metrics" JSONB DEFAULT '{}',
    "after_metrics" JSONB DEFAULT '{}',
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "didi_user_behavior_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "didi_user_intelligence_notes_user_id_key" ON "didi_user_intelligence_notes"("user_id");

-- CreateIndex
CREATE INDEX "didi_user_intelligence_notes_user_id_idx" ON "didi_user_intelligence_notes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "didi_user_scores_user_id_key" ON "didi_user_scores"("user_id");

-- CreateIndex
CREATE INDEX "didi_user_scores_user_id_idx" ON "didi_user_scores"("user_id");

-- CreateIndex
CREATE INDEX "didi_user_scores_overall_score_idx" ON "didi_user_scores"("overall_score");

-- CreateIndex
CREATE INDEX "didi_conversation_summaries_chat_id_idx" ON "didi_conversation_summaries"("chat_id");

-- CreateIndex
CREATE INDEX "didi_conversation_summaries_start_time_end_time_idx" ON "didi_conversation_summaries"("start_time", "end_time");

-- CreateIndex
CREATE INDEX "didi_user_sentiment_history_user_id_idx" ON "didi_user_sentiment_history"("user_id");

-- CreateIndex
CREATE INDEX "didi_user_sentiment_history_message_window_start_message_wi_idx" ON "didi_user_sentiment_history"("message_window_start", "message_window_end");

-- CreateIndex
CREATE INDEX "didi_user_topic_interests_user_id_idx" ON "didi_user_topic_interests"("user_id");

-- CreateIndex
CREATE INDEX "didi_user_topic_interests_topic_idx" ON "didi_user_topic_interests"("topic");

-- CreateIndex
CREATE UNIQUE INDEX "didi_user_topic_interests_user_id_topic_key" ON "didi_user_topic_interests"("user_id", "topic");

-- CreateIndex
CREATE INDEX "didi_user_behavior_changes_user_id_idx" ON "didi_user_behavior_changes"("user_id");

-- CreateIndex
CREATE INDEX "didi_user_behavior_changes_detected_at_idx" ON "didi_user_behavior_changes"("detected_at");

-- CreateIndex
CREATE INDEX "telegram_messages_external_reply_chat_id_idx" ON "telegram_messages"("external_reply_chat_id");

-- CreateIndex
CREATE INDEX "telegram_messages_quote_text_idx" ON "telegram_messages"("quote_text");
