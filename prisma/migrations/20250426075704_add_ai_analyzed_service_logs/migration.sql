-- CreateTable
CREATE TABLE "ai_analyzed_service_logs" (
    "id" SERIAL NOT NULL,
    "log_id" INTEGER NOT NULL,
    "service" VARCHAR(50) NOT NULL,
    "analysis_id" INTEGER NOT NULL,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyzed_service_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_analyzed_service_logs_log_id_idx" ON "ai_analyzed_service_logs"("log_id");

-- CreateIndex
CREATE INDEX "ai_analyzed_service_logs_analysis_id_idx" ON "ai_analyzed_service_logs"("analysis_id");

-- CreateIndex
CREATE INDEX "ai_analyzed_service_logs_service_idx" ON "ai_analyzed_service_logs"("service");

-- CreateIndex
CREATE UNIQUE INDEX "ai_analyzed_service_logs_log_id_analysis_id_key" ON "ai_analyzed_service_logs"("log_id", "analysis_id");

-- AddForeignKey
ALTER TABLE "ai_analyzed_service_logs" ADD CONSTRAINT "ai_analyzed_service_logs_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "ai_service_log_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
