-- AlterTable
ALTER TABLE "users" ADD COLUMN "profile_image_url" VARCHAR(255),
                    ADD COLUMN "profile_image_updated_at" TIMESTAMPTZ; 