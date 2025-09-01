-- AlterTable
ALTER TABLE "auth_challenges" ADD COLUMN     "credential_id" TEXT;

-- CreateTable
CREATE TABLE "biometric_credentials" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(44) NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "device_info" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used" TIMESTAMPTZ(6),
    "counter" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "biometric_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "biometric_credentials_credential_id_key" ON "biometric_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "idx_biometric_credentials_user" ON "biometric_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "biometric_credentials" ADD CONSTRAINT "biometric_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;
