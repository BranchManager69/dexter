-- CreateTable
CREATE TABLE "system_notices" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255),
    "message" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL DEFAULT 'info',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMPTZ(6),
    "end_date" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_notices_is_active_start_date_end_date_idx" ON "system_notices"("is_active", "start_date", "end_date");
