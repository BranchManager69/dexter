-- CreateTable
CREATE TABLE "token_socials" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_socials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_websites" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_websites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_socials_token_id_idx" ON "token_socials"("token_id");

-- CreateIndex
CREATE INDEX "token_websites_token_id_idx" ON "token_websites"("token_id");

-- AddForeignKey
ALTER TABLE "token_socials" ADD CONSTRAINT "token_socials_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_websites" ADD CONSTRAINT "token_websites_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;