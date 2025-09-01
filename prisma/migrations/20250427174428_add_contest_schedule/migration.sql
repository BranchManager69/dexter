-- AlterTable
ALTER TABLE "contests" ADD COLUMN     "schedule_id" INTEGER;

-- CreateTable
CREATE TABLE "contest_schedule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "template_id" INTEGER NOT NULL,
    "hour" INTEGER,
    "minute" INTEGER DEFAULT 0,
    "days" INTEGER[],
    "entry_fee_override" DECIMAL(20,8),
    "name_override" TEXT,
    "description_override" TEXT,
    "duration_hours" DOUBLE PRECISION DEFAULT 1.0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "advance_notice_hours" INTEGER DEFAULT 1,
    "min_participants_override" INTEGER,
    "max_participants_override" INTEGER,
    "allow_multiple_hours" BOOLEAN NOT NULL DEFAULT false,
    "multiple_hours" INTEGER[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contest_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contest_schedule_enabled_idx" ON "contest_schedule"("enabled");

-- CreateIndex
CREATE INDEX "contest_schedule_template_id_idx" ON "contest_schedule"("template_id");

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "contest_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_schedule" ADD CONSTRAINT "contest_schedule_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "contest_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
