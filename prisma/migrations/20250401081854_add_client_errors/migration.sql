-- CreateTable
CREATE TABLE "client_errors" (
    "id" SERIAL NOT NULL,
    "error_id" TEXT NOT NULL,
    "wallet_address" VARCHAR(44),
    "user_id" INTEGER,
    "message" TEXT NOT NULL,
    "level" VARCHAR(20) NOT NULL DEFAULT 'error',
    "stack_trace" TEXT,
    "source_url" TEXT,
    "line_number" INTEGER,
    "column_number" INTEGER,
    "browser" VARCHAR(100),
    "browser_version" VARCHAR(50),
    "os" VARCHAR(50),
    "device" VARCHAR(50),
    "ip_address" VARCHAR(45),
    "session_id" VARCHAR(100),
    "environment" VARCHAR(20),
    "status" VARCHAR(20) DEFAULT 'open',
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" VARCHAR(44),
    "resolution_note" TEXT,
    "is_critical" BOOLEAN DEFAULT false,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "last_occurred_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',
    "tags" TEXT[],

    CONSTRAINT "client_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_errors_error_id_key" ON "client_errors"("error_id");

-- CreateIndex
CREATE INDEX "idx_client_errors_wallet" ON "client_errors"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_client_errors_status" ON "client_errors"("status");

-- CreateIndex
CREATE INDEX "idx_client_errors_created" ON "client_errors"("created_at");

-- CreateIndex
CREATE INDEX "idx_client_errors_occurred" ON "client_errors"("last_occurred_at");

-- CreateIndex
CREATE INDEX "idx_client_errors_critical" ON "client_errors"("is_critical");

-- CreateIndex
CREATE INDEX "idx_client_errors_session" ON "client_errors"("session_id");

-- AddForeignKey
ALTER TABLE "client_errors" ADD CONSTRAINT "client_errors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
