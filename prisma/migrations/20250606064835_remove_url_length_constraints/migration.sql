-- AlterTable
ALTER TABLE "contests" ALTER COLUMN "image_url" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "tokens" ALTER COLUMN "image_url" SET DATA TYPE TEXT,
ALTER COLUMN "header_image_url" SET DATA TYPE TEXT,
ALTER COLUMN "open_graph_image_url" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "user_levels" ALTER COLUMN "icon_url" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "profile_image_url" SET DATA TYPE TEXT;

