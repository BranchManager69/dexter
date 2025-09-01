-- CreateTable
CREATE TABLE "agent_memory" (
    "token_address" VARCHAR(44) NOT NULL,
    "schema_version" TEXT NOT NULL DEFAULT 'v1',
    "interactions_count" INTEGER NOT NULL DEFAULT 0,
    "digest_latest" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_memory_pkey" PRIMARY KEY ("token_address")
);
