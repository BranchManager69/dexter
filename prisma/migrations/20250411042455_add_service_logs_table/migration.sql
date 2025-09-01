-- CreateTable
CREATE TABLE "service_logs" (
    "id" SERIAL NOT NULL,
    "service" VARCHAR(50) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB DEFAULT '{}',
    "metadata" JSONB DEFAULT '{}',
    "instance_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "related_entity" VARCHAR(100),
    "event_type" VARCHAR(50),
    "duration_ms" INTEGER,
    "environment" VARCHAR(20),

    CONSTRAINT "service_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_logs_service_level_idx" ON "service_logs"("service", "level");

-- CreateIndex
CREATE INDEX "service_logs_created_at_idx" ON "service_logs"("created_at");

-- CreateIndex
CREATE INDEX "service_logs_service_created_at_idx" ON "service_logs"("service", "created_at");

-- CreateIndex
CREATE INDEX "service_logs_level_created_at_idx" ON "service_logs"("level", "created_at");

-- CreateIndex
CREATE INDEX "service_logs_related_entity_idx" ON "service_logs"("related_entity");

-- CreateIndex
CREATE INDEX "service_logs_event_type_idx" ON "service_logs"("event_type");
