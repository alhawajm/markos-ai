-- Breaking content contract, accepted for the planned fresh-data development stage.
-- Existing split copy is intentionally discarded. This does not reset any database.
ALTER TABLE "content_items"
  ADD COLUMN "caption" TEXT NOT NULL DEFAULT '',
  DROP COLUMN "captionEn",
  DROP COLUMN "captionAr",
  DROP COLUMN "callToAction",
  DROP COLUMN "hashtags";
