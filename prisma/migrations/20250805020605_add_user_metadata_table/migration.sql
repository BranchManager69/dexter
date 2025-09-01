-- CreateTable
CREATE TABLE "user_metadata" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "admin_notes" TEXT,
    "risk_level" TEXT,
    "kyc_status" TEXT,
    "internal_tags" JSONB,
    "custom_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_metadata_user_id_key" ON "user_metadata"("user_id");

-- CreateIndex
CREATE INDEX "user_metadata_user_id_idx" ON "user_metadata"("user_id");

-- AddForeignKey
ALTER TABLE "user_metadata" ADD CONSTRAINT "user_metadata_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
