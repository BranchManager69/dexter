-- AlterTable
ALTER TABLE "contest_templates" ADD COLUMN     "allowed_buckets" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9]::INTEGER[],
ADD COLUMN     "default_payout_type" VARCHAR(20) DEFAULT 'top_heavy',
ADD COLUMN     "min_participants" INTEGER DEFAULT 3,
ADD COLUMN     "visibility" VARCHAR(20) DEFAULT 'public',
ALTER COLUMN "max_participants" SET DEFAULT 100;
