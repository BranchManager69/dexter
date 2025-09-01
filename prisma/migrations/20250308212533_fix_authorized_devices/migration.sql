-- CreateTable
CREATE TABLE "authorized_devices" (
    "id" SERIAL NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT,
    "device_type" TEXT,
    "last_used" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "authorized_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_authorized_devices_wallet" ON "authorized_devices"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_authorized_devices_device_id" ON "authorized_devices"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "authorized_devices_wallet_address_device_id_key" ON "authorized_devices"("wallet_address", "device_id");

-- AddForeignKey
ALTER TABLE "authorized_devices" ADD CONSTRAINT "authorized_devices_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;
