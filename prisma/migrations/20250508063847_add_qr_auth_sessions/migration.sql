-- CreateTable
CREATE TABLE "qr_auth_sessions" (
  "id" TEXT NOT NULL,
  "session_token" TEXT NOT NULL,
  "session_data" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "user_id" INTEGER,

  CONSTRAINT "qr_auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qr_auth_sessions_session_token_key" ON "qr_auth_sessions"("session_token");

-- CreateIndex
CREATE INDEX "qr_auth_sessions_expires_at_idx" ON "qr_auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "qr_auth_sessions_status_idx" ON "qr_auth_sessions"("status");

-- AddForeignKey
ALTER TABLE "qr_auth_sessions" ADD CONSTRAINT "qr_auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;