-- AlterTable
ALTER TABLE "ai_error_analyses" ADD COLUMN     "actionability_score" INTEGER,
ADD COLUMN     "assigned_to" VARCHAR(44),
ADD COLUMN     "estimated_cost_usd" DOUBLE PRECISION,
ADD COLUMN     "estimated_impact" VARCHAR(50),
ADD COLUMN     "issue_categories" JSONB DEFAULT '[]',
ADD COLUMN     "model_used" VARCHAR(50),
ADD COLUMN     "priority" INTEGER,
ADD COLUMN     "recommended_actions" JSONB DEFAULT '[]',
ADD COLUMN     "related_services" JSONB DEFAULT '[]',
ADD COLUMN     "resolution_status" VARCHAR(20),
ADD COLUMN     "tokens_completion" INTEGER,
ADD COLUMN     "tokens_prompt" INTEGER,
ADD COLUMN     "tokens_used" INTEGER;

-- AlterTable
ALTER TABLE "ai_service_log_analyses" ADD COLUMN     "anomalies_detected" JSONB DEFAULT '[]',
ADD COLUMN     "common_operations" JSONB DEFAULT '[]',
ADD COLUMN     "health_status" VARCHAR(20),
ADD COLUMN     "log_patterns" JSONB DEFAULT '[]',
ADD COLUMN     "operation_frequency" JSONB DEFAULT '{}',
ADD COLUMN     "operation_success_rate" JSONB DEFAULT '{}',
ADD COLUMN     "performance_metrics" JSONB DEFAULT '{}',
ADD COLUMN     "performance_score" INTEGER,
ADD COLUMN     "recommendations" JSONB DEFAULT '[]',
ADD COLUMN     "service_dependencies" JSONB DEFAULT '[]';

-- CreateIndex
CREATE INDEX "ai_error_analyses_resolution_status_idx" ON "ai_error_analyses"("resolution_status");

-- CreateIndex
CREATE INDEX "ai_error_analyses_assigned_to_idx" ON "ai_error_analyses"("assigned_to");

-- CreateIndex
CREATE INDEX "ai_service_log_analyses_health_status_idx" ON "ai_service_log_analyses"("health_status");
