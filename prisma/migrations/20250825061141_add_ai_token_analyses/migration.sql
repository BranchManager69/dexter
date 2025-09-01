-- CreateTable
CREATE TABLE "ai_token_analyses" (
    "id" SERIAL NOT NULL,
    "token_address" VARCHAR(44) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT,
    "api" TEXT,
    "tool_calls_made" INTEGER,
    "timings" JSONB,
    "web_search_used" BOOLEAN,
    "web_citations" JSONB,
    "token_type" TEXT,
    "branch_score" INTEGER,
    "risk_score" INTEGER,
    "summary" TEXT,
    "project_summary" TEXT,
    "file_path" TEXT,
    "analysis_json" JSONB NOT NULL,

    CONSTRAINT "ai_token_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_token_analyses_token_address_created_at_idx" ON "ai_token_analyses"("token_address", "created_at");
