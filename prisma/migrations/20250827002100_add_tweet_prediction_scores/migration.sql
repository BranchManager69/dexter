-- CreateTable
CREATE TABLE "tweet_prediction_scores" (
    "id" SERIAL NOT NULL,
    "tweet_id" VARCHAR(32) NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "author_handle" VARCHAR(50) NOT NULL,
    "tweet_timestamp" TIMESTAMP(3) NOT NULL,
    "prediction_type" VARCHAR(20) NOT NULL,
    "prediction_text" TEXT,
    "target_price" DOUBLE PRECISION,
    "minutes_checked" INTEGER NOT NULL,
    "price_before" DOUBLE PRECISION NOT NULL,
    "price_after" DOUBLE PRECISION NOT NULL,
    "price_change_pct" DOUBLE PRECISION NOT NULL,
    "volume_before" DOUBLE PRECISION,
    "volume_after" DOUBLE PRECISION,
    "accuracy_score" DOUBLE PRECISION NOT NULL,
    "verdict" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tweet_prediction_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tweet_prediction_scores_tweet_id_idx" ON "tweet_prediction_scores"("tweet_id");

-- CreateIndex
CREATE INDEX "tweet_prediction_scores_token_address_created_at_idx" ON "tweet_prediction_scores"("token_address", "created_at");

-- CreateIndex
CREATE INDEX "tweet_prediction_scores_author_handle_accuracy_score_idx" ON "tweet_prediction_scores"("author_handle", "accuracy_score");
