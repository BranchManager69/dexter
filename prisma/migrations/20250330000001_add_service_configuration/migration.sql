-- CreateTable
CREATE TABLE "service_configuration" (
    "id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "check_interval_ms" INTEGER NOT NULL DEFAULT 60000,
    "circuit_breaker" JSONB,
    "backoff" JSONB,
    "thresholds" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    "last_run_at" TIMESTAMP(3),
    "last_run_duration_ms" INTEGER,
    "last_status" TEXT,
    "status_message" TEXT,

    CONSTRAINT "service_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_configuration_service_name_key" ON "service_configuration"("service_name");