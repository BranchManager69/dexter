-- CreateTable
CREATE TABLE "rpc_benchmark_results" (
    "id" SERIAL NOT NULL,
    "test_run_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "test_type" TEXT NOT NULL,
    "min_latency" DOUBLE PRECISION,
    "max_latency" DOUBLE PRECISION,
    "avg_latency" DOUBLE PRECISION,
    "median_latency" DOUBLE PRECISION,
    "stdev" DOUBLE PRECISION,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "raw_latencies" JSONB,
    "notes" TEXT,

    CONSTRAINT "rpc_benchmark_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rpc_benchmark_results_test_run_id_idx" ON "rpc_benchmark_results"("test_run_id");

-- CreateIndex
CREATE INDEX "rpc_benchmark_results_provider_idx" ON "rpc_benchmark_results"("provider");

-- CreateIndex
CREATE INDEX "rpc_benchmark_results_method_idx" ON "rpc_benchmark_results"("method");

-- CreateIndex
CREATE INDEX "rpc_benchmark_results_timestamp_idx" ON "rpc_benchmark_results"("timestamp");

-- Add description to system_settings
INSERT INTO "system_settings" ("key", "value", "description", "updated_at")
VALUES (
  'rpc_benchmark_settings', 
  '{"enabled": true, "scheduleIntervalHours": 6, "retentionDays": 30, "defaultEndpoints": ["Helius", "Official", "QuikNode", "BranchRPC"]}',
  'Settings for RPC benchmark service and retention policy',
  NOW()
) ON CONFLICT ("key") DO NOTHING;