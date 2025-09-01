-- AlterTable
ALTER TABLE "config_ai_service" ALTER COLUMN "model_loadouts" SET DEFAULT '{"default":{"model":"gpt-4.1-mini","maxTokens":4048,"temperature":0.4},"errorAnalysis":{"model":"gpt-4.1-mini","maxTokens":4048,"temperature":0.4},"adminAnalysis":{"model":"gpt-4.1-mini","maxTokens":4048,"temperature":0.4}}';

-- CreateTable
CREATE TABLE "ai_analyzed_errors" (
    "id" SERIAL NOT NULL,
    "error_id" TEXT NOT NULL,
    "analysis_id" INTEGER NOT NULL,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyzed_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyzed_admin_actions" (
    "id" SERIAL NOT NULL,
    "action_id" INTEGER NOT NULL,
    "analysis_id" INTEGER NOT NULL,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyzed_admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_analyzed_errors_error_id_idx" ON "ai_analyzed_errors"("error_id");

-- CreateIndex
CREATE INDEX "ai_analyzed_errors_analysis_id_idx" ON "ai_analyzed_errors"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_analyzed_errors_error_id_analysis_id_key" ON "ai_analyzed_errors"("error_id", "analysis_id");

-- CreateIndex
CREATE INDEX "ai_analyzed_admin_actions_action_id_idx" ON "ai_analyzed_admin_actions"("action_id");

-- CreateIndex
CREATE INDEX "ai_analyzed_admin_actions_analysis_id_idx" ON "ai_analyzed_admin_actions"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_analyzed_admin_actions_action_id_analysis_id_key" ON "ai_analyzed_admin_actions"("action_id", "analysis_id");

-- AddForeignKey
ALTER TABLE "ai_analyzed_errors" ADD CONSTRAINT "ai_analyzed_errors_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "ai_error_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyzed_admin_actions" ADD CONSTRAINT "ai_analyzed_admin_actions_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "ai_admin_action_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
