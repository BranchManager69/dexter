-- AlterTable
ALTER TABLE "token_config" ADD COLUMN     "address" VARCHAR(44);

-- CreateTable
CREATE TABLE "ai_log_analyses" (
    "id" SERIAL NOT NULL,
    "summary" TEXT NOT NULL,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "log_file" VARCHAR(255) NOT NULL,
    "lines_analyzed" INTEGER NOT NULL,
    "created_by" VARCHAR(44),

    CONSTRAINT "ai_log_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_service_log_analyses" (
    "id" SERIAL NOT NULL,
    "service" VARCHAR(50) NOT NULL,
    "summary" TEXT NOT NULL,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "log_count" INTEGER NOT NULL,
    "time_window_hours" INTEGER NOT NULL,
    "created_by" VARCHAR(44),

    CONSTRAINT "ai_service_log_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_log_analyses_analyzed_at_idx" ON "ai_log_analyses"("analyzed_at");

-- CreateIndex
CREATE INDEX "ai_service_log_analyses_analyzed_at_idx" ON "ai_service_log_analyses"("analyzed_at");

-- CreateIndex
CREATE INDEX "ai_service_log_analyses_service_idx" ON "ai_service_log_analyses"("service");
