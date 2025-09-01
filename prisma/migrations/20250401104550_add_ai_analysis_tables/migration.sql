-- CreateTable
CREATE TABLE "ai_error_analyses" (
    "id" SERIAL NOT NULL,
    "summary" TEXT NOT NULL,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_count" INTEGER NOT NULL,
    "time_window_minutes" INTEGER NOT NULL,
    "severity_distribution" JSONB DEFAULT '{}',
    "browser_distribution" JSONB DEFAULT '{}',
    "os_distribution" JSONB DEFAULT '{}',
    "top_errors" JSONB DEFAULT '[]',
    "created_by" VARCHAR(44),

    CONSTRAINT "ai_error_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_admin_action_analyses" (
    "id" SERIAL NOT NULL,
    "summary" TEXT NOT NULL,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action_count" INTEGER NOT NULL,
    "time_window_minutes" INTEGER NOT NULL,
    "action_distribution" JSONB DEFAULT '{}',
    "admin_distribution" JSONB DEFAULT '{}',
    "top_actions" JSONB DEFAULT '[]',
    "created_by" VARCHAR(44),

    CONSTRAINT "ai_admin_action_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_error_analyses_analyzed_at_idx" ON "ai_error_analyses"("analyzed_at");

-- CreateIndex
CREATE INDEX "ai_admin_action_analyses_analyzed_at_idx" ON "ai_admin_action_analyses"("analyzed_at");
