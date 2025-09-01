-- AlterTable to add dedicated image URL columns
ALTER TABLE "tokens" ADD COLUMN "header_image_url" VARCHAR(512);
ALTER TABLE "tokens" ADD COLUMN "open_graph_image_url" VARCHAR(512);

-- Add a comment for clarity
COMMENT ON COLUMN "tokens"."header_image_url" IS 'URL to the token header banner image from DexScreener';
COMMENT ON COLUMN "tokens"."open_graph_image_url" IS 'URL to the token OpenGraph image for social sharing from DexScreener';